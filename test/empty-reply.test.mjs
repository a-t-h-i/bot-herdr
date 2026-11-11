import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-empty-reply-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));

test("bh agent: a turn with no reply leaves (finished without a reply) in the chat", () => {
  const file = join(tmp, "claude.mjs");
  writeFileSync(file, `import { readFileSync } from "node:fs";
readFileSync(0, "utf8");
console.log(JSON.stringify({ type: "result", subtype: "success", result: "" }));
`);
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({
    agents: [{ role: "dev", harness: "claude", model: "", effort: "" }],
    known: [{ key: "claude", name: "claude", run: [process.execPath, file], installed: true }],
  }));
  const r = spawnSync(process.execPath, [BH, "agent", "dev", "--", "hello"], {
    cwd: PROJECT, input: "", encoding: "utf8", timeout: 20000,
    env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HC_TERMINAL_ID: "e1", PATH: "" },
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const reply = readFileSync(join(APP, "data", "bot-herdr", "replies", "e1.md"), "utf8");
  assert.match(reply, /^\(finished without a reply\)\n\n<!-- bh /);
});
