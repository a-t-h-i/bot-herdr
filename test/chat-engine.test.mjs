// The chat's event log, engine side: every turn appended as one `{ id, at, kind, name, space, text }`
// line before the display copy, a question card ending the wait instead of a false silent note, a
// hand-written `bh reply` never shadowed by an older log, and a turn listener that cannot end a turn.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-chat-engine-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
const DATA = join(APP, "data", "bot-herdr");
const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

const lines = (file) => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("logReply appends one whole event per turn, unique ids, and trims by rename", async () => {
  const { logReply, REPLY_LOG_MAX } = await lib("lib/agent.mjs");
  const dir = join(tmp, "log");
  const file = join(dir, "t1.jsonl");
  process.env.HERDR_SPACE = "dev";
  logReply(file, { at: "2026-11-21T10:00:00.000Z", kind: "reply", name: "Dev", text: "one" });
  delete process.env.HERDR_SPACE;
  logReply(file, { text: "two" });
  const first = lines(file);
  assert.deepEqual(Object.keys(first[0]).sort(), ["at", "id", "kind", "name", "space", "text"]);
  assert.equal(first[0].kind, "reply");
  assert.equal(first[0].name, "Dev");
  assert.equal(first[0].space, "dev");
  assert.equal(first[0].text, "one");
  assert.equal(first[1].kind, "reply");
  assert.equal(first[1].name, null);
  assert.equal(first[1].space, null);
  assert.ok(Number.isFinite(Date.parse(first[1].at)));

  // Many events in the same millisecond still have their own id.
  for (let i = 0; i < 200; i++) logReply(file, { text: `tight ${i}` });
  const ids = lines(file).map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);

  // Past the cap the log keeps its newest half, and a rewrite leaves no temporary file behind.
  for (let i = 0; i < REPLY_LOG_MAX; i++) logReply(file, { text: `n${i}` });
  const kept = lines(file);
  assert.ok(kept.length <= REPLY_LOG_MAX);
  assert.equal(kept.at(-1).text, `n${REPLY_LOG_MAX - 1}`);
  assert.equal(new Set(kept.map((l) => l.id)).size, kept.length);
  assert.deepEqual(readdirSync(dir).filter((n) => n.includes(".tmp")), []);
});

test("harness words cannot drive the terminal: OSC and DCS go, text and styling stay", async () => {
  const { stripUnsafeEscapes } = await lib("lib/agent.mjs");
  assert.equal(stripUnsafeEscapes("\x1b]7501;state=done\x1b\\Done."), "Done.");
  assert.equal(stripUnsafeEscapes("\x1b]52;c;cGFzdGU=\x07copied"), "copied");
  assert.equal(stripUnsafeEscapes("\x1bP1;2;3qpayload\x1b\\text"), "text");
  assert.equal(stripUnsafeEscapes("\x1b[31mred\x1b[0m and \x1b]0;title\x07plain"), "\x1b[31mred\x1b[0m and plain");
  assert.equal(stripUnsafeEscapes("plain\n\ttabs"), "plain\n\ttabs");

  // Nested, split and 8-bit C1 sequences leave no OSC or DCS behind, only the text around them.
  assert.equal(stripUnsafeEscapes("\x1b]7501;state=\x1b]0;\x07done\x07"), "done\x07");
  assert.equal(stripUnsafeEscapes("\x1b]7501;state=\x1bP\x1b\\done\x07"), "done\x07");
  assert.equal(stripUnsafeEscapes("\x1b]7501;state=done\x9c"), "");
  assert.equal(stripUnsafeEscapes("\x9d7501;state=done\x9c"), "");
  assert.equal(stripUnsafeEscapes("\x1b[1mbold\x1b[0m\x9d0;t\x9c\x1b[32mgreen\x1b[0m"), "\x1b[1mbold\x1b[0m\x1b[32mgreen\x1b[0m");

  // An introducer that never terminates takes the rest of the line with it, and a bare one goes too.
  assert.equal(stripUnsafeEscapes("\x1b]7501;state=open"), "");
  assert.equal(stripUnsafeEscapes("\x1bP1;2q"), "");
  assert.equal(stripUnsafeEscapes("\x9d7501;state=open"), "");
  assert.equal(stripUnsafeEscapes("\x907501;state=open"), "");
  assert.equal(stripUnsafeEscapes("before\x1b]"), "before");
  for (const payload of ["\x1b]7501;state=\x1b]0;\x07done\x07", "\x1b]7501;state=\x1bP\x1b\\done\x07", "\x1b]7501;state=done\x9c", "\x9d7501;state=done\x9c", "\x1b]open", "\x90open"]) {
    assert.doesNotMatch(stripUnsafeEscapes(payload), /\x1b[\]P]|[\x9d\x90]/, `live sequence in ${JSON.stringify(payload)}`);
  }
});

