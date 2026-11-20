// The skills classifier: `pickSkills` names only a role's own candidates, at most five; `bh task
// new` asks for triage and skills in one classifier request and stores the picks (null when the
// classifier is off); `bh plan new` picks for the panel seats.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-skills-classifier-"));
const APP = join(tmp, "app");
const HOME = join(tmp, "home");
const PROJECT = join(tmp, "project");
mkdirSync(PROJECT, { recursive: true });
mkdirSync(HOME, { recursive: true });
process.env.BH_APP_HOME = APP;
process.env.XDG_CONFIG_HOME = join(tmp, "xdg");
process.env.HOME = HOME;

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const C = await import(new URL("../mods/bot-herdr/engine/classifier/index.mjs", import.meta.url));

const put = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const skill = (name) => put(join(HOME, ".qwen", "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} for work\n---\nBody.\n`);

// A harness that answers the classifier's prompt: every score is level 1, every yes/no is no, and
// every "which skills" question picks its first candidate (or none without candidates).
const FAKE = join(tmp, "qwen.mjs");
const PROMPTS = join(tmp, "prompts.jsonl");
writeFileSync(FAKE, `import { appendFileSync, readFileSync } from "node:fs";
const prompt = readFileSync(0, "utf8");
appendFileSync(${JSON.stringify(PROMPTS)}, JSON.stringify(prompt) + "\\n");
const out = {};
for (const m of prompt.matchAll(/^### ([\\w.-]+) \\((choice|score|noul)\\)$/gm)) {
  const key = m[1];
  const type = m[2];
  if (type === "score") out[key] = { type: "score", score: 1, confidence: 0.9 };
  else if (type === "noul") out[key] = { type: "noul", noul: 0.1 };
  else if (key === "kind") out[key] = { type: "choice", choice: "feature", probabilities: { feature: 0.9 }, confidence: 0.9 };
  else {
    const base = key.startsWith("skills.") ? key.slice("skills.".length) : key;
    const first = base + ".0";
    const has = prompt.includes("- " + first + ": ");
    out[key] = { type: "choice", choice: has ? first : "none", probabilities: has ? { [first]: 0.9 } : { none: 0.9 }, confidence: 0.9 };
  }
}
process.stdout.write(JSON.stringify(out));
`);

const roles = [{
  id: "dev",
  does: "the backend",
  harness: "claude",
  candidates: [{ name: "alpha", description: "A" }, { name: "beta", description: "" }, { name: "gamma", description: "G" }],
}];

test("pickSkills keeps only the role's own candidates", async () => {
  const asked = [];
  const c = {
    enabled: () => true,
    ask: async (feature, req) => {
      asked.push({ feature, req });
      return { answers: { "skills.dev": { type: "choice", choice: "dev.0", probabilities: { "dev.0": 0.9, "dev.1": 0.7, "dev.9": 0.8, "qa.1": 0.9, none: 0.01 }, confidence: 0.9 } } };
    },
  };
  const picks = await C.pickSkills(c, "add an endpoint", roles);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].feature, "skills");
  assert.deepEqual(Object.keys(asked[0].req.questions), ["skills.dev"]);
  assert.deepEqual(Object.keys(asked[0].req.questions["skills.dev"].criteria), ["dev.0", "dev.1", "dev.2", "none"]);
  assert.deepEqual(picks.dev, ["alpha", "beta"]);
});

test("pickSkills caps a role at five names, and none means no extra skills", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ name: `s${i}`, description: "" }));
  const five = {
    enabled: () => true,
    ask: async () => ({ answers: { "skills.dev": { type: "choice", choice: "dev.0", probabilities: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`dev.${i}`, 0.9])), confidence: 0.9 } } }),
  };
  assert.equal((await C.pickSkills(five, "x", [{ id: "dev", candidates: many }])).dev.length, 5);
  const none = { enabled: () => true, ask: async () => ({ answers: { "skills.dev": { type: "choice", choice: "none", probabilities: { none: 0.9 }, confidence: 0.9 } } }) };
  assert.deepEqual(await C.pickSkills(none, "x", roles), { dev: [] });
  assert.equal(await C.pickSkills({ enabled: () => false, ask: async () => ({}) }, "x", roles), null);
});

