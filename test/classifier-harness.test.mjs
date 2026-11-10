// The classifier on an installed harness: one prompt in, System One answers out.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promptFor, readAnswers, classifierArgv, canClassify } from "../mods/bot-herdr/engine/classifier/harness.mjs";
import { choice, choiceOf, noul, score, scoreOf, yesOf } from "../mods/bot-herdr/engine/classifier/client.mjs";

const request = {
  state: { request: "Rename the button" },
  questions: {
    size: score("How big?", ["trivial: tiny", "small: few files"]),
    ambiguous: noul("Unclear?", "Yes", "No"),
    kind: choice("What kind?", { feature: "New", bugfix: "Broken" }),
  },
};

test("the prompt carries the state, each question and the JSON it wants", () => {
  const p = promptFor(request);
  assert.match(p, /"request": "Rename the button"/);
  assert.match(p, /### size \(score\)[\s\S]*- 0: trivial/);
  assert.match(p, /- bugfix: Broken/);
  assert.match(p, /only one JSON object/);
});

test("the model's JSON reads back as System One answers; junk is skipped", () => {
  const got = readAnswers('Sure:\n```json\n{"size": {"type":"score","score":0,"confidence":0.9}, "ambiguous": 0.1, "kind": "bugfix", "extra": 1}\n```', request);
  assert.equal(scoreOf(got.answers, "size").level, 0);
  assert.equal(yesOf(got.answers, "ambiguous"), 0.1);
  assert.equal(choiceOf(got.answers, "kind").choice, "bugfix");
  assert.equal(readAnswers('{"kind": "nonsense"}', request), null);
  assert.equal(readAnswers("no json here", request), null);
});

test("each harness runs once, non-interactive, with the chosen model", () => {
  const known = [{ key: "claude", run: ["claude"], installed: true }, { key: "codex", run: ["codex", "--no-daemon"], installed: true }];
  assert.deepEqual(classifierArgv("claude", "claude-haiku-5-5", known), ["claude", "--model", "claude-haiku-5-5", "-p", "--output-format", "text", "--max-turns", "1"]);
  assert.deepEqual(classifierArgv("codex", "", known), ["codex", "--no-daemon", "exec", "--skip-git-repo-check", "--sandbox", "read-only", "-"]);
  assert.equal(canClassify("antigravity"), false);
});
