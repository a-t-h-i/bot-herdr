// Regression tests for GitHub issue #1 (QuickJS render interrupt in chat/composer):
// - roster() and migrateArgs() stay safe on malformed/legacy/null inputs without mutating them.
// - Composer.render() and Chat.render() read shared(ROSTER_KEY) and bridge state once per frame,
//   never per known harness, per suggestion row, per inline token, or per visible message.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ROSTER_KEY, roster, migrateArgs } from "../mods/bot-herdr/roster.js";

const MODS = fileURLToPath(new URL("../mods/bot-herdr", import.meta.url));
const modSrc = (name) => readFileSync(fileURLToPath(new URL(`../mods/bot-herdr/${name}`, import.meta.url)), "utf8");

// Shared mutable spy state read by the mocked herdr/gpui modules below.
const state = {
  sharedMap: new Map(),
  agents: [],
  panes: [],
  spaces: [{ id: "s1", name: "Main", active: true, tabs: [{ id: "tab1", index: 0, name: "Orchestrator" }] }],
  terminals: [],
  focused: { space: "s1" },
  tokenCallbacks: [],
  counts: {
    shared: new Map(),
    agents: 0,
    panes: 0,
    spaces: 0,
    terminals: 0,
    focused: 0,
  },
};
globalThis.__BH_ISSUE1_TEST_STATE__ = state;

const resetCounts = () => {
  state.counts.shared.clear();
  state.counts.agents = 0;
  state.counts.panes = 0;
  state.counts.spaces = 0;
  state.counts.terminals = 0;
  state.counts.focused = 0;
  state.tokenCallbacks = [];
};

const HOOK = `
import { readdirSync, readFileSync } from "node:fs";
const MODS = ${JSON.stringify(MODS)};
const BARE = ["gpui-kit", "gpui-base", "herdr", "fs/promises"];
const names = new Map(BARE.map((s) => [s, new Set()]));
for (const f of readdirSync(MODS)) {
  if (!f.endsWith(".js")) continue;
  const src = readFileSync(MODS + "/" + f, "utf8");
  for (const m of src.matchAll(/import\\s+\\{([\\s\\S]*?)\\}\\s*from\\s*["']([^"']+)["']/g)) {
    if (!names.has(m[2])) continue;
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\\s+as\\s+/)[0].trim();
      if (name) names.get(m[2]).add(name);
    }
  }
}
const FS = 'export * from "node:fs/promises"; export const exists = async () => false;';
const GPUI_HELPER = \`
const chain = () => {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_t, k) {
      if (k === "then" || typeof k === "symbol") return undefined;
      if (k === "when") return (cond, cb) => { if (cond) cb(proxy); return proxy; };
      if (k === "token") return (cb) => { globalThis.__BH_ISSUE1_TEST_STATE__.tokenCallbacks.push(cb); return proxy; };
      if (k === "value") return () => "";
      if (k === "content") return () => ({ text: "", tokens: [] });
      if (k === "tokens") return () => [];
      return (..._args) => proxy;
    },
    apply() { return proxy; },
  });
  return proxy;
};
const v = chain();
\`;
const HERDR_SRC = \`
const S = () => globalThis.__BH_ISSUE1_TEST_STATE__;
const noop = () => {};
export const shared = (key) => {
  const c = S().counts.shared;
  c.set(key, (c.get(key) ?? 0) + 1);
  return S().sharedMap.get(key);
};
export const setShared = (key, val) => { S().sharedMap.set(key, val); };
export const agents = () => { S().counts.agents += 1; return S().agents; };
export const panes = () => { S().counts.panes += 1; return S().panes; };
export const spaces = () => { S().counts.spaces += 1; return S().spaces; };
export const terminals = () => { S().counts.terminals += 1; return S().terminals; };
export const focused = () => { S().counts.focused += 1; return S().focused; };
export const settings = () => ({ theme: "bot-herdr-dark", dark: true, zoom: 1 });
export const theme = () => ({});
export const themes = () => [];
export const appHome = () => "/tmp/herdr-test";
export const window = () => ({ platform: "linux" });
export const knownAgents = async () => [];
export const run = noop;
export const hc = async () => ({ code: 0, stdout: "", stderr: "" });
export const exec = async () => ({ code: 0, stdout: "", stderr: "" });
export const readTextFile = async () => "";
export const pickFolder = async () => null;
export const openExternal = noop;
export const copyToClipboard = noop;
export const pasteFromClipboard = async () => "";
export const notify = noop;
\`;
export async function resolve(spec, ctx, next) {
  return names.has(spec) ? { url: "stub:" + spec, shortCircuit: true } : next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (!url.startsWith("stub:")) return next(url, ctx);
  const spec = url.slice(5);
  if (spec === "fs/promises") return { format: "module", source: FS, shortCircuit: true };
  if (spec === "herdr") {
    const defined = new Set(["shared","setShared","agents","panes","spaces","terminals","focused","settings","theme","themes","appHome","window","knownAgents","run","hc","exec","readTextFile","pickFolder","openExternal","copyToClipboard","pasteFromClipboard","notify"]);
    const extras = [...names.get(spec)].filter((n) => !defined.has(n)).map((n) => "export const " + n + " = noop;").join("\\n");
    return { format: "module", source: HERDR_SRC + "\\n" + extras, shortCircuit: true };
  }
  const list = [...names.get(spec)].map((n) => "v as " + n).join(", ");
  return { format: "module", source: GPUI_HELPER + "\\nexport { " + list + " };", shortCircuit: true };
}
`;
register(`data:text/javascript,${encodeURIComponent(HOOK)}`);