test("triageAndSkills asks both in one request and reads both", async () => {
  const asked = [];
  const c = {
    enabled: () => true,
    ask: async (feature, req) => {
      asked.push({ feature, req });
      return {
        answers: {
          size: { type: "score", score: 1, confidence: 0.9 },
          kind: { type: "choice", choice: "feature", probabilities: { feature: 0.9 } },
          "skills.dev": { type: "choice", choice: "dev.0", probabilities: { "dev.0": 0.9 }, confidence: 0.9 },
        },
      };
    },
  };
  const r = await C.triageAndSkills(c, "add an endpoint", { roles });
  assert.equal(asked.length, 1);
  assert.ok("size" in asked[0].req.questions);
  assert.ok("skills.dev" in asked[0].req.questions);
  assert.equal(r.triage.size, "small");
  assert.deepEqual(r.skills.dev, ["alpha"]);
});

function setTeam() {
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "agents.json"), JSON.stringify({
    agents: [{ role: "dev", harness: "qwen" }, { role: "qa", harness: "qwen" }, { role: "custom", name: "Advisor", harness: "qwen" }],
    known: [{ key: "qwen", name: "Qwen Code", run: [process.execPath, FAKE], installed: true }],
  }));
}
function setClassifier(enabled) {
  mkdirSync(join(APP, "data", "bot-herdr"), { recursive: true });
  writeFileSync(join(APP, "data", "bot-herdr", "config.json"), JSON.stringify({ classifier: { enabled, harness: "qwen" } }));
}
const run = (...args) => spawnSync(process.execPath, [BH, ...args], {
  cwd: PROJECT, encoding: "utf8", timeout: 60000,
  env: { ...process.env, BH_APP_HOME: APP, XDG_CONFIG_HOME: join(tmp, "xdg"), HOME, HC_TERMINAL_ID: "", BH_AGENT: "", PATH: "" },
});

test("bh task new stores the picks for every agent but the lead, in one call", () => {
  skill("alpha");
  skill("beta");
  setTeam();
  setClassifier(true);
  const r = run("task", "new", "Add a health endpoint", "--json");
  assert.equal(r.status, 0, r.stderr);
  const task = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(task.skills).sort(), ["advisor", "design", "dev", "qa", "research", "scout"]);
  assert.deepEqual(task.skills.dev, { picked: ["alpha"], added: [] });
  assert.deepEqual(task.skills.advisor, { picked: ["alpha"], added: [] });
  assert.match(r.stdout, /"picked": \[/);
});

test("classifier off: every agent's picks are null", () => {
  setTeam();
  setClassifier(false);
  const r = run("task", "new", "Add a health endpoint", "--json");
  assert.equal(r.status, 0, r.stderr);
  const task = JSON.parse(r.stdout);
  assert.ok(Object.values(task.skills).every((e) => e.picked === null && Array.isArray(e.added)));
});

test("bh plan new picks for the panel seats only, and the plan keeps them", () => {
  setTeam();
  setClassifier(true);
  const r = run("plan", "new", "Dark mode", "--json");
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(plan.skills).sort(), ["advisor", "design", "dev", "qa", "research"]);
  assert.deepEqual(plan.skills.dev, { picked: ["alpha"], added: [] });
  const shown = run("plan", "show", plan.id, "--json");
  assert.deepEqual(JSON.parse(shown.stdout).skills, plan.skills);
});

test("bh plan new tells the classifier the seats are read-only planners", () => {
  setTeam();
  setClassifier(true);
  assert.equal(run("plan", "new", "Dark mode", "--json").status, 0);
  const prompts = readFileSync(PROMPTS, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert.match(prompts.at(-1), /read-only planning seat: no write or deploy skills/);
});

test("bh plan task gives the planned task the plan's picks, and null for agents it did not cover", () => {
  setTeam();
  setClassifier(true);
  const made = JSON.parse(run("plan", "new", "Build feature", "--json").stdout);
  const draft = run("plan", "write", made.id, "--data", encodeURIComponent("## Status\nREADY\n\n## Title\nBuild feature\n\n## Plan\n\n### Steps\n1. Build it\n"));
  assert.equal(draft.status, 0, draft.stderr);
  const started = run("plan", "task", made.id, "--json");
  assert.equal(started.status, 0, started.stderr);
  const task = JSON.parse(started.stdout);
  assert.deepEqual(task.skills.dev, made.skills.dev);
  assert.deepEqual(task.skills.dev, { picked: ["alpha"], added: [] });
  assert.deepEqual(task.skills.scout, { picked: null, added: [] }); // the plan has no Scout seat
});
