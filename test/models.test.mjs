// `bh models <harness>`: the parsers for each method, and the answer's shape (asked, cached, fallback).

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bh-models-"));
process.env.BH_APP_HOME = join(tmp, "app");
const M = await import("../mods/bot-herdr/engine/lib/models.mjs");

const fixture = (name) => readFileSync(new URL(`./fixtures/models/${name}`, import.meta.url), "utf8");
const ids = (list) => list.map((m) => m.id);

test("omp: models[] with selector, name and thinking as efforts", () => {
  const got = M.parseOmp(fixture("omp.json"));
  assert.equal(got.length, 3);
  assert.deepEqual(got[0], { id: "deepseek/deepseek-flash", name: "DeepSeek-V4.1-Flash", efforts: ["low", "high", "max"] });
  assert.deepEqual(M.parseOmp("not json"), []);
  assert.deepEqual(M.parseOmp('{"models":"nope"}'), []);
});

test("pi: a provider column beside the model", () => {
  assert.deepEqual(ids(M.parsePi(fixture("pi.txt"))), ["anthropic/claude-sonnet-5-5", "anthropic/claude-opus-5-5", "openai/gpt-6.1-sol"]);
  assert.deepEqual(M.parsePi("garbage without selectors"), []);
});

test("opencode: one selector per line, name is the id", () => {
  const got = M.parseOpencode(fixture("opencode.txt"));
  assert.ok(got.length > 20);
  assert.deepEqual(got[0], { id: "deepseek/deepseek-flash", name: "deepseek/deepseek-flash" });
  assert.deepEqual(M.parseOpencode("no selectors here"), []);
});

test("agy: id and name on one tab-separated line; a progress line is not a model", () => {
  const got = M.parseAgy(`Fetching available models...\n${fixture("agy.txt")}`);
  assert.equal(got.length, 6);
  assert.deepEqual(got[0], { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" });
  assert.deepEqual(M.parseAgy("Fetching available models..."), []);
});

test("ACP: configOptions of category model first, else models.availableModels", () => {
  assert.deepEqual(M.parseAcpSession(fixture("acp-config-options.json")), [
    { id: "deepseek/deepseek-v4-pro", name: "deepseek/DeepSeek V4 Pro" },
    { id: "opencode/big-pickle", name: "opencode/Big Pickle" },
  ]);
  assert.deepEqual(M.parseAcpSession(fixture("acp-available-models.json")), [
    { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" },
    { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)" },
  ]);
  assert.deepEqual(M.parseAcpSession({ configOptions: [] }), []);
  assert.deepEqual(M.parseAcpSession("nope"), []);
});

test("codex: model/list data[] with capabilities.reasoningEffort as efforts", () => {
  const got = M.parseCodexModelList(JSON.parse(fixture("codex-model-list.json")).result);
  assert.deepEqual(got, [
    { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", efforts: ["low", "medium", "high", "xhigh"] },
    { id: "gpt-6-astra", name: "GPT-6 Astra", efforts: ["low", "medium", "high"] },
  ]);
  assert.deepEqual(M.parseCodexModelList({ result: { data: "no" } }), []);
  assert.deepEqual(M.parseCodexModelList(undefined), []);
});

test("Claude always answers from models.js, and never starts a process", async () => {
  const got = await M.modelsFor("claude", { command: join(tmp, "does-not-exist") });
  assert.equal(got.source, "builtin");
  assert.equal(got.method, "none");
  assert.equal(got.error, undefined);
  assert.equal(got.models.length, M.builtin("claude").length);
  assert.deepEqual(Object.keys(got.models[0]), ["id", "name", "efforts"]);
});

test("an unknown harness is the caller's mistake", async () => {
  await assert.rejects(() => M.modelsFor("nope"), /No harness nope/);
});

// A stand-in harness: whatever the user's --command names, so no real harness runs in the tests.
function fake(harness, text, { exit = 0, toStderr = false } = {}) {
  const script = join(tmp, `${harness}.mjs`);
  writeFileSync(script, `process.${toStderr ? "stderr" : "stdout"}.write(${JSON.stringify(text)});\nprocess.exit(${exit});\n`);
  const file = join(tmp, process.platform === "win32" ? `${harness}.cmd` : harness);
  writeFileSync(file, process.platform === "win32" ? `@node "${script}"\r\n` : `#!/bin/sh\nexec node "${script}"\n`);
  if (process.platform !== "win32") chmodSync(file, 0o755);
  return file;
}

test("an answer from the harness is cached for a day; --refresh asks again", async () => {
  const command = fake("fake-omp", fixture("omp.json"));
  const first = await M.modelsFor("omp", { command });
  assert.equal(first.source, "harness");
  assert.equal(first.method, "cli");
  assert.equal(first.cached, false);
  assert.equal(first.models.length, 3);
  assert.equal(first.error, undefined);

  const second = await M.modelsFor("omp", { command });
  assert.equal(second.cached, true);
  assert.deepEqual(second.models, first.models);
  assert.equal(second.at, first.at);

  const again = await M.modelsFor("omp", { command, refresh: true });
  assert.equal(again.cached, false);
});

test("a harness that fails falls back to models.js with one sentence, and is not cached", async () => {
  const command = fake("fake-broken", "boom: no models for you\n", { exit: 3, toStderr: true });
  const got = await M.modelsFor("omp", { command });
  assert.equal(got.source, "builtin");
  assert.match(got.error, /no models for you/);
  assert.deepEqual(got.models, [], "models.js has no omp list");
  const again = await M.modelsFor("omp", { command });
  assert.equal(again.cached, false);
});

test("a harness that cannot be started is a sentence, not a crash", async () => {
  const got = await M.modelsFor("opencode", { command: join(tmp, "not-a-command") });
  assert.equal(got.source, "builtin");
  assert.ok(got.error.length > 0);
  assert.ok(got.models.length > 0, "models.js has an opencode list");
});

test("a command of several words runs its executable with the rest as arguments", async () => {
  const script = join(tmp, "list.mjs");
  writeFileSync(script, "console.log(process.argv.slice(2).includes('models') ? 'a/one\\nb/two' : 'wrong arguments');\n");
  const got = await M.modelsFor("opencode", { command: `"${process.execPath}" "${script}"`, refresh: true });
  assert.deepEqual(M.commandWords(process.execPath), [process.execPath]);
  assert.equal(got.source, "harness", got.error);
  assert.deepEqual(ids(got.models), ["a/one", "b/two"]);
});
