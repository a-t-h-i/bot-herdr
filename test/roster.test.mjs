import { test } from "node:test";
import assert from "node:assert/strict";
import { roster, argvOf, runnable, runningAs, effortsOf, modelsOf, findAgent, parseModelList, blank, slug, looksLikeInstructions } from "../mods/bot-herdr/roster.js";
import { replyFile, push, shown, isNew, outcome, scrollBy, clampScroll, KEEP, SHOWN, addComment, editComment, resolveComment, deleteComment } from "../mods/bot-herdr/feed.js";
import { teamBrief, orchestratorBrief } from "../mods/bot-herdr/brief.js";

const known = [
  { key: "claude", name: "Claude Code", run: ["claude"], installed: true },
  { key: "codex", name: "Codex", run: ["codex"], installed: true },
  { key: "pi", name: "pi", run: ["pi"], installed: false },
];

test("the six roles are always there, in order, on the first installed harness", () => {
  const list = roster(undefined, known);
  assert.deepEqual(list.map((a) => a.name), ["Orchestrator", "Design", "Dev", "QA", "Research", "Scout"]);
  assert.deepEqual(list.map((a) => a.harness), Array(6).fill("claude"));
  assert.deepEqual(list.map((a) => a.lead), [true, false, false, false, false, false]);
  assert.equal(roster(null, [])[0].harness, "claude");
});

test("saved choices stick to their role; the team is the six roles only; an old lead becomes the Orchestrator", () => {
  const list = roster([
    { id: "x", role: "dev", name: "Backend person", harness: "codex", model: "gpt-6.1-sol", effort: "high" },
    { id: "mine", role: "custom", name: "Reviewer", harness: "codex" },
    { id: "old", name: "Boss", harness: "codex", lead: true },
  ], known);
  const dev = list.find((a) => a.role === "dev");
  assert.equal(dev.name, "Dev"); // role names are fixed
  assert.equal(dev.model, "gpt-6.1-sol");
  assert.equal(list[0].harness, "codex"); // the old lead's choices
  assert.equal(list[0].name, "Orchestrator");
  assert.equal(list.length, 6); // an agent of the person's own isn't part of the team
  assert.ok(!list.some((a) => a.role === "custom"));
  assert.equal(findAgent(list, "@backend")?.role, "dev");
  assert.equal(findAgent(list, "frontend")?.role, "design");
  assert.equal(findAgent(list, "reviewer"), null);
});

