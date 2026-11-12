import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Toasts from "../mods/bot-herdr/toasts.js";
import * as Drawer from "../mods/bot-herdr/drawer.js";
import { segments, fold, hash } from "../mods/bot-herdr/feed.js";
import { blocks, commentsOn } from "../mods/bot-herdr/doc.js";
import { INDICATORS, MOTIONS, roleOf, pickIndex, onTurn } from "../mods/bot-herdr/working.js";

const MOD = fileURLToPath(new URL("../mods/bot-herdr/", import.meta.url));
const BH = join(MOD, "engine", "bh.mjs");

test("toasts: one at a time, no repeats, an action joins the one waiting", () => {
  const q = Toasts.queue();
  const a = Toasts.push(q, "info", "Saved");
  assert.equal(q.current, a);
  Toasts.push(q, "info", "Saved");
  assert.equal(q.waiting.length, 0);
  const b = Toasts.push(q, "error", "Couldn't send");
  Toasts.push(q, "error", "Couldn't send", { action: { label: "Open" } });
  assert.equal(b.action.label, "Open");
  assert.equal(Toasts.stayFor(q), Toasts.HURRY_MS); // others wait: the one shown goes sooner
  for (const m of ["a", "b", "c", "d"]) Toasts.push(q, "warning", m);
  assert.equal(q.waiting.length, Toasts.MAX_WAITING);
  assert.equal(Toasts.dismiss(q, a.id).message, "b");
  assert.equal(Toasts.push(q, "info", "   "), null);
  assert.equal(Toasts.push(q, "nonsense", "x").kind, "info");
});

test("toasts: a notification as one line, and a size that fits its words", () => {
  assert.equal(Toasts.noteText({ title: "Dev needs you", body: "Approve it" }), "Dev needs you · Approve it");
  assert.equal(Toasts.noteText({ title: "", body: "Only body" }), "Only body");
  const measure = (s, size) => s.length * size * 0.55;
  const short = Toasts.toastSize({ message: "Saved" }, 480, measure);
  assert.equal(short.lines, 1);
  assert.ok(short.w < 480 && short.w >= 120);
  const long = Toasts.toastSize({ message: "x".repeat(300), action: { label: "Open" } }, 480, measure);
  assert.equal(long.w, 480);
  assert.ok(long.lines > 1 && long.h === 20 + long.lines * 19);
});

const ask = {
  id: "q1",
  questions: [
    { text: "Layout?", options: [{ label: "A" }, { label: "B" }] },
    { text: "Buttons?", multi: true, options: [{ label: "G" }, { label: "H" }] },
    { text: "Look?", options: [{ label: "X", mockupFile: "/x.html" }, { label: "Y", mockupFile: "/y.html" }, { label: "Z" }] },
  ],
};

test("questions drawer: one at a time, back, multi-select, then every answer together", () => {
  const s = Drawer.start(ask);
  assert.equal(Drawer.current(ask, s).question.text, "Layout?");
  assert.equal(Drawer.answer(ask, s, { picks: ["B"] }), false);
  Drawer.toggle(s, "G");
  Drawer.toggle(s, "H");
  Drawer.toggle(s, "G");
  assert.deepEqual(s.answers[1].picks, ["H"]);
  Drawer.back(s);
  assert.equal(s.step, 0);
  Drawer.answer(ask, s, { picks: ["A"] });
  assert.equal(Drawer.answer(ask, s, { text: " also dark " }), false);
  assert.deepEqual(s.answers[1], { picks: ["H"], text: "also dark" });
  assert.equal(Drawer.left(ask, s), 1);
  assert.equal(Drawer.answer(ask, s, { picks: ["Y"] }), true);
  assert.deepEqual(Drawer.payload(s), [{ picks: ["A"], text: "" }, { picks: ["H"], text: "also dark" }, { picks: ["Y"], text: "" }]);
  assert.equal(Drawer.summary(ask, Drawer.payload(s)), "1. A\n2. H · also dark\n3. Y");
  assert.equal(Drawer.summary(ask, Drawer.payload(Drawer.start(ask))).split("\n")[0], "1. your call");
  assert.ok(Drawer.hasMockups(ask.questions[2]) && !Drawer.hasMockups(ask.questions[0]));
  assert.deepEqual([2, 3, 4, 5, 6].map(Drawer.gridCols), [2, 3, 2, 3, 3]);
});

