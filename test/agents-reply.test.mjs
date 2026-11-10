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

test("a child agent's answer is written for the chat too, not only the lead's", () => {
  const src = readFileSync(fileURLToPath(new URL("../mods/bot-herdr/engine/lib/agent.mjs", import.meta.url)), "utf8");
  assert.match(src, /if \(address && reply\) writeText\(/);
});
