// Step 8 (bh knowledge ask) and step 9 (classifier jev/laya/clef) for t-20261110-p63g.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-kc-"));
const APP = join(tmp, "app");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));

function writeTeam() {
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({
    agents: [{ role: "scout", harness: "fake", model: "", effort: "" }],
    known: [{ key: "fake", name: "Fake", run: [process.execPath, join(tmp, "none.mjs")], installed: true }],
  }));
}

test("classifier config: new kind/model/key/accountId round-trip", () => {
  const enc = (v) => encodeURIComponent(JSON.stringify(v));
  const r = spawnSync(process.execPath, [BH, "config", "--json", "--data", enc({ kind: "laya", model: "laya-x", key: "sek", accountId: "acc1" })], {
    cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", BH_AGENT: "" },
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const cfg = JSON.parse(r.stdout);
  assert.equal(cfg.kind, "laya");
  assert.equal(cfg.model, "laya-x");
  assert.equal(cfg.accountId, "acc1");
  assert.equal(cfg.key, true); // masked
  const again = spawnSync(process.execPath, [BH, "config", "--json"], {
    cwd: PROJECT, encoding: "utf8", env: { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", BH_AGENT: "" },
  });
  const cfg2 = JSON.parse(again.stdout);
  assert.equal(cfg2.kind, "laya");
  assert.equal(cfg2.model, "laya-x");
  assert.equal(cfg2.accountId, "acc1");
  assert.equal(cfg2.key, true);
});

test("classifier: target and adapters per kind (mocked fetch)", async () => {
  const C = await lib("classifier/index.mjs");
  const { systemOne } = await lib("classifier/client.mjs");
  const tj = C.target({ ...C.DEFAULTS, kind: "jev", key: "k", model: "jev-x", baseUrl: "https://jev.example" });
  assert.equal(tj.name, "jev");
  assert.equal(tj.baseUrl, "https://jev.example");
  assert.equal(tj.model, "jev-x");
  const tl = C.target({ ...C.DEFAULTS, kind: "laya", key: "k", model: "laya-x", baseUrl: "https://laya.example" });
  assert.equal(tl.name, "laya");
  assert.equal(tl.baseUrl, "https://laya.example");
  assert.equal(tl.model, "laya-x");
  const tc = C.target({ ...C.DEFAULTS, kind: "clef", key: "k", accountId: "acct", model: "@cf/m", baseUrl: "https://api.cloudflare.com/client/v4" });
  assert.equal(tc.name, "clef");
  assert.equal(tc.accountId, "acct");

  const req = { state: { message: "hi" }, questions: { agent: { type: "choice", instructions: "x", criteria: { orchestrator: "o", design: "d" } } } };
  const calls = [];
  const clefFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: { response: JSON.stringify({ agent: { type: "choice", choice: "design", probabilities: { design: 0.9, orchestrator: 0.1 }, confidence: 0.9 } }) } }), headers: new Headers() };
  };
  const ans = await C.askClef(req, { apiKey: "k", baseUrl: "https://api.cloudflare.com/client/v4", model: "@cf/m", accountId: "acct", fetch: clefFetch });
  assert.equal(ans.answers.agent.choice, "design");
  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/acct/ai/run/%40cf/m");
  assert.equal(calls[0].opts.headers.Authorization, "Bearer k");

  const sCalls = [];
  const sysFetch = async (url, opts) => {
    sCalls.push({ url, opts });
    return { ok: true, status: 200, text: async () => JSON.stringify({ answers: { agent: { type: "choice", choice: "design", probabilities: { design: 0.9, orchestrator: 0.1 }, confidence: 0.9 } } }), headers: new Headers() };
  };
  await systemOne(req, { apiKey: "k", baseUrl: "https://laya.example", model: "laya-x", fetch: sysFetch, timeoutMs: 1000 });
  assert.equal(sCalls[0].url, "https://laya.example/v1/systemone");
  assert.equal(JSON.parse(sCalls[0].opts.body).model, "laya-x");

  const orig = globalThis.fetch;
  try {
    for (const kind of ["jev", "laya", "clef"]) {
      globalThis.fetch = async (url) => {
        if (String(url).includes("cloudflare")) {
          return { ok: true, status: 200, text: async () => JSON.stringify({ result: { response: JSON.stringify({ agent: { type: "choice", choice: "design", probabilities: { design: 0.95, orchestrator: 0.05 }, confidence: 0.95 } }) } }), headers: new Headers() };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify({ answers: { agent: { type: "choice", choice: "design", probabilities: { design: 0.95, orchestrator: 0.05 }, confidence: 0.95 } } }), headers: new Headers() };
      };
      const cfg = { ...C.DEFAULTS, enabled: true, kind, key: "k", model: "m", accountId: "acct", baseUrl: kind === "clef" ? "https://api.cloudflare.com/client/v4" : "https://x.example" };
      const c = C.makeClassifier(cfg);
      const r = await C.route(c, "make the button blue");
      assert.equal(r.route, "design", kind);
      assert.equal(r.by, "classifier", kind);
    }
  } finally {
    globalThis.fetch = orig;
  }
});

