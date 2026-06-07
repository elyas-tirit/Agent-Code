import { test } from "node:test";
import assert from "node:assert/strict";
import { JsonFileStore } from "../.test-build/persistence.mjs";
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmpFile(name = "store.json") {
  return join(mkdtempSync(join(tmpdir(), "ac-store-")), name);
}

test("read returns fallback when the file is missing", () => {
  const s = new JsonFileStore(tmpFile());
  assert.equal(s.exists(), false);
  assert.deepEqual(s.read(["fallback"]), ["fallback"]);
});

test("write then read round-trips", async () => {
  const s = new JsonFileStore(tmpFile());
  await s.write([{ id: "a", n: 1 }]);
  assert.equal(s.exists(), true);
  assert.deepEqual(s.read([]), [{ id: "a", n: 1 }]);
});

test("corrupt file falls back instead of throwing", () => {
  const f = tmpFile();
  writeFileSync(f, "{ this is not json");
  const s = new JsonFileStore(f);
  assert.deepEqual(s.read([]), []);
});

test("coalesced writes converge on the last value and leave no temp file", async () => {
  const f = tmpFile();
  const s = new JsonFileStore(f);
  await Promise.all([s.write([1]), s.write([2]), s.write([3])]);
  assert.deepEqual(s.read([]), [3]);
  const leftovers = readdirSync(join(f, "..")).filter((n) => n.endsWith(".tmp"));
  assert.deepEqual(leftovers, []); // atomic rename cleaned up
});

test("flushSync persists the last queued value synchronously", () => {
  const f = tmpFile();
  const s = new JsonFileStore(f);
  void s.write([{ v: "queued" }]); // don't await — simulate shutdown mid-flight
  s.flushSync();
  assert.equal(existsSync(f), true);
  assert.deepEqual(s.read([]), [{ v: "queued" }]);
});

test("flushSync with nothing written is a no-op", () => {
  const f = tmpFile();
  const s = new JsonFileStore(f);
  s.flushSync();
  assert.equal(existsSync(f), false);
});
