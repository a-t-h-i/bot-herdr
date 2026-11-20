// The pure parts of the UI polish: task ids linked in the feed, a typed number answering a
// question, and the planning seats taken from the team.

import { test } from "node:test";
import assert from "node:assert/strict";
import { linkTasks, taskTarget, TASK_LINK } from "../mods/bot-herdr/feed.js";
import { numberPick } from "../mods/bot-herdr/drawer.js";
import { seatsOf, seatStates } from "../mods/bot-herdr/signals.js";

test("linkTasks: links task ids, leaves code and existing links alone", () => {
  const id = "t-20261120-n1rc";
  assert.equal(linkTasks(`see ${id}.`), `see [${id}](${TASK_LINK}${id}).`);
  assert.equal(linkTasks(`\`${id}\``), `\`${id}\``);
  assert.equal(linkTasks(`[the task](${id})`), `[the task](${id})`);
  assert.equal(linkTasks("```\n" + id + "\n```"), "```\n" + id + "\n```");
  assert.equal(linkTasks("t-2026112-n1rc and xt-20261120-n1rc"), "t-2026112-n1rc and xt-20261120-n1rc");
  assert.equal(taskTarget(`${TASK_LINK}${id}`), id);
  assert.equal(taskTarget("https://example.com"), null);
});

test("numberPick: a lone digit within the options picks that option; anything else is text", () => {
  const q = { options: [{ label: "A" }, { label: "B" }] };
  assert.equal(numberPick("2", q).label, "B");
  assert.equal(numberPick("3", q), null);
  assert.equal(numberPick("0", q), null);
  assert.equal(numberPick("12", q), null);
  assert.equal(numberPick("2 please", q), null);
  assert.equal(numberPick("1", {}), null);
});

test("seatsOf: built-in seats in order, then a custom agent", () => {
  const list = [{ role: "orchestrator", name: "Orchestrator" }, { role: "dev", name: "Dev" }, { role: "custom", name: "security Lead" }];
  const seats = seatsOf(list);
  assert.deepEqual(seats.map((s) => s.id), ["orchestrator", "dev", "design", "qa", "research", "security-lead"]);
  assert.deepEqual(seats.at(-1), { id: "security-lead", short: "Sec", name: "security Lead" });
  assert.equal(seats[0].fixed, true);
  const states = seatStates([{ name: "security-lead-panel", state: "live", status: "working" }], seats);
  assert.equal(states["security-lead"], "working");
});
