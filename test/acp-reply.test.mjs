import { test } from "node:test";
import assert from "node:assert/strict";
import { Acp, HEADLESS } from "../mods/bot-herdr/engine/lib/runner.mjs";

test("antigravity runs headless over ACP", () => {
  assert.deepEqual(HEADLESS.antigravity, { app: "antigravity", acp: ["acp"] });
});

test("ACP argv uses the harness run command plus its ACP mode", () => {
  const acp = new Acp({ agent: { harness: "antigravity", model: "", args: "" }, known: [{ key: "antigravity", run: ["agy"] }], cwd: ".", access: "standard", allow: [] });
  assert.deepEqual(acp.argv, ["agy", "acp"]);
});

test("ACP keeps the last non-empty reply text across tool calls", () => {
  const acp = new Acp({ agent: { harness: "gemini", model: "" }, known: [{ key: "gemini", run: ["gemini"] }], cwd: ".", access: "standard", allow: [] });
  const events = [];
  acp.on = (e) => events.push(e);
  acp.message({ method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } } } });
  acp.message({ method: "session/update", params: { update: { sessionUpdate: "tool_call", title: "Read", kind: "read", rawInput: { file_path: "x" } } } });
  assert.equal(acp.text, "Hello");
  acp.message({ method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " world" } } } });
  // a new block after a tool call replaces the previous reply text
  assert.equal(acp.text, " world");
  acp.message({ method: "session/update", params: { update: { sessionUpdate: "tool_call", title: "Shell", kind: "execute", rawInput: { command: "bh reply --file x" } } } });
  // ending after a tool call with no words after it keeps the last non-empty text
  assert.equal(acp.text, " world");
  assert.equal(events.filter((e) => e.kind === "tool").length, 2);
});
