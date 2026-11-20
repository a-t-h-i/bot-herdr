// The batched effort+scripts classifier call, its fallbacks, strict pick validation, the harness
// multi-pick answer shape, and the compact repository layout the triage reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../mods/bot-herdr/engine/classifier/index.mjs";
import { readAnswers } from "../mods/bot-herdr/engine/classifier/harness.mjs";
import { choice } from "../mods/bot-herdr/engine/classifier/client.mjs";

const SCRIPTS = [
  { name: "repo_map", purpose: "the project layout" },
  { name: "diff_summary", purpose: "what the branch changed" },
  { name: "find_symbol", purpose: "where a name is defined" },
];

/** A classifier whose one answer is `reply`, recording every ask. */
function classifier(reply, seen = []) {
  return {
    enabled: () => true,
    config: { thresholds: C.DEFAULTS.thresholds },
    ask: async (feature, request) => {
      seen.push({ feature, request });
      return reply;
    },
  };
}

test("effort and scripts are asked in one classifier request", async () => {
  const seen = [];
  const c = classifier({ answers: { effort: { type: "score", score: 1, confidence: 0.9 }, fit: { type: "choice", choice: "scripts.2", probabilities: { "scripts.2": 0.9, "scripts.1": 0.7 } } } }, seen);
  const r = await C.scoreEffortAndScripts(c, "show what the branch changed", { context: "Keep the briefs lean", candidates: SCRIPTS });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].feature, "effort");
  assert.deepEqual(Object.keys(seen[0].request.questions), ["effort", "fit"]);
  assert.equal(seen[0].request.state.task, "Keep the briefs lean");
  assert.deepEqual(r.effort, { level: "simple", confidence: 0.9 });
  assert.deepEqual(r.scripts.map((s) => s.name), ["find_symbol", "diff_summary"]);
});

test("none is an empty pick; no answer is null so the caller falls back to keywordPick", async () => {
  const none = await C.scoreEffortAndScripts(classifier({ answers: { fit: { type: "choice", choice: "none", probabilities: { none: 0.9 } } } }), "write a letter", { wantEffort: false, candidates: SCRIPTS });
  assert.deepEqual(none, { effort: null, scripts: [] });
  const silent = await C.scoreEffortAndScripts(classifier(undefined), "write a letter", { wantEffort: false, candidates: SCRIPTS });
  assert.deepEqual(silent, { effort: null, scripts: null });
});

test("with the features off or nothing to pick, nothing is asked", async () => {
  const off = { enabled: () => false, config: { thresholds: {} }, ask: async () => assert.fail("must not ask") };
  assert.deepEqual(await C.scoreEffortAndScripts(off, "anything", { candidates: SCRIPTS }), { effort: null, scripts: null });
  const seen = [];
  assert.deepEqual(await C.scoreEffortAndScripts(classifier({ answers: {} }, seen), "anything", { candidates: [], wantEffort: false }), { effort: null, scripts: null });
  assert.equal(seen.length, 0);
});

test("a wanted answer asked alone asks only its own question", async () => {
  const effortSeen = [];
  const effortOnly = await C.scoreEffortAndScripts(classifier({ answers: { effort: { type: "score", score: 3, confidence: 0.8 } } }, effortSeen), "design it", { wantScripts: false });
  assert.deepEqual(Object.keys(effortSeen[0].request.questions), ["effort"]);
  assert.deepEqual(effortOnly, { effort: { level: "complex", confidence: 0.8 }, scripts: null });

  const scriptsSeen = [];
  const scriptsOnly = await C.scoreEffortAndScripts(classifier({ answers: { fit: { type: "choice", choice: "scripts.0", probabilities: {} } } }, scriptsSeen), "map it", { wantEffort: false, candidates: SCRIPTS });
  assert.equal(scriptsSeen[0].feature, "scripts");
  assert.deepEqual(Object.keys(scriptsSeen[0].request.questions), ["fit"]);
  assert.deepEqual(scriptsOnly.scripts.map((s) => s.name), ["repo_map"]);
});

test("picks are validated against the real candidates", async () => {
  const c = classifier({ answers: { fit: { type: "choice", choice: "scripts.9", probabilities: { "scripts.9": 0.95, "scripts.0": 0.8, none: 0.9 } } } });
  const r = await C.scoreEffortAndScripts(c, "map the project", { wantEffort: false, candidates: SCRIPTS });
  assert.deepEqual(r.scripts.map((s) => s.name), ["repo_map"]);
});