test("classifier: failure falls back to rules", async () => {
  const C = await lib("classifier/index.mjs");
  const orig = globalThis.fetch;
  try {
    for (const kind of ["jev", "laya", "clef"]) {
      const c = C.makeClassifier({ ...C.DEFAULTS, kind, key: "k", accountId: "a", model: "m", baseUrl: "https://x.example" });
      globalThis.fetch = async () => { throw new Error("boom"); };
      const r = await C.route(c, "make the button blue");
      assert.equal(r.by, "rules", kind);
    }
  } finally {
    globalThis.fetch = orig;
  }
});

test("bh knowledge ask: starts (or reuses) scout and writes brief/reply via fake hc", () => {
  writeTeam();
  const bin = join(tmp, "bin");
  mkdirSync(bin, { recursive: true });
  const log = join(tmp, "hc.log");
  const hc = join(bin, "hc.mjs");
  const briefDir = join(APP, "data", "bot-herdr", "briefs");
  const replyDir = join(APP, "data", "bot-herdr", "replies");
  mkdirSync(replyDir, { recursive: true });
  // A stand-in for hc: send fails until run has started the scout; run leaves its brief and reply.
  writeFileSync(hc, [
    'import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";',
    'const [log, running, briefDir, replyDir] = ' + JSON.stringify([log, join(tmp, "scout.running"), briefDir, replyDir]) + ';',
    'const args = process.argv.slice(2);',
    'appendFileSync(log, args.join(" ") + "\\n");',
    'if (args[0] === "send") process.exit(existsSync(running) ? 0 : 1);',
    'if (args[0] === "run") {',
    '  writeFileSync(running, "");',
    '  mkdirSync(briefDir, { recursive: true });',
    '  writeFileSync(briefDir + "/knowledge-scout.md", "[bot-herdr brief: you are Scout]\\n");',
    '  writeFileSync(replyDir + "/knowledge-scout.md", "Scout answer\\n\\n<!-- bh now -->\\n");',
    '}',
  ].join("\n"));
  const env = { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", BH_AGENT: "", BH_HC: hc };
  const r1 = spawnSync(process.execPath, [BH, "knowledge", "ask", "--json", "what is here?"], { cwd: PROJECT, encoding: "utf8", env });
  assert.equal(r1.status, 0, r1.stderr + r1.stdout);
  const j1 = JSON.parse(r1.stdout);
  assert.equal(j1.started, true);
  assert.equal(j1.reused, false);
  assert.ok(existsSync(join(replyDir, "knowledge-scout.md")), "reply file written");
  assert.ok(existsSync(join(briefDir, "knowledge-scout.md")), "brief written");
  const r2 = spawnSync(process.execPath, [BH, "knowledge", "ask", "--json", "and more?"], { cwd: PROJECT, encoding: "utf8", env });
  assert.equal(r2.status, 0, r2.stderr + r2.stdout);
  const j2 = JSON.parse(r2.stdout);
  assert.equal(j2.reused, true);
  const logText = readFileSync(log, "utf8");
  assert.match(logText, /run/);
  assert.match(logText, /send knowledge-scout/);
});

test("the classifier's Off switch wins over every kind", async () => {
  const { makeClassifier } = await lib("classifier/index.mjs");
  for (const kind of ["jev", "laya", "clef"]) {
    const off = makeClassifier({ enabled: false, kind, key: "k", harness: "", features: { lobby: true } });
    assert.equal(off.enabled("lobby"), false, kind);
  }
  const on = makeClassifier({ enabled: true, kind: "jev", key: "k", harness: "", features: { lobby: true } });
  assert.equal(on.enabled("lobby"), true);
});
