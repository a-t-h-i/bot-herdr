// Knowledge: `bh knowledge inbox` lists a task's report proposals that are not recorded yet, and
// `forBrief` cuts a knowledge file by whole sections instead of mid-file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-inbox-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const run = (args) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", PATH: "" } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const REPORT = `## Summary

Built the endpoint.

## Knowledge Proposals

- bh --data is URI-encoded
- A stale lock needs a token to release

## Verification

- node --test test/x.test.mjs — pass
`;

test("bh knowledge inbox: a task's proposals, minus those already recorded", async () => {
  const T = await lib("lib/tasks.mjs");
  const K = await lib("lib/knowledge.mjs");
  const task = T.newTask(PROJECT, { request: "Proposals", steps: ["One"] });
  T.report(PROJECT, task.id, { step: 1, summary: "Done", file: "reports/dev.md", from: "dev" });
  mkdirSync(join(PROJECT, "reports"), { recursive: true });
  writeFileSync(join(PROJECT, "reports", "dev.md"), REPORT);

  const listed = run(["knowledge", "inbox", "--task", task.id]);
  assert.equal(listed.code, 0, listed.err);
  assert.deepEqual(listed.out.trim().split("\n"), [
    "- bh --data is URI-encoded — reports/dev.md",
    "- A stale lock needs a token to release — reports/dev.md",
  ]);

  K.add(PROJECT, "dev", "bh --data is URI-encoded");
  assert.equal(run(["knowledge", "inbox", "--task", task.id]).out.trim(), "- A stale lock needs a token to release — reports/dev.md");

  K.add(PROJECT, "dev", "A stale lock needs a token to release");
  assert.equal(run(["knowledge", "inbox", "--task", task.id]).out.trim(), "No new proposals.");
});

test("forBrief: whole sections up to the budget, the cut ones named", async () => {
  const K = await lib("lib/knowledge.mjs");
  const root = mkdtempSync(join(tmp, "k-"));
  const facts = Array.from({ length: 20 }, (_, i) => `- fact ${i}: ${"x".repeat(40)}`).join("\n");
  const md = `# dev: what I know about this project\n\n## Facts\n${facts}\n\n## Standards\n- Keep functions small.\n\n## Decisions\n- Choose the boring option.\n`;
  K.write(root, "dev", md);

  assert.equal(K.forBrief(root, "dev", 10000), md.trim()); // under the budget: unchanged

  // The budget reaches the end of Standards but not Decisions: whole sections are kept.
  const cut = K.forBrief(root, "dev", md.indexOf("## Decisions"));
  assert.match(cut, /## Facts\n- fact 0: /);
  assert.match(cut, /- fact 19: /);
  assert.match(cut, /## Standards\n- Keep functions small\./);
  assert.doesNotMatch(cut, /boring/);
  assert.match(cut, /\[… cut: Decisions; the whole file is in `bh knowledge dev`\]$/);

  // One character over the budget: the newline after the head counts, so a section is named, never none.
  const edge = K.forBrief(root, "dev", md.trim().length - 1);
  assert.doesNotMatch(edge, /\[… cut: ;/);
  assert.match(edge, /\[… cut: Decisions; the whole file is in `bh knowledge dev`\]$/);

  // The first section alone is over the budget: whole entries up to the last that fits, and it is named.
  const tight = K.forBrief(root, "dev", 150);
  assert.match(tight, /## Facts\n- fact 0: /);
  assert.doesNotMatch(tight, /- fact 19: /);
  assert.match(tight, /\[… cut: Facts, Standards, Decisions; the whole file is in `bh knowledge dev`\]$/);

  // No `## ` section at all: cut at the budget with the pointer, never a throw.
  K.write(root, "dev", `- ${"y".repeat(300)}\n`);
  const flat = K.forBrief(root, "dev", 100);
  assert.ok(flat.startsWith(`- ${"y".repeat(98)}\n\n`));
  assert.match(flat, /\[… cut: the whole file is in `bh knowledge dev`\]$/);
});