test("multi-picks rank highest probability first, after the best pick, and cap at three", async () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ name: `s${i}`, purpose: "p" }));
  const c = classifier({ answers: { fit: { type: "choice", choice: "scripts.0", probabilities: { "scripts.1": 0.65, "scripts.2": 0.95, "scripts.3": 0.9, "scripts.4": 0.85 } } } });
  const r = await C.scoreEffortAndScripts(c, "map it", { wantEffort: false, candidates: many });
  assert.deepEqual(r.scripts.map((s) => s.name), ["s0", "s2", "s3"]);
});

test("no usable answer is null so keywordPick runs; [] is only for an explicit none", async () => {
  const malformed = await C.pickScripts(classifier({ answers: { fit: { type: "score", score: 1 } } }), "map it", SCRIPTS);
  assert.equal(malformed, null);
  const hallucinated = await C.pickScripts(classifier({ answers: { fit: { type: "choice", choice: "scripts.99", probabilities: { "scripts.99": 0.9 } } } }), "map it", SCRIPTS);
  assert.equal(hallucinated, null);
  const none = await C.pickScripts(classifier({ answers: { fit: { type: "choice", choice: "none", probabilities: { none: 0.9 } } } }), "map it", SCRIPTS);
  assert.deepEqual(none, []);
});

const request = { state: {}, questions: { pick: choice("Which?", { a: "A", b: "B", c: "C", none: "none" }) } };

test("readAnswers keeps every high probability, from probabilities or a choices array", () => {
  const probs = readAnswers('{"pick":{"type":"choice","choice":"a","probabilities":{"a":0.9,"b":0.85,"c":0.2}}}', request);
  assert.equal(probs.answers.pick.choice, "a");
  assert.deepEqual(probs.answers.pick.probabilities, { a: 0.9, b: 0.85, c: 0.2 });

  const multi = readAnswers('{"pick":{"type":"choice","choice":"a","choices":["b","c"],"probabilities":{"a":0.3}}}', request);
  assert.equal(multi.answers.pick.choice, "a");
  assert.deepEqual(multi.answers.pick.probabilities, { a: 0.3, b: 0.8, c: 0.8 });

  const first = readAnswers('{"pick":{"type":"choice","choices":["c","b"],"probabilities":{"a":0.4}}}', request);
  assert.equal(first.answers.pick.choice, "c");
});

test("readAnswers drops invalid keys and clamps probabilities", () => {
  const got = readAnswers('{"pick":{"type":"choice","choice":"zzz","choices":["c","zzz"],"probabilities":{"a":7,"b":"x","zzz":0.9}}}', request);
  assert.equal(got.answers.pick.choice, "c");
  assert.deepEqual(got.answers.pick.probabilities, { a: 1, c: 0.8 });
  assert.equal(readAnswers('{"pick":{"type":"choice","choice":"zzz"}}', request), null);
});

test("repoLayout counts clean project folders, biggest first, capped", () => {
  const root = mkdtempSync(join(tmpdir(), "bh-layout-"));
  const write = (file) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "x\n");
  };
  for (const file of ["src/a.js", "src/b.js", "src/deep/c.js", "mods/app/engine/one.mjs", "mods/app/engine/lib/two.mjs", "test/a.test.mjs", "README.md", "package-lock.json", "dist/bundle.js", ".bot-herdr/task/x.json", "node_modules/m/i.js"]) write(file);
  const layout = C.repoLayout(root);
  assert.equal(layout[0], "mods/app/engine (2)");
  assert.ok(layout.includes("src (2)"), layout.join(" | "));
  assert.ok(layout.includes("src/deep (1)"), layout.join(" | "));
  assert.ok(layout.includes("test (1)"), layout.join(" | "));
  assert.ok(!layout.some((line) => /\.bot-herdr|package-lock|dist|node_modules/.test(line)), layout.join(" | "));
  assert.equal(C.repoLayout(root, 1).length, 1);
});

// ── The commands, end to end: what `bh task new` tells the classifier and what `bh spawn` writes ──

const runDir = mkdtempSync(join(tmpdir(), "bh-scripts-cli-"));
const APP = join(runDir, "app");
const HOME = join(runDir, "home");
const PROJECT = join(runDir, "project");
const PROMPTS = join(runDir, "prompts.jsonl");
const SPAWNS = join(runDir, "hc.jsonl");
mkdirSync(join(PROJECT, "src"), { recursive: true });
mkdirSync(HOME, { recursive: true });
writeFileSync(join(PROJECT, "src", "one.js"), "export const one = 1;\n");
writeFileSync(join(PROJECT, "src", "two.js"), "export const two = 2;\n");
const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const T = await import(new URL("../mods/bot-herdr/engine/lib/tasks.mjs", import.meta.url));

