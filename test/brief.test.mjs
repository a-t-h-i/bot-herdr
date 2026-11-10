import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIEFED, teamBrief, withBrief, briefed } from "../mods/bot-herdr/brief.js";

const known = [
  { key: "claude", name: "Claude Code", run: ["claude"], installed: true },
  { key: "codex", name: "Codex", run: ["codex", "--no-daemon"], installed: true },
  { key: "aider", name: "Aider", run: ["aider"], installed: false },
];

test("the brief names the exact commands and the rules", () => {
  const b = teamBrief({ known, self: "t3" });
  assert.match(b, /`t3`/);
  assert.match(b, /hc --skill/);
  assert.match(b, /hc run --bg --name <short-name> --cwd <repo> claude "/);
  assert.match(b, /`codex --no-daemon` \(Codex\)/);
  assert.doesNotMatch(b, /Aider/);
  assert.match(b, /hc wait --children all/);
  assert.match(b, /hc send \$HC_TERMINAL_ID/);
  assert.match(b, /not your built-in sub-agent tool/);
  assert.match(b, /At most 4 children/);
});

test("no installed agents: it says how to find out", () => {
  assert.match(teamBrief({ known: [] }), /hc templates/);
  assert.match(teamBrief(), /\$HC_TERMINAL_ID/);
});

test("the brief goes before the person's words, once", () => {
  const m = withBrief("fix the bug", { known });
  assert.ok(m.startsWith("[bot-herdr team brief"));
  assert.ok(m.endsWith("\n\nfix the bug"));
  assert.equal(briefed({ labels: { [BRIEFED]: "1" } }), true);
  assert.equal(briefed({ labels: {} }), false);
  assert.equal(briefed(undefined), false);
});
