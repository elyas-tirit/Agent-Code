import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAgentEvent, addUserMessage } from "../.test-build/transcript.mjs";

test("text deltas accumulate into one streaming assistant message", () => {
  const msgs = [];
  applyAgentEvent(msgs, { kind: "text", delta: "Hello " });
  applyAgentEvent(msgs, { kind: "text", delta: "world" });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].role, "assistant");
  assert.equal(msgs[0].text, "Hello world");
  assert.equal(msgs[0].streaming, true);
});

test("reasoning deltas accumulate separately from text", () => {
  const msgs = [];
  applyAgentEvent(msgs, { kind: "reasoning", delta: "thinking…" });
  applyAgentEvent(msgs, { kind: "text", delta: "answer" });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].reasoning, "thinking…");
  assert.equal(msgs[0].text, "answer");
});

test("tool events append, then update in place by id", () => {
  const msgs = [];
  applyAgentEvent(msgs, { kind: "tool", tool: { id: "t1", name: "Read", state: "running" } });
  applyAgentEvent(msgs, { kind: "tool", tool: { id: "t1", state: "done" } });
  applyAgentEvent(msgs, { kind: "tool", tool: { id: "t2", name: "Bash", state: "running" } });
  const tools = msgs[0].tools;
  assert.equal(tools.length, 2);
  assert.equal(tools[0].id, "t1");
  assert.equal(tools[0].state, "done");
  assert.equal(tools[0].name, "Read"); // preserved across the update
  assert.equal(tools[1].id, "t2");
});

test("done finalizes the open assistant message", () => {
  const msgs = [];
  applyAgentEvent(msgs, { kind: "text", delta: "hi" });
  const changed = applyAgentEvent(msgs, { kind: "done" });
  assert.equal(changed, true);
  assert.equal(msgs[0].streaming, false);
});

test("done on an empty transcript is a no-op", () => {
  const msgs = [];
  assert.equal(applyAgentEvent(msgs, { kind: "done" }), false);
  assert.equal(msgs.length, 0);
});

test("a text delta after done starts a fresh assistant message", () => {
  const msgs = [];
  applyAgentEvent(msgs, { kind: "text", delta: "first" });
  applyAgentEvent(msgs, { kind: "done" });
  applyAgentEvent(msgs, { kind: "text", delta: "second" });
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].text, "first");
  assert.equal(msgs[1].text, "second");
  assert.equal(msgs[1].streaming, true);
});

test("addUserMessage finalizes an open assistant turn, then appends the user", () => {
  const msgs = [];
  applyAgentEvent(msgs, { kind: "text", delta: "streaming…" });
  addUserMessage(msgs, "next question", [{ id: "a1", kind: "file", name: "x.ts" }]);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].streaming, false);
  assert.equal(msgs[1].role, "user");
  assert.equal(msgs[1].text, "next question");
  assert.equal(msgs[1].attachments.length, 1);
});
