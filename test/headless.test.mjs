// Agents run headless: the runner's pieces, and `bh agent` end to end against fake harnesses
// that speak each harness's JSON (Claude Code, Codex, pi, and an Agent Client Protocol one).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-headless-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

test("tool lines are short and plain", async () => {
  const { toolLine } = await lib("lib/runner.mjs");
  assert.equal(toolLine("Read", { file_path: "src/app.tsx" }), "Read src/app.tsx");
  assert.equal(toolLine("Bash", { command: "npm test\nmore" }), "Run npm test");
  assert.equal(toolLine("TodoWrite", {}), "Update its plan");
});

test("standard access: edits and the team's tools; full only when chosen", async () => {
  const { claudeAccess, acpAllowed } = await lib("lib/runner.mjs");
  const std = claudeAccess("standard", ["npm test"]);
  assert.deepEqual(std.slice(0, 2), ["--permission-mode", "acceptEdits"]);
  assert.match(std[3], /Bash\(hc:\*\)/);
  assert.match(std[3], /Bash\(npm test:\*\)/);
  assert.doesNotMatch(std.join(" "), /bypass/i);
  assert.deepEqual(claudeAccess("full"), ["--permission-mode", "bypassPermissions"]);
  assert.equal(acpAllowed("edit", "standard"), true);
  assert.equal(acpAllowed("execute", "standard", { command: "rm -rf build" }), false);
  assert.equal(acpAllowed("execute", "standard", { command: "hc send t1 done" }), true);
  assert.equal(acpAllowed("execute", "standard", { command: "hc ls; rm -rf x" }), false);
  assert.equal(acpAllowed("execute", "standard", { command: "npm test -- x", allow: ["npm test"] }), true);
  assert.equal(acpAllowed("execute", "standard", { command: "npm testify", allow: ["npm test"] }), false);
  assert.equal(acpAllowed("delete", "standard"), false);
  assert.equal(acpAllowed("execute", "full", { command: "anything" }), true);
});

test("keys: bracketed pastes, Enter, a paste without brackets, Esc and split sequences", async () => {
  const { Keys } = await lib("lib/agent.mjs");
  const got = [];
  let timer = null;
  const keys = new Keys({
    line: (l) => got.push(l),
    esc: () => got.push("<esc>"),
    interrupt: () => got.push("<ctrl-c>"),
    eof: () => got.push("<eof>"),
    timers: { set: (fn) => (timer = fn), clear: () => (timer = null) },
  });
  const settle = () => {
    const fn = timer;
    timer = null;
    fn?.();
  };
  keys.feed("\x1b[200~one\ntwo\x1b[201~\r");
  settle();
  keys.feed("\x1b[200~split\x1b[2");
  keys.feed("01~\r");
  settle();
  keys.feed("line a\rline b\r"); // no brackets: only the last Enter sends
  settle();
  keys.feed("typed");
  keys.feed("\r");
  keys.feed("more"); // more input right after Enter: it was a new line
  keys.feed("\r");
  settle();
  keys.feed("\x1b");
  keys.feed("\x1b[A"); // an arrow: ignored
  keys.feed("\x03\x04");
  assert.deepEqual(got, ["one\ntwo", "split", "line a\nline b", "typed\nmore", "<esc>", "<ctrl-c>", "<eof>"]);
});

test("status reports and reply stamps", async () => {
  const { statusReport, replyText } = await lib("lib/agent.mjs");
  const { replyBody, isNew } = await import("../mods/bot-herdr/feed.js");
  assert.equal(statusReport("working", { app: "claude-code", title: "Dev", msg: "Read x" }), `\x1b]7501;state=working:app=claude-code:title=${btoa("Dev")}:msg=${btoa("Read x")}\x1b\\`);
  const a = replyText("Done.");
  assert.equal(replyBody(a), "Done.");
  assert.ok(isNew(a, replyText("Done.").replace(/bh [^ ]+/, "bh earlier")));
  assert.equal(isNew("<!-- bh x -->\n", null), false);
});

// ── bh agent against fake harnesses ────────────────────────────────────────────────────────

const LOG = join(tmp, "calls.jsonl");
const fake = (name, body) => {
  const file = join(tmp, `${name}.mjs`);
  writeFileSync(file, `import { appendFileSync, readFileSync } from "node:fs";\nconst log = (x) => appendFileSync(${JSON.stringify(LOG)}, JSON.stringify(x) + "\\n");\nconst out = (o) => console.log(JSON.stringify(o));\n${body}\n`);
  return file;
};

