// Knowledge follows the project (step 2 for t-20261112-8jkz): each project's Scout is its own, and
// a saved conversation belongs to the project it was started in.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.BH_APP_HOME = mkdtempSync(join(tmpdir(), "bh-ps-"));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

test("each project's Scout is named by its folder: six hex of sha1, slashes and case ignored", async () => {
  const { scoutName } = await lib("lib/team.mjs");
  const name = scoutName("C:\\Users\\me\\proj");
  assert.match(name, /^knowledge-scout-[0-9a-f]{6}$/);
  assert.equal(name, `knowledge-scout-${createHash("sha1").update("c:/users/me/proj").digest("hex").slice(0, 6)}`);
  assert.equal(scoutName("c:/users/me/proj"), name);
  assert.notEqual(scoutName("C:/Users/me/other"), name);
});

test("a conversation for another project starts over; one for this project resumes", async () => {
  const { resumeState } = await lib("lib/agent.mjs");
  const here = { harness: "claude", root: "/p/a" };
  assert.deepEqual(resumeState(null, here), { state: { harness: "claude", session: null, root: "/p/a" }, moved: false });
  const same = { harness: "claude", session: "s1", root: "/p/a" };
  assert.deepEqual(resumeState(same, here), { state: same, moved: false });
  const other = { harness: "claude", session: "s1", root: "/p/b" };
  assert.deepEqual(resumeState(other, here), { state: { harness: "claude", session: null, root: "/p/a" }, moved: true });
});

test("a conversation saved before roots were kept keeps its session and takes this project's root", async () => {
  const { resumeState } = await lib("lib/agent.mjs");
  const old = { harness: "claude", session: "s1" };
  assert.deepEqual(resumeState(old, { harness: "claude", root: "/p/a" }), { state: { harness: "claude", session: "s1", root: "/p/a" }, moved: false });
});

test("a harness change starts a new conversation, for this project", async () => {
  const { resumeState } = await lib("lib/agent.mjs");
  const got = resumeState({ harness: "codex", session: "s1", root: "/p/a" }, { harness: "claude", root: "/p/a" });
  assert.deepEqual(got, { state: { harness: "claude", session: null, root: "/p/a" }, moved: false });
});