test("replies: mockup blocks come out as pictures between the words", () => {
  const parts = segments("Two ideas:\n```mockup\n<title>Login</title><div>A</div>\n```\nand\n```html\n<h1>Card</h1>\n```");
  assert.deepEqual(parts.map((p) => p.kind), ["md", "mockup", "md", "mockup"]);
  assert.equal(parts[1].title, "Login");
  assert.equal(parts[3].title, "Card");
  assert.deepEqual(segments("```js\nx\n```"), [{ kind: "md", text: "```js\nx\n```" }]);
  assert.equal(hash("a"), hash("a"));
  assert.notEqual(hash("a"), hash("b"));
});

test("long messages fold past twelve rows, with some slack", () => {
  const measure = (line) => line.length * 7;
  assert.equal(fold("short\nmessage", 400, measure).folded, false);
  assert.equal(fold(Array(14).fill("x").join("\n"), 400, measure).folded, false); // within the slack
  const long = fold(Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n"), 400, measure);
  assert.equal(long.folded, true);
  assert.equal(long.text.split("\n").length, 12);
  assert.equal(long.rows, 30);
});

test("a plan in pieces to comment on, with the line each starts on", () => {
  const md = "# Plan\n\nIntro one\nintro two\n\n## Steps\n1. Do a\n   more a\n2. Do b\n\n```js\nx\n\ny\n```\n| a | b |\n|---|---|";
  const got = blocks(md);
  assert.deepEqual(got.map((b) => b.line), [1, 3, 6, 7, 9, 11, 16]);
  assert.equal(got[3].text, "1. Do a\n   more a");
  const comments = [{ line: 8, text: "x", open: true }, { line: 9, text: "y", open: false }, { line: null, text: "z", open: true }];
  assert.deepEqual(commentsOn(comments, 7, 9).map((x) => x.text), ["x"]);
  assert.deepEqual(commentsOn(comments, 9, 11), []);
});

test("working indicators: five per role, every motion drawn, one agent at a time", () => {
  for (const [role, list] of Object.entries(INDICATORS)) assert.equal(list.length, 5, role);
  assert.equal(MOTIONS.length, 40);
  const source = readFileSync(join(MOD, "indicators.js"), "utf8");
  for (const fx of MOTIONS) assert.ok(source.includes(`case "${fx}"`), `no motion for ${fx}`);
  for (const icon of source.matchAll(/ink\("([a-z]+)"/g)) assert.ok(existsSync(join(MOD, "icons", "fx", `${icon[1]}.svg`)), `missing icon ${icon[1]}`);
  assert.equal(roleOf("Orchestrator"), "oracle");
  assert.equal(roleOf("frontend"), "design");
  assert.equal(roleOf("whatever"), "agent");
  for (let i = 0; i < 50; i++) assert.notEqual(pickIndex(5, 2), 2);
  const list = [{ address: "a" }, { address: "b" }, { address: "c" }];
  assert.equal(onTurn(list, "b", 1).agent.address, "c");
  assert.equal(onTurn(list, "c", 1).agent.address, "a");
  assert.equal(onTurn(list, "gone", 0).index, 0);
  assert.equal(onTurn([], null, 1), null);
});

test("every icon the views name is shipped", () => {
  for (const file of ["composer.js", "chat.js", "work.js", "lightbox.js", "toast.js"]) {
    const source = readFileSync(join(MOD, file), "utf8");
    for (const m of source.matchAll(/ICON\("([a-z-]+)"\)/g)) assert.ok(existsSync(join(MOD, "icons", `${m[1]}.svg`)), `${file}: missing icon ${m[1]}`);
  }
});

// The engine's side.

function bh(args, cwd, env = {}) {
  return spawnSync(process.execPath, [BH, ...args], { cwd, encoding: "utf8", env: { ...process.env, BH_AGENT: "", ...env } });
}

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "bh-git-"));
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: dir });
  return dir;
}