const { Composer } = await import("../mods/bot-herdr/composer.js");
const { Chat } = await import("../mods/bot-herdr/chat.js");

const KNOWN_10 = [
  { key: "claude", name: "Claude Code", run: ["claude"], installed: true },
  { key: "codex", name: "Codex", run: ["codex"], installed: true },
  { key: "pi", name: "pi", run: ["pi"], installed: true },
  { key: "omp", name: "Oh My Pi", run: ["omp"], installed: true },
  { key: "gemini", name: "Gemini", run: ["gemini"], installed: true },
  { key: "qwen", name: "Qwen Code", run: ["qwen"], installed: true },
  { key: "opencode", name: "opencode", run: ["opencode"], installed: true },
  { key: "antigravity", name: "Antigravity", run: ["agy"], installed: true },
  { key: "aider", name: "Aider", run: ["aider"], installed: false },
  { key: "cursor", name: "Cursor", run: ["cursor"], installed: false },
];

const fakeCx = () => ({
  bind_keys: () => {},
  focus_handle: () => ({ focus: () => {} }),
  notify: () => {},
  spawn: () => {},
  timer: { every: () => {}, after: () => {} },
});

test("roster() and migrateArgs() handle malformed, null, and legacy JSON inputs without throwing or mutating", () => {
  const badStored = [
    null,
    undefined,
    42,
    "corrupt",
    { id: null, role: "orchestrator", name: null, harness: "antigravity", args: null, instructions: null, skills: [" review ", null, ""], mcp: [null], fallbacks: [null, { harness: "", model: "x" }, { harness: "claude", model: 7 }] },
    { role: "dev", harness: "codex", args: "Always run tests before finishing", instructions: null },
    { role: "custom", name: null, harness: null },
  ];
  const snapshot = JSON.stringify(badStored[5]);
  const list = roster(badStored, KNOWN_10);
  assert.equal(list.length, 7);
  assert.equal(list[0].role, "orchestrator");
  assert.equal(list[0].harness, "antigravity");
  assert.deepEqual(list[0].skills, ["review"]);
  assert.deepEqual(list[0].fallbacks, [{ harness: "claude", model: "7", effort: "" }]);
  assert.equal(list[2].args, "");
  assert.equal(list[2].instructions, "Always run tests before finishing");
  assert.equal(JSON.stringify(badStored[5]), snapshot);

  assert.equal(roster("not-an-array", []).length, 6);
  const cleanEntry = { args: "", instructions: "" };
  assert.equal(migrateArgs(cleanEntry), cleanEntry);
});

test("Composer.render() reads shared(ROSTER_KEY) once across 10 harnesses, suggest rows, and inline tokens", () => {
  const cx = fakeCx();
  state.sharedMap.set(ROSTER_KEY, [
    { role: "orchestrator", harness: "antigravity", model: "gemini-3", effort: "high" },
    { role: "design", harness: "claude" },
    { role: "dev", harness: "codex" },
  ]);
  state.agents = [
    { address: "t1", space: "s1", tab_name: "Orchestrator", status: "working", program: { name: "Antigravity" } },
    { address: "t2", space: "s1", tab_name: "Design", status: "idle", program: { name: "Claude" } },
  ];

  const comp = new Composer({});
  comp.init({}, cx);
  comp.known = KNOWN_10;
  comp.pane = "suggest";
  comp.trigger = { kind: "mention", query: "", start: 0, end: 1 };

  resetCounts();
  comp.render(cx, 960, 700);
  // Simulate GPUI invoking the captured inline token renderer callback after render().
  assert.ok(state.tokenCallbacks.length >= 1, "expected Textarea.token callback to be registered");
  const tokenCb = state.tokenCallbacks[0];
  for (const name of ["Orchestrator", "Design", "Dev", "QA", "Scout"]) {
    tokenCb({ token: { id: `agent:${name}`, text: `@${name}` } });
  }

  assert.equal(state.counts.shared.get(ROSTER_KEY), 1, "Composer.render() + token callbacks should read ROSTER_KEY once");
  assert.equal(state.counts.spaces, 1, "Composer.render() should read spaces() once");
  assert.equal(state.counts.agents, 1, "Composer.render() should read agents() once");
  assert.equal(comp._frame, null, "frame cache must be cleared after render()");

  // Next render picks up roster updates immediately (no stale cross-frame cache).
  state.sharedMap.set(ROSTER_KEY, [{ role: "orchestrator", harness: "claude", model: "opus", effort: "max" }]);
  assert.equal(comp.leadEntry().harness, "claude");
  assert.equal(comp.leadEntry().effort, "max");
});