const FAKES = {
  claude: fake("claude", `
    const prompt = readFileSync(0, "utf8");
    log({ harness: "claude", argv: process.argv.slice(2), prompt });
    out({ type: "system", subtype: "init" });
    if (prompt.includes("please ask")) {
      out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "node bh.mjs ask --file q.md" } }] } });
      setTimeout(() => {
        log({ harness: "claude", got: "ask-result" });
        out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "Asked (q1, 1 question)." }] } });
      }, 300);
    } else {
      out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "src/x.js" } }] } });
      out({ type: "result", subtype: "success", result: "Claude says: " + prompt.trim() });
    }
  `),
  codex: fake("codex", `
    const prompt = readFileSync(0, "utf8");
    log({ harness: "codex", argv: process.argv.slice(2), prompt });
    out({ type: "thread.started", thread_id: "th-1" });
    if (prompt.includes("please ask")) {
      out({ type: "item.started", item: { type: "command_execution", command: "node bh.mjs ask --file q.md" } });
      setTimeout(() => {
        log({ harness: "codex", got: "ask-completed" });
        out({ type: "item.completed", item: { type: "command_execution", command: "node bh.mjs ask --file q.md", status: "completed" } });
      }, 300);
    } else {
      out({ type: "item.started", item: { type: "command_execution", command: "ls" } });
      out({ type: "item.completed", item: { type: "agent_message", text: "Codex says: " + prompt.trim().split("\\n").pop() } });
      out({ type: "turn.completed" });
    }
  `),
  pi: fake("pi", `
    const prompt = readFileSync(0, "utf8");
    log({ harness: "pi", argv: process.argv.slice(2), prompt });
    out({ type: "session", id: "pi-1" });
    if (prompt.includes("please ask")) {
      out({ type: "tool_execution_start", toolCallId: "tc9", toolName: "bash", args: { command: "node bh.mjs ask --file q.md" } });
      setTimeout(() => {
        log({ harness: "pi", got: "ask-end" });
        out({ type: "tool_execution_end", toolCallId: "tc9" });
      }, 300);
    } else {
      out({ type: "tool_execution_start", toolName: "bash", args: { command: "npm test" } });
      out({ type: "message_end", message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "pi says: " + prompt.trim() }] } });
    }
  `),
  gemini: fake("gemini", `
    let buf = "";
    let pending = null;
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
          log({ harness: "gemini", argv: process.argv.slice(2), prompt: m.params.prompt[0].text });
          pending = m.id;
          if (m.params.prompt[0].text.includes("please ask")) {
            send({ method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "tool_call", toolCallId: "c9", title: "Shell", kind: "execute", rawInput: { command: "node bh.mjs ask --file q.md" } } } });
            send({ id: 901, method: "session/request_permission", params: { sessionId: "s1", toolCall: { toolCallId: "c9", kind: "execute", title: "Shell", rawInput: { command: "node bh.mjs ask --file q.md" } }, options: [{ optionId: "yes", kind: "allow_once" }, { optionId: "no", kind: "reject_once" }] } });
          } else {
            send({ method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "tool_call", title: "Shell", kind: "execute", rawInput: { command: "rm -rf build" } } } });
            send({ id: 900, method: "session/request_permission", params: { sessionId: "s1", toolCall: { kind: "execute", title: "rm -rf build", rawInput: { command: "rm -rf build" } }, options: [{ optionId: "yes", kind: "allow_once" }, { optionId: "no", kind: "reject_once" }] } });
          }
        } else if (m.id === 900) {
          log({ harness: "gemini", permission: m.result.outcome });
          send({ method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Gemini says hi" } } } });
          send({ id: pending, result: { stopReason: "end_turn" } });
        } else if (m.id === 901) {
          log({ harness: "gemini", askPermission: m.result.outcome });
          if (m.result.outcome && m.result.outcome.outcome === "selected" && m.result.outcome.optionId === "yes") {
            send({ method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "tool_call_update", toolCallId: "c9", status: "completed" } } });
          } else {
            send({ method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Gemini says hi" } } } });
            send({ id: pending, result: { stopReason: "end_turn" } });
          }
        } else if (m.method === "session/cancel") {
          log({ harness: "gemini", got: "cancel" });
          send({ id: pending, result: { stopReason: "cancelled" } });
        }
      }
    });`),
};

function setTeam(harness) {
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({
    agents: [{ role: "dev", harness, model: harness === "claude" ? "claude-sonnet-5-5" : "", effort: "" }],
    known: [{ key: harness, name: harness, run: [process.execPath, FAKES[harness]], installed: true }],
  }));
}

const calls = (harness) => (existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.harness === harness) : []);

