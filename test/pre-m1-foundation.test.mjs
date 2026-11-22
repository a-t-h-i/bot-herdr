// pre-M1 foundation: the additive bh dispatchers (ui-audit, home, thread, approvals, review,
// goal progress) and the approvals permission hook. Every command is real as of M6 (ui-audit from
// M1, home/thread/goal progress from M4, approvals/review from M6); all must stay listed in help
// and answer with their stable JSON shapes.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-pre-m1-"));
after(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {}
});

const root = fileURLToPath(new URL("../", import.meta.url));
const bh = join(root, "mods", "bot-herdr", "engine", "bh.mjs");
const runBh = (...args) => spawnSync(process.execPath, [bh, ...args], { cwd: tmp, encoding: "utf8", env: { ...process.env, BH_APP_HOME: join(tmp, "app"), HC_TERMINAL_ID: "", BH_AGENT: "" }, timeout: 60_000 });

test("bh help lists the redesign foundation commands", () => {
  const r = runBh("help");
  assert.equal(r.status, 0, r.stderr);
  for (const line of [/^\s+bh ui-audit\b/m, /^\s+bh home\b/m, /^\s+bh thread\b/m, /^\s+bh approvals\b/m, /^\s+bh review\b/m, /^\s+bh goal progress\b/m]) {
    assert.match(r.stdout, line);
  }
});

test("the redesigned commands answer --json with stable shapes", () => {
  const home = runBh("home", "--json");
  assert.equal(home.status, 0, home.stderr);
  const page = JSON.parse(home.stdout);
  assert.equal(page.command, "home");
  assert.ok(Array.isArray(page.needsYou) && Array.isArray(page.review));
  assert.ok(page.header && page.fleet && page.spendToday);
  const threads = runBh("thread", "--json");
  assert.equal(threads.status, 0, threads.stderr);
  const list = JSON.parse(threads.stdout);
  assert.equal(list.command, "thread");
  assert.equal(list.sub, "list");
  assert.deepEqual(list.threads, []);
  const goal = runBh("goal", "progress", "--json");
  assert.equal(goal.status, 0, goal.stderr);
  assert.equal(JSON.parse(goal.stdout).command, "goal progress");
  const approvals = runBh("approvals", "list", "--json");
  assert.equal(approvals.status, 0, approvals.stderr);
  assert.deepEqual(JSON.parse(approvals.stdout), { approvals: [] });
  for (const r of [home, threads, goal, approvals]) assert.doesNotMatch(r.stdout, /not implemented yet/);
});

test("maybeHoldPermission does not hold under autonomous mode or full access", async () => {
  const { maybeHoldPermission } = await import(new URL("../mods/bot-herdr/engine/lib/approvals.mjs", import.meta.url));
  const base = {
    req: { id: 7, method: "session/request_permission" },
    call: { toolCallId: "call-1", kind: "execute", rawInput: { command: "rm -rf build" } },
    options: [{ kind: "reject_once", optionId: "no" }],
    command: "rm -rf build",
    root: tmp,
    send: () => {},
    on: () => {},
  };
  assert.deepEqual(maybeHoldPermission({ ...base, access: "standard", autonomy: "autonomous" }), { handled: false });
  assert.deepEqual(maybeHoldPermission({ ...base, access: "full", autonomy: "guarded" }), { handled: false });
});