test("Chat.render() reads shared(ROSTER_KEY) and bridge snapshots once across 40 messages and working agents", () => {
  const cx = fakeCx();
  state.sharedMap.set(ROSTER_KEY, [
    { role: "orchestrator", harness: "antigravity", model: "gemini-3", effort: "high" },
    { role: "design", harness: "claude" },
    { role: "dev", harness: "codex" },
    { role: "qa", harness: "claude" },
  ]);
  state.agents = [
    { address: "t1", space: "s1", tab_name: "Orchestrator", status: "working", program: { name: "Antigravity" } },
    { address: "t2", space: "s1", tab_name: "Design", status: "working", program: { name: "Claude" } },
    { address: "t3", space: "s1", tab_name: "Dev", status: "working", program: { name: "Codex" } },
  ];
  state.terminals = [
    { address: "t4", state: "live", parent: "t1", status: "working", name: "qa-check", program: { agent: true, name: "Claude" } },
  ];

  const chat = new Chat();
  chat.init({}, cx);
  chat.composer.known = KNOWN_10;
  chat.entries = [];
  for (let i = 0; i < 60; i++) {
    if (i % 3 === 0) {
      chat.entries.push({ id: `m-${i}`, at: 1700000000000 + i * 1000, space: "s1", kind: "me", text: `Message ${i}`, to: ["Orchestrator", "Design", "Dev"] });
    } else if (i % 3 === 1) {
      chat.entries.push({ id: `a-${i}`, at: 1700000000000 + i * 1000, space: "s1", kind: "agent", text: `Fixed \`mods/bot-herdr/chat.js\` for t-20261121-3sn6 (${i}).`, from: { address: "t1", name: "Orchestrator" } });
    } else {
      chat.entries.push({ id: `c-${i}`, at: 1700000000000 + i * 1000, space: "s1", kind: "agent", text: `Child report ${i}\nLine 2\nLine 3\nLine 4`, from: { address: "t2", name: "Design" } });
    }
  }

  resetCounts();
  chat.render(cx);

  assert.equal(state.counts.shared.get(ROSTER_KEY), 1, "Chat.render() + Composer.render() must read ROSTER_KEY once total");
  assert.equal(state.counts.agents, 1, "Chat.render() must read agents() once total");
  assert.equal(state.counts.spaces, 1, "Chat.render() must read spaces() once total");
  assert.equal(state.counts.terminals, 1, "Chat.render() must read terminals() once total");
  assert.equal(chat.composer._frame, null, "frame cache must be cleared after Chat.render()");

  // Re-rendering (e.g. keystroke/hover) stays O(1) for bridge reads and never leaks stale roster.
  state.sharedMap.set(ROSTER_KEY, [{ role: "orchestrator", harness: "codex", model: "gpt-6" }]);
  resetCounts();
  chat.render(cx);
  assert.equal(state.counts.shared.get(ROSTER_KEY), 1);
  assert.equal(chat.composer.leadEntry().harness, "codex");
});

test("static regression: no leadEntry() inside Array.find in composer.tools and no composer.roster() inside chat message renderers", () => {
  const composerSrc = modSrc("composer.js");
  const toolsStart = composerSrc.indexOf("  tools(c, target, busy, empty");
  const sendKeyStart = composerSrc.indexOf("  sendKey(c, canSend)");
  assert.ok(toolsStart > 0 && sendKeyStart > toolsStart);
  const toolsBlock = composerSrc.slice(toolsStart, sendKeyStart);
  assert.doesNotMatch(toolsBlock, /\.find\([^)]*leadEntry\(/, "tools() must not call leadEntry() inside Array.find()");

  const chatSrc = modSrc("chat.js");
  const mineStart = chatSrc.indexOf("  mine(c, e, width");
  const sentChipStart = chatSrc.indexOf("  sentChip(c, e, name, i)");
  assert.ok(mineStart > 0 && sentChipStart > mineStart);
  const mineBody = chatSrc.slice(chatSrc.indexOf("\n", mineStart), sentChipStart);
  assert.doesNotMatch(mineBody, /this\.composer\.roster\(/, "mine() body must use hoisted team, not call this.composer.roster()");

  const replyStart = chatSrc.indexOf("  reply(c, e, width");
  const pictureStart = chatSrc.indexOf("  picture(c, e, p, index");
  assert.ok(replyStart > 0 && pictureStart > replyStart);
  const replyBodySrc = chatSrc.slice(chatSrc.indexOf("\n", replyStart), pictureStart);
  assert.doesNotMatch(replyBodySrc, /this\.composer\.roster\(/, "reply() body must use hoisted team, not call this.composer.roster()");
});
