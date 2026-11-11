// The models a harness really offers (`bh models <harness>`): asked of the harness itself where it
// can answer, and from models.js where it cannot (Claude Code has no listing command). One answer
// is cached per harness and command under bh's data folder (DATA, <app home>/data/bot-herdr) for a
// day, so a Settings page never starts a harness twice.
//
// How each harness answers is from the research report
// .bot-herdr/tasks/t-20261111-b2gp/reports/research-models.md.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { MODELS } from "../../models.js";
import { DATA, ensureDir, readJson, writeJson } from "./core.mjs";
import { launch, stop } from "./runner.mjs";

/** An answer older than this is asked again. */
export const CACHE_MS = 24 * 60 * 60 * 1000;
/** A listing command gets this long; a protocol that has to start a server, longer. */
export const CLI_TIMEOUT = 20_000;
export const RPC_TIMEOUT = 30_000;

const clean = (list) => list.filter((m) => m && m.id);
const model = (id, name, efforts) => {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return { id: key, name: String(name ?? "").trim() || key, ...(Array.isArray(efforts) && efforts.length ? { efforts: efforts.map(String) } : {}) };
};

const json = (text) => {
  try {
    return JSON.parse(String(text ?? "").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
};

const lines = (text) => String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** `provider/model` as the harnesses write a selector. */
const SELECTOR = /^[\w.-]+\/[\w.:@/-]+$/;

/** `omp models --json`: models[] with selector, name and thinking levels. */
export function parseOmp(text) {
  const rows = json(text)?.models;
  if (!Array.isArray(rows)) return [];
  return clean(rows.map((r) => model(r?.selector ?? r?.id, r?.name, r?.thinking)));
}

/** `pi --list-models`: a provider column beside the model, as roster.js's parseModelList reads it. */
export function parsePi(text) {
  const out = [];
  for (const line of lines(text)) {
    const cols = line.split(/\s{2,}|\t/).filter(Boolean);
    if (!cols.length || /^provider$/i.test(cols[0]) || /^-+$/.test(cols[0])) continue;
    const id = cols.length === 1 ? cols[0] : cols[1].includes("/") ? cols[1] : `${cols[0]}/${cols[1]}`;
    if (SELECTOR.test(id) && !out.some((m) => m.id === id)) out.push(model(id, id));
  }
  return out;
}

/** `opencode models`: one `<provider>/<model>` per line. */
export function parseOpencode(text) {
  return clean(lines(text).filter((line) => SELECTOR.test(line)).map((line) => model(line, line)));
}

/** `agy models`: `<id>\t<name>` lines; other output (a "Fetching…" line) is not a model. */
export function parseAgy(text) {
  const out = [];
  for (const line of lines(text)) {
    const [id, ...rest] = line.split("\t");
    const key = id.trim();
    if (!/^[A-Za-z0-9][\w.:@/-]*$/.test(key) || out.some((m) => m.id === key)) continue;
    out.push(model(key, rest.join(" ").trim() || key));
  }
  return out;
}

/** An ACP `session/new` result: a configOptions entry of category "model", else models.availableModels. */
export function parseAcpSession(value) {
  const result = typeof value === "string" ? json(value) : value;
  if (!result || typeof result !== "object") return [];
  const option = Array.isArray(result.configOptions) ? result.configOptions.find((o) => o?.category === "model" || o?.id === "model") : null;
  if (Array.isArray(option?.options) && option.options.length) return clean(option.options.map((o) => model(o?.value, o?.name)));
  const available = result.models?.availableModels;
  return Array.isArray(available) ? clean(available.map((m) => model(m?.modelId ?? m?.id, m?.name))) : [];
}

/** A codex app-server `model/list` result: data[] with id, name and capabilities.reasoningEffort. */
export function parseCodexModelList(value) {
  const result = typeof value === "string" ? json(value) : value;
  if (!Array.isArray(result?.data)) return [];
  return clean(result.data.map((m) => model(m?.id, m?.name, m?.capabilities?.reasoningEffort)));
}

/** What models.js knows for a harness, in the shape the picker reads. */
export function builtin(key) {
  const rows = MODELS[key];
  return Array.isArray(rows) ? rows.map((m) => model(m.id, m.name, m.efforts)) : [];
}

const ACP_INIT = { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "bot-herdr", version: "1.0" } };

/** How each Settings key is asked; `args` is what follows the command. */
export const HARNESSES = {
  claude: { command: "claude", method: "none" },
  codex: { command: "codex", method: "app-server", args: ["app-server"] },
  pi: { command: "pi", method: "cli", args: ["--list-models"], parse: parsePi },
  omp: { command: "omp", method: "cli", args: ["models", "--json"], parse: parseOmp },
  opencode: { command: "opencode", method: "cli", args: ["models"], parse: parseOpencode },
  gemini: { command: "gemini", method: "acp", args: ["--acp"] },
  qwen: { command: "qwen", method: "acp", args: ["--acp"] },
  antigravity: { command: "agy", method: "cli", args: ["models"], parse: parseAgy },
};

const oneLine = (text) => String(text ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 160) ?? "";

/**
 * A command's words. A path that exists is one word even with spaces in it (Settings passes the
 * harness's executable alone); otherwise words split on spaces, and "double quotes" keep one together.
 */
export function commandWords(command) {
  const text = String(command ?? "").trim();
  if (existsSync(text)) return [text];
  return [...text.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

/** The line of an error output that says what went wrong: stack frames and source locations skipped. */
const errLine = (text) => {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const said = lines.filter((l) => !/^at\s|^node:|^\^+$|:\d+$/.test(l));
  return (said.find((l) => /error/i.test(l)) ?? said[0] ?? "").slice(0, 160);
};

/** Runs a command to completion; its output, its exit code, or why it could not be asked. */
function runCli(argv, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try {
      child = launch(argv, { cwd: process.cwd() });
    } catch (e) {
      resolve({ error: oneLine(e.message) });
      return;
    }
    let out = "";
    let err = "";
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      stop(child);
      done({ error: `it did not answer within ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d) => {
      out += d;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (d) => {
      err = (err + d).slice(-2000);
    });
    child.on("error", (e) => done({ error: oneLine(e.message) }));
    child.on("close", (code) => done({ code: code ?? 1, out, err }));
  });
}

/**
 * Sends JSON-RPC requests one after another over a child's stdio and returns their replies by id,
 * killing the child as soon as the last one arrives.
 */
function askRpc(argv, steps, timeoutMs) {
  return new Promise((resolve) => {
    let child;
    try {
      child = launch(argv, { cwd: process.cwd() });
    } catch (e) {
      resolve({ error: oneLine(e.message) });
      return;
    }
    const replies = new Map();
    let at = 0;
    let buf = "";
    let err = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop(child);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ error: `it did not answer within ${Math.round(timeoutMs / 1000)}s` }), timeoutMs);
    const send = () => child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", ...steps[at] })}\n`);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d) => {
      buf += d;
      for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg?.id === undefined) continue;
        replies.set(msg.id, msg);
        if (msg.id !== steps[at].id) continue;
        at += 1;
        if (at >= steps.length) {
          finish({ replies });
          return;
        }
        send();
      }
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (d) => {
      err = (err + d).slice(-2000);
    });
    child.on("error", (e) => finish({ error: oneLine(e.message) }));
    child.on("close", () => finish({ error: oneLine(err) || "it closed the connection before answering" }));
    send();
  });
}