test("git isolation: a task gets its own branch or worktree, and its agents find the project from there", async () => {
  const W = await import("../mods/bot-herdr/engine/lib/workspace.mjs");
  assert.equal(W.branchName("Make the Login page!"), "make-the-login-page");
  assert.equal(W.branchName("..."), "task");
  const dir = repo();
  const made = W.createWorkspace({ cwd: dir, name: "Login page", mode: "worktree" });
  assert.equal(made.mode, "worktree");
  assert.equal(made.branch, "login-page");
  assert.ok(existsSync(made.path));
  assert.match(readFileSync(join(dir, ".git", "info", "exclude"), "utf8"), /\/\.bot-herdr\/worktrees\//);
  const again = W.createWorkspace({ cwd: dir, name: "Login page", mode: "worktree" });
  assert.equal(again.branch, "login-page-2");
  assert.match(W.gitLine(made), /own worktree/);
  assert.equal(W.taskCwd({ git: made }, dir), made.path);
  assert.equal(W.missingWorktree({ git: { ...made, path: join(dir, "gone") } }).startsWith("The worktree"), true);
  assert.equal(typeof W.createWorkspace({ cwd: mkdtempSync(join(tmpdir(), "bh-nogit-")), name: "x", mode: "branch" }), "string");

  // Through bh: the task carries its branch, and bh run in the worktree reads the same tasks.
  const id = JSON.parse(bh(["task", "new", "Fix the header", "--worktree", "--json"], dir).stdout).id;
  const shown = JSON.parse(bh(["task", "show", id, "--json"], dir).stdout);
  assert.equal(shown.git.branch, "fix-the-header");
  assert.equal(shown.cwd, shown.git.path);
  const inside = bh(["task", "show", id], shown.git.path);
  assert.equal(inside.status, 0, inside.stderr);
  assert.match(inside.stdout, /own worktree/);
  const branch = JSON.parse(bh(["task", "new", "Tidy", "--branch", "--json"], dir).stdout);
  assert.equal(branch.git.mode, "branch");
  assert.equal(spawnSync("git", ["branch", "--show-current"], { cwd: dir, encoding: "utf8" }).stdout.trim(), "tidy");
  const off = JSON.parse(bh(["task", "new", "Plain", "--no-git", "--json"], dir).stdout);
  assert.equal(off.git, undefined);
});

test("git isolation is the user's setting, not an agent's", () => {
  const app = mkdtempSync(join(tmpdir(), "bh-app-"));
  const dir = repo();
  const env = { BH_APP_HOME: app };
  assert.match(bh(["access", "--git", "worktree"], dir, env).stdout, /git isolation worktree/);
  assert.equal(JSON.parse(bh(["access", "--json"], dir, env).stdout).git, "worktree");
  assert.notEqual(bh(["access", "--git", "sideways"], dir, env).status, 0);
  const agent = bh(["access", "--git", "off"], dir, { ...env, BH_AGENT: "dev" });
  assert.notEqual(agent.status, 0);
  const task = JSON.parse(bh(["task", "new", "Isolated by setting", "--json"], dir, env).stdout);
  assert.equal(task.git.mode, "worktree");
});

test("comments on a task's steps reach the Orchestrator through bh task show", () => {
  const dir = repo();
  const id = JSON.parse(bh(["task", "new", "Make it", "--no-git", "--json"], dir).stdout).id;
  bh(["task", "steps", id, "Draw it", "Build it"], dir);
  assert.equal(bh(["task", "comment", id, "--step", "2", "Use the orange button"], dir).status, 0);
  assert.equal(bh(["task", "comment", id, "--data", encodeURIComponent("Ship it Friday")], dir).status, 0);
  assert.notEqual(bh(["task", "comment", id, "--step", "9", "nope"], dir).status, 0);
  const text = bh(["task", "show", id], dir).stdout;
  assert.match(text, /step 2 \("Build it"\): Use the orange button/);
  assert.match(text, /the task: Ship it Friday/);
  bh(["task", "resolve", id], dir);
  assert.doesNotMatch(bh(["task", "show", id], dir).stdout, /Open comments/);
});

// One comment edited, resolved or deleted, on a task (`kind` "task") or a plan ("plan").
function oneCommentAtATime(kind, id, dir) {
  const run = (...a) => bh([kind, ...a, "--json"], dir);
  const add = (text) => JSON.parse(run("comment", id, text).stdout);
  add("First");
  add("Second");
  assert.equal(JSON.parse(run("comment", id, "--delete", "c1").stdout).id, "c1");
  assert.equal(add("Third").id, "c3");
  assert.equal(JSON.parse(run("resolve", id, "--comment", "c3").stdout).open, false);
  const edited = JSON.parse(run("comment", id, "--edit", "c3", "--data", encodeURIComponent("Third, better")).stdout);
  assert.deepEqual([edited.text, edited.open, typeof edited.edited], ["Third, better", true, "string"]);
  assert.equal(JSON.parse(run("resolve", id, "--comment", "c2").stdout).open, false);
  const comments = JSON.parse(run("show", id).stdout).comments;
  assert.deepEqual(comments.map((c) => `${c.id}:${c.open}`), ["c2:false", "c3:true"]);
  const missing = bh([kind, "resolve", id, "--comment", "c9"], dir);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, new RegExp(`${kind === "task" ? "Task" : "Plan"} ${id} has no comment c9\\.`));
  assert.notEqual(bh([kind, "comment", id, "--delete", "c1"], dir).status, 0);
}

