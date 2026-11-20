// The skills cache: an answer is kept for a day, but a skills folder that changed since makes it
// stale, so a skill installed after the last read is seen without --refresh.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bh-tools-cache-"));
process.env.BH_APP_HOME = join(tmp, "app");
const T = await import("../mods/bot-herdr/engine/lib/tools.mjs");

const home = join(tmp, "home");
const root = join(tmp, "project");
mkdirSync(home, { recursive: true });
mkdirSync(root, { recursive: true });
const skill = (dir, name) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\nBody.\n`);
};
const names = (r) => r.skills.map((s) => s.name);
/** A folder changed as installing a skill changes it: its mtime moves on. */
const touched = (dir) => {
  const later = new Date(Date.now() + 2000);
  utimesSync(dir, later, later);
};

test("claude: a skill folder added after the cached read is seen without --refresh", () => {
  const skills = join(home, ".claude", "skills");
  skill(join(skills, "first"), "first");
  assert.deepEqual(names(T.listTools("claude", { home, root, env: {} })), ["first"]);
  skill(join(skills, "second"), "second");
  touched(skills);
  assert.deepEqual(names(T.listTools("claude", { home, root, env: {} })).sort(), ["first", "second"]);
});

test("claude: an unchanged folder keeps the cached answer, and --refresh reads again", () => {
  const skills = join(home, ".claude", "skills");
  skill(join(skills, "first"), "renamed"); // inside one skill: the skills folder itself is unchanged
  assert.deepEqual(names(T.listTools("claude", { home, root, env: {} })).sort(), ["first", "second"]);
  assert.deepEqual(names(T.listTools("claude", { home, root, env: {}, refresh: true })).sort(), ["renamed", "second"]);
});

test("codex: a skill folder added under CODEX_HOME is seen without --refresh", () => {
  const codexHome = join(home, "custom-codex");
  const skills = join(codexHome, "skills");
  skill(join(skills, "one"), "one");
  assert.deepEqual(names(T.listTools("codex", { home, root, env: { CODEX_HOME: codexHome } })), ["one"]);
  skill(join(skills, "two"), "two");
  touched(skills);
  assert.deepEqual(names(T.listTools("codex", { home, root, env: { CODEX_HOME: codexHome } })).sort(), ["one", "two"]);
});