test("bh reply appends to the log the chat reads, even when the log exists", () => {
  mkdirSync(join(DATA, "replies"), { recursive: true });
  const log = join(DATA, "replies", "r1.jsonl");
  writeFileSync(log, JSON.stringify({ at: "2026-11-21T09:00:00.000Z", name: "Dev", text: "from a turn" }) + "\n");
  const r = spawnSync(process.execPath, [BH, "reply", "--as", "r1", "--from", "Dev", "typed by hand"], {
    cwd: PROJECT, encoding: "utf8", timeout: 20000,
    env: { ...process.env, BH_APP_HOME: APP, HERDR_SPACE: "", PATH: "" },
  });
  assert.equal(r.status, 0, r.stderr);
  const got = lines(log);
  assert.equal(got.length, 2);
  assert.equal(got[0].text, "from a turn");
  assert.equal(got[1].kind, "reply");
  assert.equal(got[1].text, "typed by hand");
  assert.equal(got[1].name, "Dev");
  assert.equal(got[1].space, null);
  assert.ok(Number.isFinite(Date.parse(got[1].at)));
  assert.match(readFileSync(join(DATA, "replies", "r1.md"), "utf8"), /^typed by hand\n\n<!-- bh /);
});

test("a turn ending on bh ask logs `asked` and leaves the display copy alone", () => {
  const fake = join(tmp, "asked-claude.mjs");
  writeFileSync(fake, `import { readFileSync } from "node:fs";
readFileSync(0, "utf8");
const out = (o) => console.log(JSON.stringify(o));
out({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "node bh.mjs ask --file q.md" } }] } });
out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "Asked (q1, 1 question)." }] } });
`);
  mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, "agents.json"), JSON.stringify({
    agents: [{ role: "dev", harness: "claude", model: "", effort: "" }],
    known: [{ key: "claude", name: "claude", run: [process.execPath, fake], installed: true }],
  }));
  mkdirSync(join(DATA, "replies"), { recursive: true });
  const shown = "an earlier reply\n\n<!-- bh 2026-11-21T08:00:00.000Z -->\n";
  writeFileSync(join(DATA, "replies", "q1.md"), shown);
  const r = spawnSync(process.execPath, [BH, "agent", "dev", "--", "please ask"], {
    cwd: PROJECT, input: "", encoding: "utf8", timeout: 20000,
    env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "q1", PATH: "" },
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const got = lines(join(DATA, "replies", "q1.jsonl"));
  assert.equal(got.length, 1);
  assert.equal(got.at(-1).kind, "asked");
  assert.equal(got.at(-1).text, "");
  assert.equal(got.at(-1).name, "Dev");
  assert.ok(Number.isFinite(Date.parse(got.at(-1).at)));
  assert.equal(readFileSync(join(DATA, "replies", "q1.md"), "utf8"), shown); // no turn's words to show
});

test("a throwing turn listener neither ends the turn nor drops its reply", async () => {
  const { turn } = await lib("lib/runner.mjs");
  const fake = join(tmp, "boom-claude.mjs");
  writeFileSync(fake, `import { readFileSync } from "node:fs";
const prompt = readFileSync(0, "utf8");
const out = (o) => console.log(JSON.stringify(o));
out({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "a.js" } }, { type: "text", text: "Looking." }] } });
if (prompt.includes("ask")) {
  out({ type: "assistant", message: { content: [{ type: "tool_use", name: "AskUserQuestion", input: { questions: [{ question: "Which?", header: "Pick", options: [{ label: "A" }] }] } }] } });
} else {
  out({ type: "result", subtype: "success", result: "Done with the work" });
}
`);
  const opts = (prompt) => ({
    agent: { harness: "claude", model: "" },
    known: [{ key: "claude", name: "claude", run: [process.execPath, fake], installed: true }],
    state: { harness: "claude", session: null, root: PROJECT },
    briefFile: join(tmp, "brief.md"),
    prompt,
    cwd: PROJECT,
    on: () => {
      throw new Error("the output pipe is closed");
    },
    access: "standard",
    allow: [],
  });
  const talked = await turn(opts("talk")).done;
  assert.equal(talked.error, null);
  assert.equal(talked.text, "Done with the work");
  const asked = await turn(opts("ask")).done;
  assert.equal(asked.error, null);
  assert.equal(asked.asked, true);
});