test("one task comment at a time: ids stay unique after a delete, edit reopens, resolve leaves the rest", () => {
  const dir = repo();
  const id = JSON.parse(bh(["task", "new", "Make it", "--no-git", "--json"], dir).stdout).id;
  oneCommentAtATime("task", id, dir);
  const text = bh(["task", "show", id], dir).stdout;
  assert.match(text, /the task: Third, better/);
  assert.doesNotMatch(text, /Second/);
});

test("one plan comment at a time: ids stay unique after a delete, edit reopens, resolve leaves the rest", () => {
  const dir = repo();
  const id = JSON.parse(bh(["plan", "new", "Add login", "--json"], dir).stdout).id;
  oneCommentAtATime("plan", id, dir);
});

test("pictures: the browser found, the page wrapped, the screenshot asked for", async () => {
  const M = await import("../mods/bot-herdr/engine/lib/media.mjs");
  assert.equal(M.findBrowser({ env: { BH_BROWSER: "/b/chrome" }, exists: (p) => p === "/b/chrome" }), "/b/chrome");
  const win = M.findBrowser({ env: { PROGRAMFILES: "C:\\PF" }, platform: "win32", exists: (p) => p.includes("Edge") });
  assert.match(win, /msedge\.exe$/);
  assert.equal(M.findBrowser({ env: {}, platform: "linux", which: (n) => (n === "chromium" ? "/usr/bin/chromium" : null) }), "/usr/bin/chromium");
  assert.equal(M.findBrowser({ env: {}, platform: "linux", which: () => null }), null);
  assert.match(M.page("<div>x</div>"), /^<!doctype html>.*<div>x<\/div><\/body><\/html>$/s);
  assert.equal(M.page("<html><body>y</body></html>"), "<html><body>y</body></html>");
  const args = M.screenshotArgs("/m/a.html", "/m/a.png", "/tmp/p", { sandbox: false });
  assert.ok(args.includes("--screenshot=/m/a.png") && args.includes("--no-sandbox") && args.includes("--window-size=1200,825"));
  assert.ok(args.at(-1).startsWith("file://"));
});

const SHELL = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";

test("bh mockup draws a page with a headless browser", { skip: !existsSync(SHELL) && "no headless browser here" }, () => {
  const app = mkdtempSync(join(tmpdir(), "bh-app-"));
  const file = join(app, "m.html");
  writeFileSync(file, '<div style="padding:40px;font:32px sans-serif;color:#c96442">Hello mockup</div>');
  const r = bh(["mockup", file, "--json"], app, { BH_APP_HOME: app, BH_BROWSER: SHELL });
  assert.equal(r.status, 0, r.stderr);
  const got = JSON.parse(r.stdout);
  assert.equal(got.image, "m.png");
  assert.ok(readFileSync(got.png).subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
  const preview = JSON.parse(bh(["preview", got.png, "--json"], app, { BH_APP_HOME: app }).stdout);
  assert.equal(preview[0].image, "m.png");
});

test("the layout hands herdr's notifications to the chat", () => {
  const layout = JSON.parse(readFileSync(fileURLToPath(new URL("../layouts/bot-herdr.json", import.meta.url)), "utf8"));
  assert.equal(layout.toast, "bot-herdr");
});
