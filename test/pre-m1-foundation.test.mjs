// pre-M1 foundation: the additive bh dispatchers (ui-audit, home, thread, approvals, review,
// goal progress) and the approvals permission hook. ui-audit is real from M1 on (test/ui-audit
// .test.mjs covers it); the rest are placeholders: they must be listed in help, answer without
// crashing, and leave a refused call to the existing reject path.

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
const runBh = (...args) => spawnSync(process.execPath, [bh, ...args], { cwd: tmp, encoding: "utf8", env: { ...process.env, BH_APP_HOME: join(tmp, "app") }, timeout: 60_000 });

test("bh help lists the redesign foundation commands", () => {
  const r = runBh("help");
  assert.equal(r.status, 0, r.stderr);
  for (const line of [/^\s+bh ui-audit\b/m, /^\s+bh home\b/m, /^\s+bh thread\b/m, /^\s+bh approvals\b/m, /^\s+bh review\b/m, /^\s+bh goal progress\b/m]) {
    assert.match(r.stdout, line);
  }
});

test("the placeholder commands answer without crashing", () => {
  for (const cmd of [["home"], ["thread"], ["approvals"], ["review"], ["goal", "progress", "t-20260101-progress"]]) {
    const r = runBh(...cmd);
    assert.equal(r.status, 0, `${cmd.join(" ")}: ${r.stderr}`);
    assert.match(r.stdout, /not implemented yet/, cmd.join(" "));
  }
});

test("the placeholder commands answer --json with a stable shape", () => {
  const r = runBh("home", "--json");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.command, "home");
  assert.equal(out.implemented, false);
});

test("maybeHoldPermission holds nothing by default", async () => {
  const { maybeHoldPermission } = await import(new URL("../mods/bot-herdr/engine/lib/approvals.mjs", import.meta.url));
  const held = maybeHoldPermission({
    req: { id: 7, method: "session/request_permission" },
    call: { toolCallId: "call-1", kind: "execute", rawInput: { command: "rm -rf build" } },
    options: [{ kind: "reject_once", optionId: "no" }],
    command: "rm -rf build",
    access: "standard",
    send: () => {},
    on: () => {},
  });
  assert.deepEqual(held, { handled: false });
});
