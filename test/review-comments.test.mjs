// Review comments: unified diff parsing (add/del/ctx with line numbers, truncation), git diff
// against a task's base commit, comment CRUD store, and sending open comments to Dev on the board.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-review-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.HC_TERMINAL_ID = "";
process.env.BH_AGENT = "";

after(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
});

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const T = await import(new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url));
const RC = await import(new URL("../mods/bot-herdr/engine/lib/review-comments.mjs", import.meta.url));

const runBh = (args) => spawnSync(process.execPath, [BH, ...args], {
  cwd: PROJECT,
  encoding: "utf8",
  env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", BH_AGENT: "" },
  timeout: 60_000,
});

test("parseUnifiedDiff parses add/del/ctx with accurate old/new line numbers and truncates at limit", () => {
  const raw = [
    "diff --git a/mods/x.js b/mods/x.js",
    "index 1111111..2222222 100644",
    "--- a/mods/x.js",
    "+++ b/mods/x.js",
    "@@ -1,4 +1,5 @@",
    " const a = 1;",
    "-const b = 2;",
    "+const b = 20;",
    "+const c = 30;",
    " const d = 4;",
    "\\ No newline at end of file",
    "",
  ].join("\n");

  const parsed = RC.parseUnifiedDiff(raw);
  assert.equal(parsed.truncated, false);
  assert.equal(parsed.hunks.length, 1);
  assert.equal(parsed.hunks[0].header, "@@ -1,4 +1,5 @@");
  assert.deepEqual(parsed.hunks[0].lines, [
    { kind: "ctx", old: 1, new: 1, text: "const a = 1;" },
    { kind: "del", old: 2, new: null, text: "const b = 2;" },
    { kind: "add", old: null, new: 2, text: "const b = 20;" },
    { kind: "add", old: null, new: 3, text: "const c = 30;" },
    { kind: "ctx", old: 3, new: 4, text: "const d = 4;" },
  ]);

  // Truncation cap: > maxLines sets truncated: true and stops emitting lines.
  const many = ["@@ -1,10 +1,10 @@", ...Array.from({ length: 12 }, (_, i) => `+line ${i + 1}`)].join("\n");
  const capped = RC.parseUnifiedDiff(many, 5);
  assert.equal(capped.truncated, true);
  assert.equal(capped.hunks[0].lines.length, 5);
  assert.equal(capped.hunks[0].lines[4].new, 5);
});

test("bh review diff reads the task's base commit diff, and add/list/remove/send follow the contract", () => {
  const git = (...args) => spawnSync("git", args, { cwd: PROJECT, encoding: "utf8" });
  assert.equal(git("init").status, 0);
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(PROJECT, "app.js"), "one\ntwo\nthree\n");
  git("add", "app.js");
  git("commit", "-m", "init");
  const base = git("rev-parse", "HEAD").stdout.trim();

  const task = T.newTask(PROJECT, { request: "Review app.js", title: "Review app" });
  T.updateTask(PROJECT, task.id, (t) => {
    t.base = base;
    t.git = { mode: "branch", branch: "review-app", base };
  });
  writeFileSync(join(PROJECT, "app.js"), "one\ntwo-updated\nthree\nfour\n");

  const diffRes = runBh(["review", "diff", task.id, "app.js", "--json"]);
  assert.equal(diffRes.status, 0, diffRes.stderr);
  const diff = JSON.parse(diffRes.stdout);
  assert.equal(diff.path, "app.js");
  assert.equal(diff.truncated, false);
  assert.equal(diff.hunks.length, 1);
  assert.ok(diff.hunks[0].lines.some((l) => l.kind === "del" && l.old === 2 && l.text === "two"));
  assert.ok(diff.hunks[0].lines.some((l) => l.kind === "add" && l.new === 2 && l.text === "two-updated"));
  assert.ok(diff.hunks[0].lines.some((l) => l.kind === "add" && l.new === 4 && l.text === "four"));

  // Add two comments, remove one, add another, list oldest first.
  const c1 = JSON.parse(runBh(["review", "add", task.id, "app.js", "2", "Rename two-updated", "--json"]).stdout);
  assert.match(c1.id, /^rc-[0-9a-f]{8}$/);
  assert.equal(c1.path, "app.js");
  assert.equal(c1.line, 2);
  assert.equal(c1.text, "Rename two-updated");
  assert.equal(c1.state, "open");

  const c2 = JSON.parse(runBh(["review", "add", task.id, "app.js", "4", "Remove extra line", "--json"]).stdout);
  const c3 = JSON.parse(runBh(["review", "add", task.id, "app.js", "3", "Temporary note", "--json"]).stdout);

  const rem = runBh(["review", "remove", task.id, c3.id, "--json"]);
  assert.equal(rem.status, 0, rem.stderr);
  assert.deepEqual(JSON.parse(rem.stdout), { ok: true });

  const listed = JSON.parse(runBh(["review", "list", task.id, "--json"]).stdout);
  assert.deepEqual(listed.comments.map((c) => c.id), [c1.id, c2.id]);

  // Send posts one board note from user to dev and marks comments sent.
  const sent = runBh(["review", "send", task.id, "--json"]);
  assert.equal(sent.status, 0, sent.stderr);
  assert.deepEqual(JSON.parse(sent.stdout), { sent: 2, entry: 1 });

  const entries = T.board(PROJECT, task.id);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, "note");
  assert.equal(entries[0].from, "user");
  assert.equal(entries[0].to, "dev");
  assert.equal(entries[0].text, "Review comments:\n- app.js:2 — Rename two-updated\n- app.js:4 — Remove extra line");

  const afterSend = JSON.parse(runBh(["review", "list", task.id, "--json"]).stdout);
  assert.ok(afterSend.comments.every((c) => c.state === "sent"));

  // Second send with no open comments does not post again.
  const second = runBh(["review", "send", task.id, "--json"]);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(second.stdout), { sent: 0, entry: null });
  assert.equal(T.board(PROJECT, task.id).length, 1);
});