// A harness that answers the classifier: every score is level 1, every yes/no is no, and the
// scripts question picks the candidate named `BH_FAKE_SCRIPT` (else `none`).
const FAKE = join(runDir, "qwen.mjs");
writeFileSync(FAKE, `import { appendFileSync, readFileSync } from "node:fs";
const prompt = readFileSync(0, "utf8");
appendFileSync(${JSON.stringify(PROMPTS)}, JSON.stringify(prompt) + "\\n");
const lines = prompt.split("\\n");
const wanted = process.env.BH_FAKE_SCRIPT ?? "";
const out = {};
for (const m of prompt.matchAll(/^### ([\\w.-]+) \\((choice|score|noul)\\)$/gm)) {
  const key = m[1];
  if (m[2] === "score") out[key] = { type: "score", score: 1, confidence: 0.9 };
  else if (m[2] === "noul") out[key] = { type: "noul", noul: 0.1 };
  else if (key === "kind") out[key] = { type: "choice", choice: "feature", probabilities: { feature: 0.9 }, confidence: 0.9 };
  else {
    const row = wanted ? lines.find((line) => /^- scripts\\.\\d+: /.test(line) && line.includes(wanted + ": ")) : undefined;
    const picked = row ? row.slice(2, row.indexOf(":")) : "none";
    out[key] = { type: "choice", choice: picked, probabilities: { [picked]: 0.9 }, confidence: 0.9 };
  }
}
process.stdout.write(JSON.stringify(out));
`);
const HC = join(runDir, "hc.mjs");
writeFileSync(HC, `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(SPAWNS)}, JSON.stringify(process.argv.slice(2)) + "\\n");\n`);

function setTeam() {
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({
    agents: [{ role: "research", harness: "qwen", model: "", effort: "" }],
    known: [{ key: "qwen", name: "Qwen Code", run: [process.execPath, FAKE], installed: true }],
  }));
}
function setClassifier(enabled) {
  writeFileSync(join(APP, "data", "bot-herdr", "config.json"), JSON.stringify({ classifier: { enabled, harness: "qwen" } }));
}
const bh = (...args) => spawnSync(process.execPath, [BH, ...args], {
  cwd: PROJECT, encoding: "utf8", timeout: 60000,
  env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(runDir, "xdg"), HOME, BH_HC: HC, BH_FAKE_SCRIPT: "find_symbol", HC_TERMINAL_ID: "", BH_AGENT: "" },
});
const lastPrompt = () => JSON.parse(readFileSync(PROMPTS, "utf8").trim().split("\n").at(-1));
const prompts = () => {
  try {
    return readFileSync(PROMPTS, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
};
const spawnText = () => JSON.parse(readFileSync(SPAWNS, "utf8").trim().split("\n").at(-1)).at(-1);

test("bh task new hands the classifier the repository layout", () => {
  setTeam();
  setClassifier(true);
  const r = bh("task", "new", "Add a health endpoint", "--json");
  assert.equal(r.status, 0, r.stderr);
  const prompt = lastPrompt();
  assert.match(prompt, /"repository_layout"/);
  assert.match(prompt, /src \(2\)/);
});

test("bh spawn lists each suggested script's usage, from the classifier and from keywordPick", () => {
  setTeam();
  const task = T.newTask(PROJECT, { request: "Find the symbol", steps: ["Where is the name defined?"] });
  setClassifier(true);
  const asked = prompts().length;
  const on = bh("spawn", "research", "--name", "research-one", "--task", task.id, "Find where the name is defined.");
  assert.equal(on.status, 0, on.stderr);
  const added = prompts().slice(asked);
  assert.equal(added.length, 1, "the classifier was asked once");
  assert.match(added[0], /^- scripts\.\d+: find_symbol: /m);
  const picked = spawnText();
  assert.match(picked, /## Suggested scripts/);
  assert.match(picked, /`bh scripts run find_symbol` — find where a name is defined/);
  assert.match(picked, /usage: `bh scripts run find_symbol <name> \[--defs\]/);

  setClassifier(false);
  const quiet = prompts().length;
  const off = bh("spawn", "research", "--name", "research-two", "--task", task.id, "Find where the name is defined.");
  assert.equal(off.status, 0, off.stderr);
  assert.equal(prompts().length, quiet, "classifier off: nothing was asked");
  const fallback = spawnText();
  assert.match(fallback, /## Suggested scripts/);
  assert.match(fallback, /`bh scripts run find_symbol`/);
  assert.match(fallback, /usage: `bh scripts run find_symbol/);
});
