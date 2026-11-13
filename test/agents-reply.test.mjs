// Every agent reaches the chat; a harness's own question tool becomes a question card.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fromAskTool } from "../mods/bot-herdr/engine/lib/runner.mjs";

test("AskUserQuestion becomes bh ask's questions", () => {
  const got = fromAskTool({ questions: [{ question: "Which layout?", header: "Layout", multiSelect: false, options: [{ label: "Split (Recommended)", description: "Picture left" }, { label: "Centered", description: "One card" }] }] });
  assert.equal(got.title, "Layout");
  assert.equal(got.questions[0].text, "Which layout?");
  assert.deepEqual(got.questions[0].options.map((o) => [o.label, o.recommended]), [["Split", true], ["Centered", false]]);
  assert.equal(fromAskTool({}), null);
});

test("a child agent's answer is written for the chat too, and a turn with no words leaves a note", () => {
  const src = readFileSync(fileURLToPath(new URL("../mods/bot-herdr/engine/lib/agent.mjs", import.meta.url)), "utf8");
  assert.match(src, /export const NO_REPLY = "\(finished without a reply\)"/);
  assert.match(src, /const chat = toChat\(input, reply, \{ asked: r\.asked \}\);\r?\n\s*if \(address && chat\) \{\r?\n\s*writeText\(join\(DATA, "replies"/);
  assert.match(src, /logReply\(join\(DATA, "replies", `\$\{fileKey\(address\)\}\.jsonl`\), \{ at: now\(\), name: who, text: chat \}\)/);
});

test("every turn's reply is logged, and past its cap the log keeps the newest half", async () => {
  const { logReply, REPLY_LOG_MAX } = await import("../mods/bot-herdr/engine/lib/agent.mjs");
  const { mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const file = join(mkdtempSync(join(tmpdir(), "bh-log-")), "t9.jsonl");
  const texts = () => readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l).text);
  logReply(file, { at: "a", name: "Dev", text: "one" });
  logReply(file, { at: "b", name: "Dev", text: "two" });
  assert.deepEqual(texts(), ["one", "two"]);
  for (let i = 0; i < REPLY_LOG_MAX; i++) logReply(file, { at: String(i), name: "Dev", text: String(i) });
  assert.ok(texts().length <= REPLY_LOG_MAX);
  assert.equal(texts().at(-1), String(REPLY_LOG_MAX - 1));
});

test("a late or handled child report leaves nothing in the chat", async () => {
  const { toChat, HANDLED, NO_REPLY } = await import("../mods/bot-herdr/engine/lib/agent.mjs");
  const report = '<hc from="t7 design">Done — .bot-herdr/tasks/t/reports/design.md</hc>';
  assert.equal(toChat(report, HANDLED), null);
  assert.equal(toChat(report, ""), null);
  assert.equal(toChat(report, "Checked: it holds."), "Checked: it holds.");
  assert.equal(toChat("fix the button", ""), NO_REPLY);
  assert.equal(toChat("fix the button", "", { asked: true }), null);
  assert.equal(toChat("fix the button", "Done."), "Done.");
});

test("the chat never shows a (handled) reply, and its value matches the engine's", async () => {
  const { isHandled, HANDLED: shown } = await import("../mods/bot-herdr/feed.js");
  const { HANDLED, replyText } = await import("../mods/bot-herdr/engine/lib/agent.mjs");
  assert.equal(shown, HANDLED);
  assert.equal(isHandled(replyText(HANDLED)), true);
  assert.equal(isHandled("(handled) — and one more thing"), false);
  const chat = readFileSync(fileURLToPath(new URL("../mods/bot-herdr/chat.js", import.meta.url)), "utf8");
  assert.match(chat, /if \(isHandled\(text\)\) continue;/);
  assert.match(chat, /load\("feed", \[\]\)\.filter\(\(e\) => !\(e\.kind === "agent" && isHandled\(e\.text\)\)\)/);
});