function agent(terminal, input, ...args) {
  const r = spawnSync(process.execPath, [BH, "agent", "dev", ...args], {
    cwd: PROJECT, input, encoding: "utf8", timeout: 20000,
    env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: terminal, PATH: "" },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const reply = (terminal) => readFileSync(join(APP, "data", "bot-herdr", "replies", `${terminal}.md`), "utf8");

test("bh agent: Claude Code turns resume one session; the answer is the chat's reply", () => {
  setTeam("claude");
  const r = agent("c1", "and again\n", "--", "hello");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Read src\/x\.js/);
  assert.match(r.out, /Claude says: hello/);
  const [first, second] = calls("claude");
  assert.ok(first.argv.includes("--session-id"));
  assert.ok(first.argv.includes("--append-system-prompt-file"));
  assert.equal(first.argv[first.argv.indexOf("--permission-mode") + 1], "acceptEdits");
  const brief = readFileSync(first.argv[first.argv.indexOf("--append-system-prompt-file") + 1], "utf8");
  assert.match(brief, /## Child agents/);
  assert.match(brief, /Your last message of each turn is your reply/);
  assert.equal(second.argv[second.argv.indexOf("--resume") + 1], first.argv[first.argv.indexOf("--session-id") + 1]);
  assert.match(reply("c1"), /^Claude says: and again\n\n<!-- bh /);
});

test("bh agent: Codex resumes its thread and gets the brief in its first prompt", () => {
  setTeam("codex");
  assert.equal(agent("x1", "second\n", "--", "first").code, 0);
  const [a, b] = calls("codex");
  assert.deepEqual(a.argv.slice(0, 5), ["exec", "--json", "--skip-git-repo-check", "-s", "workspace-write"]);
  assert.match(a.prompt, /\[bot-herdr brief: you are Dev/);
  assert.deepEqual(b.argv.slice(-3), ["resume", "th-1", "-"]);
  assert.doesNotMatch(b.prompt, /bot-herdr brief/);
  assert.match(reply("x1"), /Codex says: second/);
});

test("bh agent: pi keeps its session folder and continues it", () => {
  setTeam("pi");
  assert.equal(agent("p1", "two\n", "--", "one").code, 0);
  const [a, b] = calls("pi");
  assert.ok(a.argv.includes("--session-dir"));
  assert.ok(!a.argv.includes("--continue"));
  assert.ok(b.argv.includes("--continue"));
  assert.match(reply("p1"), /pi says: two/);
});

test("bh agent: an ACP agent is refused a command outside standard access", () => {
  setTeam("gemini");
  assert.equal(agent("g1", "", "--", "hi").code, 0);
  const [prompted, permission] = calls("gemini");
  assert.deepEqual(prompted.argv, ["--acp"]);
  assert.match(prompted.prompt, /bot-herdr brief/);
  assert.deepEqual(permission.permission, { outcome: "selected", optionId: "no" });
  assert.match(reply("g1"), /Gemini says hi/);
});

test("bh agent: a child agent's answer reaches the chat too, and it reports to its parent", () => {
  setTeam("claude");
  assert.equal(agent("k1", "", "--mode", "child", "--name", "fix-x", "--parent", "t3", "--", "go").code, 0);
  assert.equal(existsSync(join(APP, "data", "bot-herdr", "replies", "k1.md")), true);
  const brief = readFileSync(join(APP, "data", "bot-herdr", "briefs", "fix-x-k1.md"), "utf8");
  assert.match(brief, /hc send t3/);
});

test("bh agent: a Claude bh ask runs to its card before the turn ends", () => {
  setTeam("claude");
  const r = agent("c9", "", "--", "please ask");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /ask --file q\.md/);
  // the harness was not killed at the tool call's start: the ask command ran to its result
  assert.ok(calls("claude").some((c) => c.got === "ask-result"));
  assert.equal(existsSync(join(APP, "data", "bot-herdr", "replies", "c9.md")), false); // the card says it
});

test("bh agent: a Codex bh ask runs to its card before the turn ends", () => {
  setTeam("codex");
  const r = agent("x9", "", "--", "please ask");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /ask --file q\.md/);
  assert.ok(calls("codex").some((c) => c.got === "ask-completed"));
  assert.equal(existsSync(join(APP, "data", "bot-herdr", "replies", "x9.md")), false);
});

test("bh agent: a pi bh ask runs to its card before the turn ends", () => {
  setTeam("pi");
  const r = agent("p9", "", "--", "please ask");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /ask --file q\.md/);
  assert.ok(calls("pi").some((c) => c.got === "ask-end"));
  assert.equal(existsSync(join(APP, "data", "bot-herdr", "replies", "p9.md")), false);
});

test("bh agent: an ACP agent's bh ask is allowed and the turn waits for the card", () => {
  setTeam("gemini");
  const r = agent("g2", "", "--", "please ask");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /ask --file q\.md/);
  const gs = calls("gemini");
  const asked = gs.find((c) => c.askPermission);
  assert.deepEqual(asked.askPermission, { outcome: "selected", optionId: "yes" }); // not cancelled
  // the cancel reaches the agent only after the ask call completed (the card is made)
  assert.ok(gs.findIndex((c) => c.got === "cancel") > gs.findIndex((c) => c.askPermission));
  assert.equal(existsSync(join(APP, "data", "bot-herdr", "replies", "g2.md")), false);
});
