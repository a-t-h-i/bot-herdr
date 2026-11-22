// Approvals: store round-trips, dead-pid filtering, corrupt-file tolerance, project allowlist,
// ACP permission hold/answer delivery (once, project, deny), autonomy gating, and CLI contract.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-approvals-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
const WORKTREE = join(PROJECT, ".bot-herdr", "worktrees", "wt-one");
mkdirSync(join(PROJECT, ".git"), { recursive: true });
mkdirSync(WORKTREE, { recursive: true });
writeFileSync(join(WORKTREE, ".git"), "gitdir: ../../.git/worktrees/wt-one\n");

process.env.BH_APP_HOME = APP;
process.env.HC_TERMINAL_ID = "";
process.env.BH_AGENT = "";

const watchers = [];
after(() => {
  for (const stop of watchers) {
    try { stop(); } catch {}
  }
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
});

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const AP = await import(new URL("../mods/bot-herdr/engine/lib/approvals.mjs", import.meta.url));
const { Acp } = await import(new URL("../mods/bot-herdr/engine/lib/runner.mjs", import.meta.url));
const { saveResilienceConfig } = await import(new URL("../mods/bot-herdr/engine/lib/resilience.mjs", import.meta.url));

const runBh = (args, cwd = PROJECT) => spawnSync(process.execPath, [BH, ...args], {
  cwd,
  encoding: "utf8",
  env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", BH_AGENT: "" },
  timeout: 60_000,
});

const OPTIONS = [
  { kind: "allow_once", optionId: "opt-once" },
  { kind: "allow_always", optionId: "opt-always" },
  { kind: "reject_once", optionId: "opt-deny" },
];

/** Returns a pid that is guaranteed to have exited. */
function deadPid() {
  const child = spawnSync(process.execPath, ["-e", ""]);
  assert.ok(child.pid && child.pid > 0);
  return child.pid;
}

/** Polls a predicate up to `timeoutMs` so file-watch tests stay deterministic and fast. */
async function waitFor(predicate, timeoutMs = 3000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail("timed out waiting for approval delivery");
}

test("store round-trip, worktree sharing, oldest-first order, dead-pid and corrupt-file tolerance", () => {
  const dir = join(PROJECT, ".bot-herdr", "approvals");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "corrupt.json"), "{ not valid json");
  writeFileSync(join(dir, "array.json"), "[]");
  writeFileSync(join(dir, "ap-dead0001.json"), JSON.stringify({
    id: "ap-dead0001", task: null, agent: "dev", from: "dev-dead", title: "Run",
    command: "echo dead", kind: "execute", at: 1000, pid: deadPid(), status: "pending", answer: null, answeredAt: null,
  }));
  writeFileSync(join(dir, "ap-done0001.json"), JSON.stringify({
    id: "ap-done0001", task: null, agent: "dev", from: "dev-done", title: "Run",
    command: "echo done", kind: "execute", at: 1500, pid: process.pid, status: "answered", answer: "once", answeredAt: 1600,
  }));
  writeFileSync(join(dir, "ap-live0002.json"), JSON.stringify({
    id: "ap-live0002", task: "t-1", agent: "dev", from: "dev-2", title: "Run newer",
    command: "npm publish", kind: "execute", at: 3000, pid: process.pid, status: "pending", answer: null, answeredAt: null,
  }));
  writeFileSync(join(dir, "ap-live0001.json"), JSON.stringify({
    id: "ap-live0001", task: "t-1", agent: "dev", from: "dev-1", title: "Run older",
    command: "npm run deploy", kind: "execute", at: 2000, pid: process.pid, status: "pending", answer: null, answeredAt: null,
  }));

  const listed = AP.listHeld(PROJECT);
  assert.deepEqual(listed.map((r) => r.id), ["ap-live0001", "ap-live0002"]);
  // A task worktree reads the same main project's approvals store.
  assert.deepEqual(AP.listHeld(WORKTREE).map((r) => r.id), ["ap-live0001", "ap-live0002"]);

  const cli = runBh(["approvals", "list", "--json"]);
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout).approvals.map((r) => r.id), ["ap-live0001", "ap-live0002"]);
});

test("answer project writes .bot-herdr/config.json allowlist; unknown or double answer fails with exit 1", () => {
  // Corrupt config returns [] rather than throwing.
  writeFileSync(join(PROJECT, ".bot-herdr", "config.json"), "{ broken");
  assert.deepEqual(AP.projectAllow(PROJECT), []);

  const ans = runBh(["approvals", "answer", "ap-live0002", "project", "--json"]);
  assert.equal(ans.status, 0, ans.stderr);
  assert.deepEqual(JSON.parse(ans.stdout), { id: "ap-live0002", answer: "project", ok: true });
  assert.deepEqual(AP.projectAllow(PROJECT), ["npm publish"]);
  const cfg = JSON.parse(readFileSync(join(PROJECT, ".bot-herdr", "config.json"), "utf8"));
  assert.deepEqual(cfg, { agents: { allow: ["npm publish"] } });

  // Already answered: exit 1 + { ok: false, error }.
  const again = runBh(["approvals", "answer", "ap-live0002", "once", "--json"]);
  assert.equal(again.status, 1);
  const againJson = JSON.parse(again.stdout);
  assert.equal(againJson.ok, false);
  assert.equal(typeof againJson.error, "string");

  // Unknown id: exit 1 + { ok: false, error }.
  const missing = runBh(["approvals", "answer", "ap-ffffffff", "deny", "--json"]);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).ok, false);
});