test("models and effort levels come from the harness, and for Claude Code from the model", () => {
  assert.ok(modelsOf("claude").some((m) => m.id === "claude-opus-5-5" && m.current));
  assert.deepEqual(modelsOf("aider"), []);
  assert.deepEqual(effortsOf("claude", "claude-opus-4-6"), ["low", "medium", "high", "max"]);
  assert.deepEqual(effortsOf("claude", "something-else"), ["low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(effortsOf("omp"), ["off", "minimal", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(parseModelList("provider   model            context\nanthropic  claude-opus-5-5  1M\nopenai     gpt-6.1-sol      400k\n"), ["anthropic/claude-opus-5-5", "openai/gpt-6.1-sol"]);
});

test("the command carries the model, the effort and the extra arguments in each harness's own flags", () => {
  assert.deepEqual(argvOf({ harness: "claude", model: "opus", effort: "high", args: "" }, known), ["claude", "--model", "opus", "--effort", "high"]);
  assert.deepEqual(argvOf({ harness: "codex", model: "gpt-5", effort: "low", args: "--search" }, known), ["codex", "-m", "gpt-5", "-c", "model_reasoning_effort=low", "--search"]);
  assert.deepEqual(argvOf({ harness: "pi", model: "", effort: "off", args: "" }, known), ["pi", "--thinking", "off"]);
  // A level the harness doesn't have, or a harness with no effort flag, adds nothing.
  assert.deepEqual(argvOf({ harness: "codex", model: "", effort: "max", args: "" }, known), ["codex"]);
  assert.deepEqual(argvOf({ harness: "aider", model: "x", effort: "high", args: "" }, known), ["aider", "--model", "x"]);
  assert.deepEqual(effortsOf("gemini"), []);
});

test("installed, running, new and named", () => {
  assert.equal(runnable({ harness: "codex" }, known), true);
  assert.equal(runnable({ harness: "pi" }, known), false);
  const agents = [{ address: "t1", space: "s1", tab_name: "Reviewer", seq: 3 }, { address: "t2", space: "s2", tab_name: "reviewer", seq: 1 }];
  assert.equal(runningAs({ name: "reviewer" }, agents, "s1").address, "t1");
  assert.equal(runningAs({ name: "Coder" }, agents, "s1"), null);
  const next = blank([{ name: "Agent 1" }, { name: "Agent 2" }], known);
  assert.equal(next.name, "Agent 3");
  assert.equal(next.role, "custom");
  assert.equal(next.harness, "claude");
  assert.equal(slug(" Code Reviewer! "), "code-reviewer");
});

test("the brief names the person's agents and where to write the reply", () => {
  const b = teamBrief({ known, roster: [{ name: "Reviewer", command: "codex -m gpt-5" }], outbox: "/h/replies" });
  assert.match(b, /Reviewer = `codex -m gpt-5`/);
  assert.match(b, /`\/h\/replies\/<your terminal address>\.md`/);
  assert.match(b, /HC_TERMINAL_ID/);
  assert.doesNotMatch(teamBrief({ known }), /Replying to the person/);
  assert.match(orchestratorBrief({ known, outbox: "/h/replies" }), /Replying to the person/);
});

test("the feed: reply files, what is kept and what is shown", () => {
  assert.equal(replyFile("/h/replies", "vps/t7"), "/h/replies/vps_t7.md");
  assert.equal(isNew("done", undefined), true);
  assert.equal(isNew("done", "done"), false);
  assert.equal(isNew("  \n", undefined), false);
  assert.equal(isNew(null, undefined), false);
  let entries = [];
  for (let i = 0; i < KEEP + 5; i++) entries = push(entries, { at: i, space: i % 2 ? "s1" : "s2", text: String(i) });
  assert.equal(entries.length, KEEP);
  const view = shown(entries, "s1", 0);
  assert.equal(view.list.length, SHOWN);
  assert.equal(view.list.at(-1).text, String(KEEP + 3));
  assert.equal(shown(entries, "s1", 2).list.at(-1).text, String(KEEP - 1));
  assert.equal(shown(entries, "s1", 9999).list.length, 1);
  assert.deepEqual(shown([], "s1", 3), { list: [], total: 0, back: 0 });
});

test("the feed scrolls by pixels: small deltas move px, crossing an entry moves back, unmeasured heights use the fallback", () => {
  const heights = [100, 60];
  assert.deepEqual(scrollBy({ back: 0, px: 0 }, 30, heights, 5), { back: 0, px: 30 });
  assert.deepEqual(scrollBy({ back: 0, px: 30 }, 80, heights, 5), { back: 1, px: 10 });
  assert.deepEqual(scrollBy({ back: 1, px: 10 }, 70, heights, 5), { back: 2, px: 20 });
  assert.deepEqual(scrollBy({ back: 2, px: 20 }, -300, heights, 5), { back: 0, px: 0 });
  assert.deepEqual(scrollBy({ back: 2, px: 0 }, 130, heights, 5, 120), { back: 3, px: 10 });
  assert.deepEqual(scrollBy({ back: 0, px: 0 }, 500, [100], 2, 120), { back: 1, px: 119 });
});

test("the feed stops with its oldest entry's top at the top of the view, and doesn't scroll when it all fits", () => {
  // Three entries, 100 + 60 + 80 = 240 px, in a 200 px view: at most 40 px up.
  const heights = [100, 60, 80];
  assert.deepEqual(scrollBy({ back: 0, px: 0 }, 30, heights, 3, 120, 200), { back: 0, px: 30 });
  assert.deepEqual(scrollBy({ back: 0, px: 30 }, 500, heights, 3, 120, 200), { back: 0, px: 40 });
  // Past one entry: 250 px of content in a 100 px view stops 150 up, 50 into the second.
  assert.deepEqual(scrollBy({ back: 0, px: 0 }, 900, [100, 150], 2, 120, 100), { back: 1, px: 50 });
  // Everything fits: no scrolling at all.
  assert.deepEqual(scrollBy({ back: 0, px: 0 }, 50, heights, 3, 120, 400), { back: 0, px: 0 });
  // Without a view height, as before.
  assert.deepEqual(scrollBy({ back: 0, px: 0 }, 500, [100], 2, 120), { back: 1, px: 119 });
  // A taller view (the composer folded) pulls a scrolled feed back down; within it, nothing moves.
  assert.deepEqual(clampScroll({ back: 2, px: 50 }, heights, 3, 200), { back: 0, px: 40 });
  assert.deepEqual(clampScroll({ back: 0, px: 20 }, heights, 3, 200), { back: 0, px: 20 });
  assert.deepEqual(clampScroll({ back: 0, px: 0 }, [], 0, 200), { back: 0, px: 0 });
});

test("an agent we wrote to: waiting, blocked once, silent after it worked and stopped", () => {
  assert.equal(outcome({ worked: false }, "idle", 1000), "wait");
  assert.equal(outcome({ worked: true, stopped: 1000 }, "working", 2000), "wait");
  assert.equal(outcome({ worked: true, stopped: 1000 }, "idle", 5000), "wait");
  assert.equal(outcome({ worked: true, stopped: 1000 }, "done", 9500), "silent");
  assert.equal(outcome({ blocked: false }, "blocked", 0), "blocked");
  assert.equal(outcome({ blocked: true }, "blocked", 0), "wait");
  assert.equal(outcome({}, null, 0), "gone");
});

test("extra arguments that are a sentence become the agent's instructions", () => {
  assert.equal(looksLikeInstructions("Don't add the co-authored by claude in commit messages."), true);
  assert.equal(looksLikeInstructions("--search -c x=1"), false);
  assert.equal(looksLikeInstructions("be brief --yolo"), false);
  assert.equal(looksLikeInstructions(""), false);
  assert.equal(looksLikeInstructions("   "), false);
  const sentence = "Don't add the co-authored by claude in commit messages.";
  const [, , , , research] = roster([{ role: "research", harness: "antigravity", args: sentence, instructions: "Cite sources." }], known);
  assert.equal(research.args, "");
  assert.equal(research.instructions, `Cite sources.\n\n${sentence}`);
  const argv = argvOf(research, [{ key: "antigravity", run: ["agy"], installed: true }]);
  for (const word of sentence.split(/s+/)) assert.ok(!argv.includes(word), word);
  assert.equal(roster([{ role: "dev", args: "--search" }], known)[2].args, "--search");
});

test("comments on a reply: add, edit, resolve and delete; unknown ids change nothing", () => {
  const feed = [{ id: "a", kind: "agent", text: "hi" }, { id: "b", kind: "me", text: "yo" }];
  let next = addComment(feed, "a", "first", 1);
  next = addComment(next, "a", "second", 2);
  assert.deepEqual(next[0].comments, [{ id: "c1", text: "first", at: 1, open: true }, { id: "c2", text: "second", at: 2, open: true }]);
  assert.equal(next[1], feed[1]);
  assert.equal(feed[0].comments, undefined);
  next = resolveComment(next, "a", "c1");
  assert.equal(next[0].comments[0].open, false);
  next = editComment(next, "a", "c1", "changed", 5);
  assert.deepEqual(next[0].comments[0], { id: "c1", text: "changed", at: 1, open: true, edited: 5 });
  next = deleteComment(next, "a", "c1");
  assert.deepEqual(next[0].comments.map((x) => x.id), ["c2"]);
  assert.equal(addComment(next, "a", "third", 6)[0].comments[1].id, "c3");
  for (const same of [addComment(next, "zz", "x", 1), editComment(next, "a", "c9", "x", 1), resolveComment(next, "zz", "c2"), deleteComment(next, "a", "c9")]) assert.equal(same, next);
});
