#!/usr/bin/env node
// Minimal test runner: esbuild-bundle the pure (vscode-free) modules under test
// into .test-build/, then run Node's built-in test runner over tests/.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".test-build");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: {
    PreviewProxy: join(ROOT, "src/preview/PreviewProxy.ts"),
    transcript: join(ROOT, "src/agents/transcript.ts"),
    persistence: join(ROOT, "src/persistence.ts"),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: OUT,
  outExtension: { ".js": ".mjs" }, // so Node loads them as ES modules
  packages: "external",
});

const testFiles = readdirSync(join(ROOT, "tests"))
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => join(ROOT, "tests", f));

// --test-force-exit: our HTTP/proxy tests leave keep-alive sockets that would
// otherwise keep the event loop alive after all tests pass. Force exit on done.
const res = spawnSync("node", ["--test", "--test-force-exit", ...testFiles], {
  stdio: "inherit",
  cwd: ROOT,
});
process.exit(res.status ?? 1);