test("hold -> answer delivers allow_once, allow_always (with fallback), and reject_once + Refused tool line", async () => {
  // 1. once -> allow_once
  const sentOnce = [];
  const h1 = AP.maybeHoldPermission({
    req: { id: 10 },
    call: { title: "Run shell", kind: "execute" },
    options: OPTIONS,
    command: "cargo publish",
    access: "standard",
    autonomy: "ask",
    root: PROJECT,
    agent: { role: "dev", name: "dev-m6e" },
    interval: 50,
    send: (msg) => sentOnce.push(msg),
    on: () => {},
  });
  watchers.push(h1.stop);
  assert.equal(h1.handled, true);
  assert.match(h1.id, /^ap-[0-9a-f]{8}$/);
  assert.equal(sentOnce.length, 0);

  const a1 = AP.answerApproval(PROJECT, h1.id, "once");
  assert.deepEqual(a1, { id: h1.id, answer: "once", ok: true });
  await waitFor(() => sentOnce.length === 1);
  assert.deepEqual(sentOnce[0], { id: 10, result: { outcome: { outcome: "selected", optionId: "opt-once" } } });

  // 2. project -> allow_always when offered
  const sentAlways = [];
  const h2a = AP.maybeHoldPermission({
    req: { id: 110 },
    call: { title: "Run release", kind: "execute" },
    options: OPTIONS,
    command: "npm run release",
    access: "standard",
    autonomy: "guarded",
    root: PROJECT,
    interval: 50,
    send: (msg) => sentAlways.push(msg),
    on: () => {},
  });
  watchers.push(h2a.stop);
  AP.answerApproval(PROJECT, h2a.id, "project");
  await waitFor(() => sentAlways.length === 1);
  assert.deepEqual(sentAlways[0], { id: 110, result: { outcome: { outcome: "selected", optionId: "opt-always" } } });
  assert.ok(AP.projectAllow(PROJECT).includes("npm run release"));

  // 2b. project -> falls back to allow_once when allow_always absent
  const sentProj = [];
  const h2 = AP.maybeHoldPermission({
    req: { id: 11 },
    call: { title: "Run build", kind: "execute" },
    options: [{ kind: "allow_once", optionId: "only-once" }, { kind: "reject_once", optionId: "no" }],
    command: "make release",
    access: "standard",
    autonomy: "guarded",
    root: PROJECT,
    interval: 50,
    send: (msg) => sentProj.push(msg),
    on: () => {},
  });
  watchers.push(h2.stop);
  AP.answerApproval(PROJECT, h2.id, "project");
  await waitFor(() => sentProj.length === 1);
  assert.deepEqual(sentProj[0], { id: 11, result: { outcome: { outcome: "selected", optionId: "only-once" } } });
  assert.ok(AP.projectAllow(PROJECT).includes("make release"));

  // 3. deny -> reject_once + Refused tool line
  const sentDeny = [];
  const eventsDeny = [];
  const h3 = AP.maybeHoldPermission({
    req: { id: 12 },
    call: { title: "Danger cmd", kind: "execute" },
    options: OPTIONS,
    command: "rm -rf /tmp/x",
    access: "standard",
    autonomy: "guarded",
    root: PROJECT,
    interval: 50,
    send: (msg) => sentDeny.push(msg),
    on: (e) => eventsDeny.push(e),
  });
  watchers.push(h3.stop);
  AP.answerApproval(PROJECT, h3.id, "deny");
  await waitFor(() => sentDeny.length === 1);
  assert.deepEqual(sentDeny[0], { id: 12, result: { outcome: { outcome: "selected", optionId: "opt-deny" } } });
  assert.deepEqual(eventsDeny, [{ kind: "tool", line: "Refused (Agent access is standard): Danger cmd" }]);
});

test("autonomous autonomy does not hold, and Acp merges projectAllow into allow", () => {
  saveResilienceConfig({ autonomy: "autonomous" });
  const acp = new Acp({
    agent: { id: "dev", role: "dev", name: "Dev", harness: "gemini", model: "" },
    known: [{ key: "gemini", run: ["gemini"] }],
    cwd: PROJECT,
    access: "standard",
    allow: [],
  });
  const sent = [];
  const events = [];
  acp.send = (m) => sent.push(m);
  acp.on = (e) => events.push(e);

  // Refused command under autonomous -> immediate reject (not held).
  acp.message({
    id: 21,
    method: "session/request_permission",
    params: { options: OPTIONS, toolCall: { title: "Run curl", kind: "execute", rawInput: { command: "curl https://example.com" } } },
  });
  assert.deepEqual(sent[0], { id: 21, result: { outcome: { outcome: "selected", optionId: "opt-deny" } } });
  assert.equal(events.length, 1);

  // Command in .bot-herdr/config.json projectAllow ("npm publish") -> allowed immediately!
  acp.message({
    id: 22,
    method: "session/request_permission",
    params: { options: OPTIONS, toolCall: { title: "Publish", kind: "execute", rawInput: { command: "npm publish" } } },
  });
  assert.deepEqual(sent[1], { id: 22, result: { outcome: { outcome: "selected", optionId: "opt-once" } } });
  assert.equal(events.length, 1);
});
