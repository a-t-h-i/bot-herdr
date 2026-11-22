// Pure tests for the working animation table (working.js): the spec's six cycles, their verbs,
// the verb rotation at the VERB_MS edge, and the reduced-motion freeze — no herdr or gpui.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ACTIVITIES, ACTIVITY_NAMES, VERB_MS, verbFor, framesFor } from "../mods/bot-herdr/working.js";

test("the six cycles are the spec's: thinking, reading, editing, testing, waiting, orchestrating", () => {
  assert.deepEqual(ACTIVITY_NAMES, ["thinking", "reading", "editing", "testing", "waiting", "orchestrating"]);
  assert.deepEqual(ACTIVITIES.thinking.frames, ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"]);
  assert.deepEqual(ACTIVITIES.reading.frames, ["▖", "▘", "▝", "▗"]);
  assert.deepEqual(ACTIVITIES.editing.frames, ["▁", "▃", "▅", "▇", "▅", "▃"]);
  assert.deepEqual(ACTIVITIES.testing.frames, ["▱▱▱", "▰▱▱", "▰▰▱", "▰▰▰"]);
  assert.deepEqual(ACTIVITIES.waiting.frames, ["·", "•", "●", "•"]);
  assert.deepEqual(ACTIVITIES.orchestrating.frames, ["◜", "◝", "◞", "◟"]);
  assert.equal(VERB_MS, 4000, "the spec: the verb shows at most every 4 s");
});

test("each cycle's verbs are the spec's words", () => {
  assert.deepEqual(ACTIVITIES.thinking.verbs, ["Thinking", "Weighing", "Mulling"]);
  assert.deepEqual(ACTIVITIES.reading.verbs, ["Reading", "Scanning"]);
  assert.deepEqual(ACTIVITIES.editing.verbs, ["Writing", "Shaping"]);
  assert.deepEqual(ACTIVITIES.testing.verbs, ["Testing", "Checking"]);
  assert.deepEqual(ACTIVITIES.waiting.verbs, ["Waiting"]);
  assert.deepEqual(ACTIVITIES.orchestrating.verbs, ["Coordinating"]);
  for (const activity of ACTIVITY_NAMES) {
    for (const verb of ACTIVITIES[activity].verbs) assert.ok(typeof verb === "string" && verb.length > 0);
  }
});

test("the verb is constant inside one VERB_MS window and turns at the edge", () => {
  for (const activity of ACTIVITY_NAMES) {
    const set = ACTIVITIES[activity].verbs;
    const at0 = verbFor(activity, 0);
    assert.equal(verbFor(activity, 1), at0);
    assert.equal(verbFor(activity, VERB_MS - 1), at0);
    if (set.length > 1) assert.notEqual(verbFor(activity, VERB_MS), at0, `${activity} rotates its verb`);
    else assert.equal(verbFor(activity, VERB_MS), at0);
  }
  assert.equal(verbFor("waiting", 0, "QA"), "Waiting on QA");
  assert.equal(verbFor("waiting", 5000, null), "Waiting");
});

test("reduced motion freezes every cycle on its first glyph", () => {
  for (const activity of ACTIVITY_NAMES) {
    assert.deepEqual(framesFor(activity, true), [ACTIVITIES[activity].frames[0]]);
    assert.deepEqual(framesFor(activity, false), ACTIVITIES[activity].frames);
  }
});
