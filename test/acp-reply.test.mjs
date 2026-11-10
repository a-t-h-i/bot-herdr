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

test("ACP sets the chosen model, warns when refused, and follows a later change", async () => {
  const acp = new Acp({ agent: { harness: "opencode", model: "grok-code-1" }, known: [{ key: "opencode", name: "OpenCode", run: ["opencode"] }], cwd: ".", access: "full", allow: [] });
  const events = [];
  const asked = [];
  acp.on = (e) => events.push(e.line);
  acp.child = {}; // already started: no process is spawned here
  acp.session = "s1";
  acp.newResult = { models: ["grok-code-1", "qwen3-coder"] };
  acp.request = (method, params) => { asked.push(method); return Promise.resolve(method === "session/prompt" ? { result: { stopReason: "end_turn" } } : { result: {} }); };
  await acp.turn({ brief: "b", prompt: "hi", on: (e) => events.push(e.line) }).done;
  assert.deepEqual(asked, ["session/set_model", "session/prompt"]);
  assert.equal(acp.modelSet, "grok-code-1");
  // a model changed in Settings reaches the live session on its next turn
  asked.length = 0;
  acp.agent = { ...acp.agent, model: "qwen3-coder" };
  await acp.turn({ brief: "b", prompt: "again", on: (e) => events.push(e.line) }).done;
  assert.deepEqual(asked, ["session/set_model", "session/prompt"]);
  // a harness that refuses says so instead of silently running its default
  acp.request = (method) => { asked.push(method); return Promise.resolve({ error: { message: "not supported" } }); };
  acp.agent = { ...acp.agent, model: "grok-code-1" };
  await acp.turn({ brief: "b", prompt: "third", on: (e) => events.push(e.line) }).done;
  assert.ok(events.some((l) => /Model grok-code-1 not set/.test(l)));
  // and one that offered neither way gets the standard call, then the legacy one, then says so
  acp.newResult = {};
  acp.modelSet = null;
  asked.length = 0;
  acp.request = (method) => { asked.push(method); return Promise.resolve({ error: { message: "no" } }); };
  await acp.pickModel();
  assert.deepEqual(asked, ["session/set_config_option", "session/set_model"]);
  assert.ok(events.some((l) => /Model grok-code-1 not set/.test(l)));
});

test("ACP prefers the harness's own model config option when it offers one", async () => {
  const cfg = new Acp({ agent: { harness: "gemini", model: "gemini-3.8-pro" }, known: [{ key: "gemini", name: "Gemini", run: ["gemini"] }], cwd: ".", access: "full", allow: [] });
  cfg.session = "s2";
  cfg.newResult = { configOptions: [{ id: "model", category: "model" }] };
  const calls = [];
  cfg.request = (method, params) => { calls.push([method, params]); return Promise.resolve({ result: {} }); };
  cfg.on = () => {};
  await cfg.pickModel();
  assert.deepEqual(calls, [["session/set_config_option", { sessionId: "s2", configId: "model", value: "gemini-3.8-pro" }]]);
  assert.equal(cfg.modelSet, "gemini-3.8-pro");
});