/** ACP over stdio: initialize, then a session, whose result carries the models. */
async function viaAcp(argv) {
  const r = await askRpc(argv, [
    { id: 1, method: "initialize", params: ACP_INIT },
    { id: 2, method: "session/new", params: { cwd: process.cwd(), mcpServers: [] } },
  ], RPC_TIMEOUT);
  if (r.error) return r;
  const reply = r.replies.get(2);
  if (reply?.error) return { error: oneLine(reply.error.message ?? "it refused a new session") };
  const models = parseAcpSession(reply?.result);
  return models.length ? { models } : { error: "it answered without a model list" };
}

/** Codex's app server: one model/list request. */
async function viaAppServer(argv) {
  const r = await askRpc(argv, [{ id: 1, method: "model/list", params: {} }], RPC_TIMEOUT);
  if (r.error) return r;
  const reply = r.replies.get(1);
  if (reply?.error) return { error: oneLine(reply.error.message ?? "it refused the request") };
  const models = parseCodexModelList(reply?.result);
  return models.length ? { models } : { error: "it answered without a model list" };
}

/** Asks the harness itself (`command` is its words: the executable, then any arguments); `{ models }` or `{ error }` in one plain sentence. */
async function ask(harness, command) {
  const spec = HARNESSES[harness];
  const argv = [...command, ...(spec.args ?? [])];
  if (spec.method === "acp") return viaAcp(argv);
  if (spec.method === "app-server") return viaAppServer(argv);
  const r = await runCli(argv, CLI_TIMEOUT);
  if (r.error) return { error: r.error };
  if (r.code !== 0) return { error: errLine(r.err) || `it exited with code ${r.code}` };
  const models = spec.parse(r.out);
  return models.length ? { models } : { error: "it printed no model list" };
}

/** One cache file per harness and command. */
function cacheFile(harness, command) {
  const slug = String(command).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(-60);
  return join(DATA, "models", `${harness}-${slug || "default"}.json`);
}

/**
 * The models a harness offers. `{ harness, source: "harness"|"builtin", method, models, at, cached }`
 * and `error` (one plain sentence) when the harness could not be asked. Throws for an unknown
 * harness: that is the caller's mistake, not a harness failure.
 */
export async function modelsFor(harness, { command = null, refresh = false } = {}) {
  const spec = HARNESSES[harness];
  if (!spec) throw new Error(`No harness ${harness}. bh models knows ${Object.keys(HARNESSES).join(", ")}.`);
  const exe = commandWords(command ?? spec.command);
  const file = cacheFile(harness, exe.join(" "));
  // Claude Code cannot list models: its fallback is the answer, and there is nothing to cache.
  if (spec.method === "none") return { harness, source: "builtin", method: "none", models: builtin(harness), at: Date.now(), cached: false };
  if (!refresh) {
    const saved = readJson(file, null);
    if (saved && Array.isArray(saved.models) && Date.now() - Number(saved.at ?? 0) < CACHE_MS) return { ...saved, cached: true };
  }
  const asked = await ask(harness, exe);
  const answer = {
    harness,
    source: asked.error ? "builtin" : "harness",
    method: spec.method,
    models: asked.error ? builtin(harness) : asked.models,
    at: Date.now(),
    cached: false,
    ...(asked.error ? { error: asked.error } : {}),
  };
  // Only an answer from the harness is worth a day: a failure should be asked again next time.
  if (!asked.error) {
    ensureDir(join(DATA, "models"));
    writeJson(file, answer);
  }
  return answer;
}
