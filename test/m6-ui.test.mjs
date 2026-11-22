// Pure unit tests for M6 UI helpers: approval card choices & command args, diff review row model &
// line ids & comments, Summary/Normal/Verbose view-mode filtering & cycling, thread-map tree from
// children/forks/forkOf & fork prefill/args, queue/steer send mode & commands, and tiled panes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const MODS = fileURLToPath(new URL("../mods/bot-herdr", import.meta.url));
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
const STUB = 'const fn = () => proxy; const proxy = new Proxy(fn, { get(_t, k) { return (k === "then" || typeof k === "symbol") ? undefined : (..._a) => proxy; }, apply() { return proxy; } });';
export async function resolve(spec, ctx, next) {
  return names.has(spec) ? { url: "stub:" + spec, shortCircuit: true } : next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (!url.startsWith("stub:")) return next(url, ctx);
  const spec = url.slice(5);
  if (spec === "fs/promises") return { format: "module", source: FS, shortCircuit: true };
  const list = [...names.get(spec)].map((n) => "proxy as " + n).join(", ");
  return { format: "module", source: STUB + "\\nexport { " + list + " };", shortCircuit: true };
}
`;
register(`data:text/javascript,${encodeURIComponent(HOOK)}`);

import {
  APPROVAL_CHOICES, approvalRecord, approvalsList, approvalsForTask, approvalChoiceForKey, approvalAnswerArgs,
  diffModel, diffLineId, reviewCommentsList, openReviewCount, commentsForLine, reviewAddArgs, reviewRemoveArgs, reviewSendArgs,
  VIEW_MODES, DEFAULT_VIEW_MODE, viewModeOrDefault, nextViewMode, filterConversation, threadSummary,
  threadMapModel, forkPrefill, forkArgs,
} from "../mods/bot-herdr/threadview.js";
import {
  composerSendMode, steerCommands, queueCommand, composerPlaceholder,
  tileAddresses, isTiledLayout, withTiledPanes,
} from "../mods/bot-herdr/signals.js";
import { KEYMAP, collisions } from "../mods/bot-herdr/keymap.js";

const { approvalAnswerError } = await import("../mods/bot-herdr/peek.js");
const { composerIsFolded } = await import("../mods/bot-herdr/composer.js");
const { entryIsOpen, toggleEntryOpen } = await import("../mods/bot-herdr/threads.js");

test("approval card choices, key mapping, filtering by task, and command args", () => {
  assert.deepEqual(APPROVAL_CHOICES.map((c) => c.id), ["once", "project", "deny"]);
  assert.equal(APPROVAL_CHOICES[0].tone, "primary");
  assert.equal(APPROVAL_CHOICES[1].tone, "secondary");
  assert.equal(APPROVAL_CHOICES[2].tone, "secondary");

  assert.equal(approvalChoiceForKey("1"), "once");
  assert.equal(approvalChoiceForKey("2"), "project");
  assert.equal(approvalChoiceForKey("3"), "deny");
  assert.equal(approvalChoiceForKey("4"), null);

  assert.deepEqual(approvalAnswerArgs("ap-1234abcd", "once"), ["approvals", "answer", "ap-1234abcd", "once"]);
  assert.deepEqual(approvalAnswerArgs("ap-1234abcd", "project"), ["approvals", "answer", "ap-1234abcd", "project"]);
  assert.deepEqual(approvalAnswerArgs("ap-1234abcd", "deny"), ["approvals", "answer", "ap-1234abcd", "deny"]);
  assert.equal(approvalAnswerArgs("ap-1234abcd", "invalid"), null);
  assert.equal(approvalAnswerArgs("", "once"), null);

  const payload = {
    approvals: [
      { id: "ap-1", task: "t-a", agent: "dev", from: "dev-m6e", title: "Run a command", command: "npm publish", status: "pending" },
      { id: "ap-2", task: "t-a", agent: "qa", from: "qa-1", title: "Already answered", command: "rm -rf /", status: "answered" },
      { id: "ap-3", task: "t-b", agent: "dev", from: "dev-2", title: "Other task", command: "git push", status: "pending" },
    ],
  };
  assert.equal(approvalsList(payload).length, 2);
  assert.deepEqual(approvalsForTask(payload, "t-a").map((r) => r.id), ["ap-1"]);
  assert.deepEqual(approvalsList({ implemented: false }), []);
  assert.equal(approvalRecord({ implemented: false, id: "ap-x" }), null);
});

test("diff review row model, line ids, comments filtering, and review command args", () => {
  assert.equal(diffModel({ implemented: false }), null);
  assert.equal(diffModel(null), null);

  const model = diffModel({
    path: "mods/x.js",
    truncated: false,
    hunks: [
      {
        header: "@@ -1,3 +1,4 @@",
        lines: [
          { kind: "ctx", old: 1, new: 1, text: "const a = 1;" },
          { kind: "del", old: 2, new: null, text: "const b = 2;" },
          { kind: "add", old: null, new: 2, text: "const b = 3;" },
          { kind: "add", old: null, new: 3, text: "const c = 4;" },
        ],
      },
    ],
  });
  assert.equal(model.path, "mods/x.js");
  assert.equal(model.hunks.length, 1);
  const rows = model.hunks[0].rows;
  assert.equal(rows[0].gutter, " ");
  assert.equal(rows[0].lineId, "bh-diff-line-mods/x.js-1");
  assert.equal(rows[0].commentable, true);
  assert.equal(rows[1].gutter, "−");
  assert.equal(rows[1].commentable, false);
  assert.equal(rows[2].gutter, "+");
  assert.equal(rows[2].lineId, "bh-diff-line-mods/x.js-2");
  assert.equal(rows[2].commentable, true);
  assert.equal(diffLineId("mods/x.js", 42), "bh-diff-line-mods/x.js-42");

  const comments = reviewCommentsList({
    comments: [
      { id: "rc-1", at: 100, path: "mods/x.js", line: 2, text: "Check edge case", state: "open" },
      { id: "rc-2", at: 200, path: "mods/x.js", line: 2, text: "Already sent", state: "sent" },
      { id: "rc-3", at: 300, path: "mods/y.js", line: 9, text: "Other file", state: "open" },
    ],
  });
  assert.equal(openReviewCount(comments), 2);
  assert.deepEqual(commentsForLine(comments, "mods/x.js", 2).map((c) => c.id), ["rc-1", "rc-2"]);
  assert.deepEqual(reviewCommentsList({ implemented: false }), []);

  assert.deepEqual(reviewAddArgs("t-1", "mods/x.js", 2, "Check edge case"), ["review", "add", "t-1", "mods/x.js", "2", "Check edge case"]);
  assert.equal(reviewAddArgs("t-1", "mods/x.js", 0, "No line"), null);
  assert.deepEqual(reviewRemoveArgs("t-1", "rc-1"), ["review", "remove", "t-1", "rc-1"]);
  assert.deepEqual(reviewSendArgs("t-1"), ["review", "send", "t-1"]);
});

test("Summary / Normal / Verbose view modes: default, cycling, filtering and keymap entry", () => {
  assert.deepEqual(VIEW_MODES.map((m) => m.id), ["summary", "normal", "verbose"]);
  assert.equal(DEFAULT_VIEW_MODE, "normal");
  assert.equal(viewModeOrDefault("bogus"), "normal");
  assert.equal(nextViewMode("summary"), "normal");
  assert.equal(nextViewMode("normal"), "verbose");
  assert.equal(nextViewMode("verbose"), "summary");

  const entries = [
    { key: "1", word: "contract", text: "{}" },
    { key: "2", word: "question", text: "Which colour?" },
    { key: "3", word: "reply", text: "Working on it." },
    { key: "4", word: "decision", text: "Use token map." },
    { key: "5", word: "blocker", text: "Harness offline." },
    { key: "6", word: "done", text: "Merged step 1." },
    { key: "7", word: "note", text: "FYI." },
  ];
  assert.deepEqual(filterConversation(entries, "summary").map((e) => e.key), ["2", "4", "5", "6"]);
  assert.equal(filterConversation(entries, "normal").length, 7);
  assert.equal(filterConversation(entries, "verbose").length, 7);
  assert.equal(threadSummary({ summary: { text: "First line.\nSecond line." } }), "First line.");

  assert.ok(KEYMAP.some((r) => r.context === "threads" && r.keys.includes("V")), "v key is listed in keymap.js");
  assert.deepEqual(collisions(), []);
});

test("thread map builds parent, children, forks and forkOf cleanly; fork prefill and args", () => {
  const empty = threadMapModel({ id: "t-1", title: "Root", state: "working", children: [], forks: [], forkOf: null });
  assert.equal(empty.hasTree, false);
  assert.equal(empty.forkOf, null);

  const model = threadMapModel(
    {
      id: "t-2",
      title: "M6 UI",
      state: "working",
      forkOf: "t-0",
      children: [{ name: "dev-m6u", agent: "Dev", step: 6, state: "open" }],
      forks: [{ id: "t-3", title: "Follow-up polish", state: "idle" }],
    },
    { rows: [{ id: "t-0", title: "Original task" }] },
  );
  assert.equal(model.hasTree, true);
  assert.deepEqual(model.forkOf, { id: "t-0", title: "Original task" });
  assert.equal(model.children.length, 1);
  assert.equal(model.children[0].rowId, "bh-thread-map-dev-m6u");
  assert.equal(model.children[0].state, "working");
  assert.equal(model.children[0].step, 6);
  assert.equal(model.forks.length, 1);
  assert.equal(model.forks[0].rowId, "bh-thread-map-t-3");
  assert.equal(model.forks[0].title, "Follow-up polish");

  assert.equal(forkPrefill({ title: "Fallback", summary: { text: "Carry this summary" } }), "Carry this summary");
  assert.equal(forkPrefill({ title: "Fallback" }), "Fallback");
  assert.deepEqual(forkArgs("t-2", "Carry this summary"), ["thread", "fork", "t-2", "Carry this summary"]);
  assert.equal(forkArgs("t-2", "   "), null);
});

test("queue and steer choose the right mode, commands and placeholder", () => {
  assert.equal(composerSendMode({ busy: false, steer: false }), "send");
  assert.equal(composerSendMode({ busy: false, steer: true }), "send");
  assert.equal(composerSendMode({ busy: true, steer: false }), "queue");
  assert.equal(composerSendMode({ busy: true, steer: true }), "steer");

  assert.deepEqual(steerCommands("t7a", "Stop and check tests"), [
    ["interrupt", "t7a"],
    ["send", "t7a", "Stop and check tests"],
  ]);
  assert.deepEqual(steerCommands("", "hi"), []);
  assert.deepEqual(queueCommand("t7a", "After this turn"), ["send", "t7a", "After this turn"]);
  assert.equal(queueCommand("t7a", "  "), null);

  assert.match(composerPlaceholder({ busy: true, leadName: "Orchestrator" }), /Enter queues.*Ctrl\+Enter steers/);
  assert.equal(composerPlaceholder({ busy: false, fallback: "Write a message" }), "Write a message");
});

test("tiled agent panes transform layout panes between single active tab and side-by-side terminal blocks", () => {
  const base = {
    id: "root",
    type: "row",
    children: [
      {
        id: "terminals",
        type: "column",
        children: [
          {
            id: "panes",
            type: "row",
            gap: 8,
            children: [{ id: "main", type: "block", content: { tab: "active" } }],
          },
        ],
      },
    ],
  };
  assert.equal(isTiledLayout(base), false);
  const addrs = tileAddresses([{ address: "t1" }, { address: "t2" }], [{ address: "t2", state: "live", status: "working" }, { address: "t3", state: "live", program: { agent: true } }]);
  assert.deepEqual(addrs, ["t1", "t2", "t3"]);

  const tiled = withTiledPanes(base, addrs);
  assert.equal(isTiledLayout(tiled), true);
  const panes = tiled.children[0].children[0];
  assert.equal(panes.children[0].id, "main");
  assert.equal(panes.children[0].hidden, true);
  assert.deepEqual(panes.children.slice(1).map((b) => b.content.terminal), ["t1", "t2", "t3"]);

  const restored = withTiledPanes(tiled, []);
  assert.equal(isTiledLayout(restored), false);
  const restoredPanes = restored.children[0].children[0];
  assert.equal(restoredPanes.children.length, 1);
  assert.equal(restoredPanes.children[0].id, "main");
  assert.equal(restoredPanes.children[0].hidden, undefined);
});

test("approvalAnswerError parses non-zero exit JSON, uses fallback sentence, and ignores implemented:false", () => {
  assert.equal(approvalAnswerError({ code: 0, stdout: JSON.stringify({ id: "ap-1", answer: "once", ok: true }) }), null);
  assert.equal(
    approvalAnswerError({ code: 1, stdout: JSON.stringify({ ok: false, error: "Approval ap-1 was already answered." }) }),
    "Approval ap-1 was already answered.",
  );
  assert.equal(
    approvalAnswerError({ code: 1, stdout: "" }),
    "That approval could not be answered.",
  );
  assert.equal(
    approvalAnswerError({ code: 0, stdout: JSON.stringify({ ok: false, error: "Locked." }) }),
    "Locked.",
  );
  assert.equal(approvalAnswerError({ code: 1, stdout: JSON.stringify({ implemented: false }) }), null);
  assert.equal(approvalAnswerError({ code: 0, stdout: JSON.stringify({ implemented: false }) }), null);
});

test("composerIsFolded stays unfolded while queued messages are present", () => {
  assert.equal(composerIsFolded({ expanded: false, pane: null, paneNow: null, filesCount: 0, queuedCount: 0 }), true);
  assert.equal(composerIsFolded({ expanded: false, pane: null, paneNow: null, filesCount: 0, queuedCount: 1 }), false);
  assert.equal(composerIsFolded({ expanded: true, pane: null, paneNow: null, filesCount: 0, queuedCount: 0 }), false);
  assert.equal(composerIsFolded({ expanded: false, pane: null, paneNow: "ask", filesCount: 0, queuedCount: 0 }), false);
  assert.equal(composerIsFolded({ expanded: false, pane: null, paneNow: null, filesCount: 2, queuedCount: 0 }), false);
});

test("entryIsOpen and toggleEntryOpen let Fold close and reopen machine entries in Verbose mode", () => {
  const expanded = new Set();
  const verboseFolded = new Set();

  // Verbose opens by default; toggling folds via verboseFolded, toggling again reopens.
  assert.equal(entryIsOpen("verbose", "e1", expanded, verboseFolded), true);
  toggleEntryOpen("verbose", "e1", expanded, verboseFolded);
  assert.equal(verboseFolded.has("e1"), true);
  assert.equal(entryIsOpen("verbose", "e1", expanded, verboseFolded), false);
  toggleEntryOpen("verbose", "e1", expanded, verboseFolded);
  assert.equal(verboseFolded.has("e1"), false);
  assert.equal(entryIsOpen("verbose", "e1", expanded, verboseFolded), true);

  // Normal starts folded and toggles via expanded without touching verboseFolded.
  assert.equal(entryIsOpen("normal", "e1", expanded, verboseFolded), false);
  toggleEntryOpen("normal", "e1", expanded, verboseFolded);
  assert.equal(expanded.has("e1"), true);
  assert.equal(entryIsOpen("normal", "e1", expanded, verboseFolded), true);
  assert.equal(verboseFolded.size, 0);

  // Summary stays closed.
  assert.equal(entryIsOpen("summary", "e1", expanded, verboseFolded), false);
});
