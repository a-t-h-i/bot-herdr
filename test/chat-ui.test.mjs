// Regression tests for chat stability and UI state helpers (pure JS, no gpui/herdr runtime needed).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  KEEP,
  push,
  logEntries,
  logNew,
  scrollOnAdd,
  resolveSpace,
  workerSignature,
  shouldSuppressSilent,
  isDuplicateMd,
  enqueueOutbox,
  nextOutbox,
  matchAdopted,
} from "../mods/bot-herdr/feed.js";
import { findWait, clearWait, quietStatus } from "../mods/bot-herdr/live.js";

const modSrc = (name) => readFileSync(fileURLToPath(new URL(`../mods/bot-herdr/${name}`, import.meta.url)), "utf8");

test("push(): produces unique IDs across 350 entries including same-millisecond bursts at length 300", () => {
  let list = [];
  const allIds = new Set();
  const sameMs = 1_700_000_000_000;
  for (let i = 0; i < 350; i++) {
    list = push(list, { at: i >= 295 ? sameMs : sameMs + i, kind: "agent", text: `m${i}` });
    const latest = list[list.length - 1];
    assert.ok(!allIds.has(latest.id), `duplicate entry id generated at step ${i}: ${latest.id}`);
    allIds.add(latest.id);
  }
  assert.equal(list.length, KEEP);
  assert.equal(new Set(list.map((e) => e.id)).size, KEEP);
});

test("logNew(): never rewinds at on truncated/older read, handles same-ms distinct IDs, and parses kind: asked", () => {
  const t1 = "2026-11-21T10:00:00.000Z";
  const t2 = "2026-11-21T10:00:05.000Z";
  const floor = "2026-11-21T09:59:00.000Z";

  const first = JSON.stringify({ id: "a1", at: t2, kind: "reply", name: "Dev", space: "s1", text: "Hello" });
  const r1 = logNew(first, null, floor);
  assert.equal(r1.entries.length, 1);
  assert.equal(r1.entries[0].id, "a1");
  assert.equal(r1.entries[0].kind, "reply");
  assert.equal(r1.entries[0].space, "s1");
  assert.equal(r1.at, t2);
  assert.deepEqual(r1.ids, ["a1"]);

  // Truncated/older read must NEVER rewind cursor `at` backwards or lose seen IDs.
  const older = JSON.stringify({ id: "a0", at: t1, kind: "reply", name: "Dev", text: "Old" });
  const rTrunc = logNew(older, { at: r1.at, ids: r1.ids }, floor);
  assert.deepEqual(rTrunc.entries, []);
  assert.equal(rTrunc.at, t2);
  assert.deepEqual(rTrunc.ids, ["a1"]);

  // Same-millisecond batched entries with distinct IDs are all ingested without drop or replay.
  const secondSameMs = JSON.stringify({ id: "a2", at: t2, kind: "reply", name: "Dev", space: "s1", text: "Second" });
  const askedSameMs = JSON.stringify({ id: "a3", at: t2, kind: "asked", name: "Dev", space: "s1", text: "" });
  const combined = [first, secondSameMs, askedSameMs].join("\n");
  const r2 = logNew(combined, { at: rTrunc.at, ids: rTrunc.ids }, floor);
  assert.deepEqual(r2.entries.map((e) => [e.id, e.kind, e.text]), [
    ["a2", "reply", "Second"],
    ["a3", "asked", ""],
  ]);
  assert.equal(r2.at, t2);
  assert.deepEqual(r2.ids, ["a1", "a2", "a3"]);

  // Re-reading the exact same file replays nothing.
  const r3 = logNew(combined, { at: r2.at, ids: r2.ids }, floor);
  assert.deepEqual(r3.entries, []);
  assert.equal(r3.at, t2);
  assert.deepEqual(r3.ids, ["a1", "a2", "a3"]);

  // Legacy lines without kind/id/space default cleanly.
  const legacy = logEntries(JSON.stringify({ at: t1, name: "QA", text: "Legacy" }));
  assert.deepEqual(legacy, [{ id: null, at: t1, kind: "reply", name: "QA", space: null, text: "Legacy" }]);
});

test("scrollOnAdd(): preserves viewport anchor when scrolled up and snaps only on me or at bottom", () => {
  // Scrolled up: incoming agent or note in same space increments back by delta, keeps px.
  assert.deepEqual(scrollOnAdd({ back: 4, px: 35, kind: "agent", sameSpace: true, delta: 1 }), { back: 5, px: 35 });
  assert.deepEqual(scrollOnAdd({ back: 0, px: 20, kind: "note", sameSpace: true, delta: 1 }), { back: 1, px: 20 });
  // Folded child reply into existing kids group (delta = 0): anchor stays put.
  assert.deepEqual(scrollOnAdd({ back: 4, px: 35, kind: "agent", sameSpace: true, delta: 0 }), { back: 4, px: 35 });
  // Other-space entry while scrolled up: untouched.
  assert.deepEqual(scrollOnAdd({ back: 4, px: 35, kind: "agent", sameSpace: false, delta: 1 }), { back: 4, px: 35 });
  // User's own message always snaps to bottom.
  assert.deepEqual(scrollOnAdd({ back: 4, px: 35, kind: "me", sameSpace: true, delta: 1 }), { back: 0, px: 0 });
  // Already at bottom stays at bottom.
  assert.deepEqual(scrollOnAdd({ back: 0, px: 0, kind: "agent", sameSpace: true, delta: 1 }), { back: 0, px: 0 });
});

