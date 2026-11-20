// A usage record: who ran, with which role, in which project, plan and task; the numbers the
// harness gave (tokens and cost kept apart), and whether it gave them (`reported`).
// ACP's usage_update (OpenCode) and pi's message usage feed it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-usage-record-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const T = await import(new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url));
const USAGE = join(APP, "data", "bot-herdr", "usage");
const records = (key) => (existsSync(join(USAGE, `${key}.jsonl`)) ? readFileSync(join(USAGE, `${key}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const near = (a, b) => Math.abs(a - b) < 1e-9;

const fake = (name, body) => {
  const file = join(tmp, `${name}.mjs`);
  writeFileSync(file, `const out = (o) => console.log(JSON.stringify(o));\n${body}\n`);
  return file;
};

// OpenCode's shape: usage_update carries the last step's total and the session's running cost;
// the prompt response carries this turn's split. Two turns: cost 0.25 then 0.40.
const ACP = fake("gemini", `
let buf = "";
let cost = 0.25;
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\\n");
process.stdin.on("data", (d) => {
  buf += d;
  let at;
  while ((at = buf.indexOf("\\n")) >= 0) {
    const m = JSON.parse(buf.slice(0, at));
    buf = buf.slice(at + 1);
    if (m.method === "initialize") send({ id: m.id, result: { protocolVersion: 1 } });
    else if (m.method === "session/new") send({ id: m.id, result: { sessionId: "s1" } });
    else if (m.method === "session/prompt") {
      send({ method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "usage_update", used: 1475, size: 200000, cost: { amount: cost, currency: "USD" } } } });
      send({ method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "done" } } } });
      send({ id: m.id, result: { stopReason: "end_turn", usage: { inputTokens: 1000, outputTokens: 50, cachedReadTokens: 400, cachedWriteTokens: 25 } } });
      cost = 0.4;
    }
  }
});
`);

// pi reports each assistant message's usage: the turn's record is their sum.
const PI = fake("pi", `
out({ type: "session", id: "pi-1" });
out({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "part one" }], usage: { input: 700, output: 80, cacheRead: 200, cacheWrite: 10, totalTokens: 990, cost: { total: 0.126 } } } });
out({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "part two" }], usage: { input: 300, output: 20, cacheRead: 100, cacheWrite: 5, totalTokens: 425, cost: { total: 0.05 } } } });
`);

function setTeam(harness, run) {
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({
    agents: [{ role: "dev", harness, model: "" }],
    known: [{ key: harness, name: harness, run: [process.execPath, run], installed: true }],
  }));
}

const agent = (terminal, input, ...args) => spawnSync(process.execPath, [BH, "agent", "dev", ...args], {
  cwd: PROJECT, input, encoding: "utf8", timeout: 20000,
  env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: terminal, PATH: "" },
});

test("ACP usage_update: the turn's split tokens and the rise in the session's cost are recorded", () => {
  setTeam("gemini", ACP);
  const task = T.newTask(PROJECT, { request: "Usage", steps: ["One"] });
  const r = agent("a1", "second\n", "--mode", "child", "--name", "dev-acp", "--parent", "t1", "--task", task.id, "--plan", "p-1", "--", "first");
  assert.equal(r.status, 0, r.err);
  const [first, second] = records("dev-acp-a1");
  assert.deepEqual([first.agent, first.role, first.harness, first.project, first.plan, first.task, first.step], ["dev-acp", "dev", "gemini", PROJECT, "p-1", task.id, null]);
  assert.deepEqual([first.input, first.output, first.cacheRead, first.cacheWrite], [1000, 50, 400, 25]);
  assert.ok(near(first.costUsd, 0.25));
  assert.deepEqual(first.reported, { tokens: true, cost: true });
  assert.equal(typeof first.ms, "number");
  // usage_update's cost is the session's running total: each turn keeps its own rise
  assert.ok(near(second.costUsd, 0.15));
});

test("pi's message usage: its assistant messages' numbers are summed for the turn", () => {
  setTeam("pi", PI);
  assert.equal(agent("p1", "", "--mode", "child", "--name", "dev-pi", "--", "hello").status, 0);
  const [rec] = records("dev-pi-p1");
  assert.deepEqual([rec.input, rec.output, rec.cacheRead, rec.cacheWrite], [1000, 100, 300, 15]);
  assert.ok(near(rec.costUsd, 0.176));
  assert.deepEqual(rec.reported, { tokens: true, cost: true });
  assert.deepEqual([rec.role, rec.project, rec.plan], ["dev", PROJECT, null]);
});