test("wait suppression & quiet cleanup: suppresses silent note on open question and matches remote/quiet by fileKey", () => {
  const open = [{ id: "q-1", from: "host/t4w", questions: [{ question: "Pick one" }] }];
  assert.equal(shouldSuppressSilent("host/t4w", open), true);
  assert.equal(shouldSuppressSilent("host_t4w", open), true);
  assert.equal(shouldSuppressSilent("t99", open), false);

  const now = 1_000_000;
  const waits = { "host/t4w": { name: "Design", space: "sp-a", at: now - 5000 } };
  assert.equal(quietStatus(findWait(waits, "host/t4w"), now), "working");
  assert.equal(findWait(waits, "host_t4w")?.space, "sp-a");
  assert.equal(clearWait(waits, "host_t4w", "host_t4w"), true);
  assert.equal(findWait(waits, "host/t4w"), null);
  assert.equal(quietStatus(findWait(waits, "host/t4w"), now), "idle");
});

test("resolveSpace(): prioritizes line.space ?? agent.space ?? wait.space ?? activeSpace", () => {
  assert.equal(resolveSpace({ lineSpace: "s-line", agentSpace: "s-agent", waitSpace: "s-wait", activeSpace: "s-active" }), "s-line");
  assert.equal(resolveSpace({ lineSpace: null, agentSpace: "s-agent", waitSpace: "s-wait", activeSpace: "s-active" }), "s-agent");
  assert.equal(resolveSpace({ lineSpace: null, agentSpace: null, waitSpace: "s-wait", activeSpace: "s-active" }), "s-wait");
  assert.equal(resolveSpace({ lineSpace: null, agentSpace: null, waitSpace: null, activeSpace: "s-active" }), "s-active");
});

test("workerSignature(): detects working-to-idle transitions including empty list", () => {
  const a = workerSignature([{ address: "t2", status: "working" }, { address: "t1", status: "working" }]);
  const b = workerSignature([{ address: "t1", status: "working" }, { address: "t2", status: "working" }]);
  const c = workerSignature([{ address: "t1", status: "working" }]);
  const idle = workerSignature([]);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(c, idle);
  assert.equal(idle, "");
});

test("isDuplicateMd(): deduplicates .md -> .jsonl transition within window and allows later identical replies", () => {
  const t0 = Date.parse("2026-11-21T10:00:00.000Z");
  const md = "Done.\n<!-- bh 2026-11-21T10:00:00.000Z -->";
  assert.equal(isDuplicateMd("Done.", md, t0 + 1000, "2026-11-21T10:00:02.000Z"), true);
  assert.equal(isDuplicateMd("Done.", md, NaN, "2026-11-21T10:00:03.000Z"), true);
  assert.equal(isDuplicateMd("Done.", md, t0, "2026-11-21T10:05:00.000Z"), false);
  assert.equal(isDuplicateMd("Different.", md, t0, "2026-11-21T10:00:01.000Z"), false);
});

test("outbox queue: queues cross-page sendText calls while sending=true and dispatches sequentially", () => {
  const queue = [];
  assert.equal(enqueueOutbox(queue, "  "), false);
  assert.equal(enqueueOutbox(queue, "1"), true);
  assert.equal(enqueueOutbox(queue, "Resume task t-1"), true);
  assert.equal(nextOutbox(queue, true), null);
  assert.equal(queue.length, 2);
  assert.equal(nextOutbox(queue, false), "1");
  assert.equal(nextOutbox(queue, true), null);
  assert.equal(nextOutbox(queue, false), "Resume task t-1");
  assert.equal(nextOutbox(queue, false), null);
});

test("matchAdopted(): matches by tab/agent name instead of blindly grabbing an unrelated new terminal", () => {
  const start = { space: "s1", before: new Set(["t0"]), name: "Design", tab: "Design" };
  const unrelated = { address: "t1", space: "s1", tab_name: "Dev", program: { key: "claude", name: "Claude" } };
  const target = { address: "t2", space: "s1", tab_name: "Design", program: { key: "antigravity", name: "Antigravity" } };
  assert.equal(matchAdopted(start, [unrelated]), null);
  assert.equal(matchAdopted(start, [unrelated, target])?.address, "t2");
  assert.equal(matchAdopted(start, [target], new Set(["t2"])), null);
});

test("structural invariants: no this.page shadowing, no render-time adopt/working timers, activePage guard in work.js", () => {
  const chatSrc = modSrc("chat.js");
  assert.doesNotMatch(chatSrc, /\bthis\.page\s*=/);
  assert.match(chatSrc, /\bthis\.lastPage\s*=/);
  assert.match(chatSrc, /\bpage\(sign,\s*total,\s*cx\)/);
  const workingBlock = chatSrc.slice(chatSrc.indexOf("working(c, list, width)"));
  assert.doesNotMatch(workingBlock, /timer\.after/);

  const composerSrc = modSrc("composer.js");
  const renderBlock = composerSrc.slice(composerSrc.indexOf("render(cx, pageWidth"), composerSrc.indexOf("bubble(c, width)"));
  assert.doesNotMatch(renderBlock, /this\.adopt\(/);
  const sendTextStart = composerSrc.indexOf("  sendText(text, cx) {");
  const sendStart = composerSrc.indexOf("  send(cx) {");
  assert.ok(sendTextStart > 0 && sendStart > sendTextStart);
  const sendTextBlock = composerSrc.slice(sendTextStart, sendStart);
  assert.match(sendTextBlock, /outboxQueue/);
  assert.doesNotMatch(sendTextBlock, /this\.input\.set_value/);

  const workSrc = modSrc("work.js");
  assert.match(workSrc, /cx\.timer\.every\(QUESTIONS_MS,\s*\(cx\)\s*=>\s*\{\s*if\s*\(activePage\(\)/);
});
