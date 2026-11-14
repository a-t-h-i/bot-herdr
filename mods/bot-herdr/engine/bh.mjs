#!/usr/bin/env node
// bh: bot-herdr's tools for the agents (and for the bot-herdr chat). One command line, so every
// harness can use them: tasks and their boards, plans, knowledge, shared scripts, questions for
// the user, replies to the chat, the classifier, and starting team members.
//
//   node <app home>/mods/bot-herdr/engine/bh.mjs help

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { argvOf, effortsOf, roleOf, slug, withPrompt } from "../roster.js";
import { APP_HOME, BH, BOOLEANS, DATA, UsageError, accessOf, bodyText, ensureDir, listDir, myAddress, need, now, parseArgs, projectRoot, readJson, readJsonl, readText, sh, store, withLock, writeJson, writeText } from "./lib/core.mjs";
import * as T from "./lib/tasks.mjs";
import * as P from "./lib/plans.mjs";
import * as K from "./lib/knowledge.mjs";
import * as S from "./lib/scripts.mjs";
import * as Q from "./lib/ask.mjs";
import * as team from "./lib/team.mjs";
import * as W from "./lib/workspace.mjs";
import * as C from "./classifier/index.mjs";
import { fileKind } from "./classifier/qa-risk.mjs";
import { tail, testCommand, testCounts } from "./scripts/lib/common.mjs";
import { fileKey, replyText } from "./lib/agent.mjs";

const HELP = `bh: bot-herdr's tools. Run from the project folder. Add --json for machine-readable output.

Tasks
  bh task new "<request>" [--title T] [--track fast|full] [--plan P] [--branch|--worktree|--no-git]
                                  start a task (prints its triage, and its branch or worktree when Settings isolates tasks)
  bh task list [--all]            bh task show [<id>] [--board]            bh task current
  bh task steps <id> "<step>" "<step>" …   (or --file plan.md: its ## Steps list)
  bh task step <id> <n> start|done|block|skip [--agent A] [--note N]
  bh task status <id> active|paused|done|abandoned     bh task archive <id>   bh task delete <id>  (not while active; its worktree goes, its branch stays)
  bh task comment <id> [--step N] "<text>"  [--edit <cid> "<text>" | --delete <cid>]
  bh task resolve <id> [--comment <cid>]       (the user's comments; all of them without --comment)
  bh board post <task> contract|decision|blocker|question|done|note "<text>" [--from A] [--to B]
  bh board read <task> [--kinds a,b] [--since N]
  bh report <task> [--step N] --file <path> "<summary>"   record a report on the task (the board entry is the record)
  bh gate <task> --verdict PASS|CHANGES_REQUIRED [--round N] --file <report> "<summary>"   record the QA gate's verdict
  bh inbox [--task T] [--peek]    reports addressed to me that I have not seen yet
  bh usage [--task T] [--since ISO date]   tokens, cost and minutes per agent and model

Plans
  bh plan new "<idea>"            bh plan list            bh plan show <id>
  bh plan write <id> --file draft.md [--status grilling|ready]
  bh plan comment <id> [--line N] "<text>"  [--edit <cid> "<text>" | --delete <cid>]
  bh plan resolve <id> [--comment <cid>]
  bh plan task <id>               (a task from the plan's steps)     bh plan archive <id>   bh plan delete <id>
  bh plan seat <id> <seat> --off|--on   (the user leaves a panel seat out, or brings it back)

Knowledge (one file per agent)
  bh knowledge [<agent>]          bh knowledge list       bh knowledge search "<words>"
  bh knowledge ask "<question>"   ask Scout about the project's knowledge and code
  bh knowledge add <agent> "<fact>" [--section Facts|Standards|Decisions|History]
  bh knowledge note <agent> "<entry words>" "<note>"      bh knowledge write <agent> --file F
  bh knowledge inbox [--task T]   the Knowledge Proposals bullets of a task's reports that are not recorded yet

Scripts
  bh scripts                      bh scripts show <name>        bh scripts run <name> [args…]
  bh scripts pick "<step>"        bh scripts save <file> [--name snake_case]
  bh check [--base <ref>]         lint, typecheck and tests for what changed

The user
  bh ask --file questions.md [--title T] [--plan <id>]      (or: bh ask "<question>" --option "A — meaning" --option "B")
  bh reply "<markdown>"  |  bh reply --file reply.md       your reply in the bot-herdr chat

The team
  bh team                         who is set up, with harness, model and effort
  bh spawn <agent> --name <short> [--task T --step N] [--effort auto|<level>] [--panel P] [--review] [--shared] "<brief>"
  bh merge <name> --task <id> [--drop]    bring a child's worktree work into the task's tree (staged, uncommitted); --drop discards it
  bh agent <agent> [--mode lead|child] [--name N] [-- "<first message>"]   run an agent headless in this terminal
  bh classify route|triage|effort|qa-risk "<text>" [--task T]
  bh brief <agent> [--mode lead|child|panel|review]        bh sync   (write the hc templates)

Used by the bot-herdr chat and Settings (--data takes URI-encoded JSON; agents can't change these)
  bh team save --data <roster>    bh config [--data <changes>]    bh questions    bh open <file>
  bh harness add <key> --name "<Name>" --run "<command and arguments>"
  bh access [standard|full] [--allow "npm test, git commit"] [--repo-history on|off]   how agents run, what they may do without asking
  bh mockup <file.html> | --data <html>     bh clip     bh preview <image>…     pictures for the chat
  bh files [<path>] [--all]                 a folder's entries for the composer's file browser
  bh models <harness> [--command <exe>] [--refresh]   the models that harness really offers`;

/**
 * Settings that decide what agents may do are the user's: refused when a headless agent runs
 * bh (the agent terminal marks everything it starts with BH_AGENT), so no agent can widen its
 * own access. An agent run as its CLI asks the user before each command anyway.
 */
function personOnly(what) {
  if (process.env.BH_AGENT) throw new Error(`${what} is the user's to change, in bot-herdr's Settings. Ask them if you need it.`);
}

const out = (flags, value, text) => console.log(flags.json ? JSON.stringify(value, null, 2) : typeof text === "function" ? text(value) : text ?? value);

/** Questions with a misplaced block are not asked: the warnings say what to fix, and nothing is written. */
function refuseAsk(flags, warnings) {
  const file = typeof flags.file === "string" ? flags.file : "the questions";
  process.exitCode = 1;
  return out(flags, { asked: false, warnings }, [`Not asked: fix these in ${file} and run bh ask again:`, ...warnings].join("\n"));
}

/** What `bh ask` says: the question is asked, then how its mockups went (a failure says what the card shows). */
function askedText(q) {
  const n = q.drawn.length + q.failed.length;
  const lines = [`Asked (${q.id}, ${q.questions.length} question${q.questions.length === 1 ? "" : "s"}). The user answers in the bot-herdr chat; the answers come to you as a message. End your turn now.`];
  if (n) lines.push(`${q.drawn.length} of ${n} mockups drawn.`);
  for (const f of q.failed) lines.push(`Couldn't draw question ${f.question}, option "${f.option}": ${f.error.replace(/\.$/, "")}. The card shows "Open in browser" for it.`);
  return lines.join("\n");
}

/**
 * `--edit <cid>` (new words) or `--delete <cid>` on one comment of a task or plan (`M` is its
 * module). Returns the comment and what to say, or null when neither flag is given.
 */
function changeOne(M, owner, flags, words) {
  if (flags.edit !== undefined) return { c: M.editComment(owner, String(flags.edit), words()), said: `Comment ${flags.edit} changed.` };
  if (flags.delete !== undefined) return { c: M.deleteComment(owner, String(flags.delete)), said: `Comment ${flags.delete} deleted.` };
  return null;
}

/** Who a command speaks for: BH_AGENT (a child says its name), else the terminal it runs in. */
const actor = () => process.env.BH_AGENT || myAddress() || null;

/** One inbox line: the task and entry, whose step, who reported, and where the report is. */
const inboxLine = (e) => `${e.task} #${e.n}${e.step ? ` step ${e.step}` : ""} ${e.from ?? "someone"}: ${e.text} — ${e.file}`;

/** Who a step start is by: --agent, else the actor; a done or a block only takes --agent. */
function stepAgent(flags, task, n, to) {
  if (flags.agent) return flags.agent;
  const step = task.steps.find((s) => s.n === Number(n));
  return to === "start" && !step?.agent ? actor() : null;
}

/**
 * Settings → Git isolation (or --branch / --worktree / --no-git for this one task): gives a new
 * task its branch or worktree. Returns why it couldn't, or "".
 */
function isolate(root, task, flags) {
  const mode = flags["no-git"] ? "off" : flags.worktree ? "worktree" : flags.branch ? "branch" : accessOf().git;
  if (mode === "off") return "";
  const made = W.createWorkspace({ cwd: root, root, name: task.title, mode });
  if (typeof made === "string") return `Git isolation (${mode}) not set up: ${made}. The task works in the project folder.`;
  task.git = made;
  return "";
}

function git(root, args) {
  return sh("git", args, { cwd: root });
}

/** A check script's `--json` line, its exit code and the text a person reads. */
function scriptSummary(run) {
  const last = run.out.trim().split("\n").at(-1) ?? "";
  try {
    return { code: run.code, ...JSON.parse(last) };
  } catch {
    return { code: run.code, lint: 0, typecheck: 0, tests: 0, ran: false, untested: [], report: [run.out, run.err].filter(Boolean).join("\n").trim() };
  }
}

/** The project's own test command, run whole: `npm test` is not one binary, so it gets a shell. */
function runSuite(cwd, command) {
  const env = { ...process.env, FORCE_COLOR: "0" };
  delete env.NODE_TEST_CONTEXT; // the project's tests are their own run, not part of a caller's
  const r = spawnSync(command, { cwd, shell: true, encoding: "utf8", timeout: 600000, env });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** The tree a check saw: HEAD's sha, its diff from HEAD, and every untracked file's path and content. */
function changeHash(cwd) {
  const parts = [git(cwd, ["rev-parse", "HEAD"]).out.trim(), git(cwd, ["diff", "HEAD", "--binary"]).out];
  for (const file of git(cwd, ["ls-files", "--others", "--exclude-standard"]).out.split("\n").filter(Boolean)) parts.push(file, readText(join(cwd, file)));
  return createHash("sha1").update(parts.join("\n")).digest("hex");
}

/** What a task changed since it started: files, diff, and untracked paths (their content goes to qa-risk). */
function changes(root, base) {
  const from = base || "HEAD";
  const diff = git(root, ["diff", from]).out;
  const files = new Set(git(root, ["diff", "--name-only", from]).out.split("\n").filter(Boolean));
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]).out.split("\n").filter(Boolean);
  for (const f of untracked) files.add(f);
  return { files: [...files], diff, untracked };
}

/** The check scripts' outcome: lint and typecheck what changed, then either targeted tests or, when a changed file has none, the full suite. */
function runChecks(cwd, base) {
  const extra = [...(base ? ["--base", base] : []), "--json"];
  const lint = scriptSummary(S.run(cwd, "check_changed", extra, { capture: true }));
  const plan = scriptSummary(S.run(cwd, "run_changed_tests", [...extra, "--dry-run"], { capture: true }));
  const uncovered = (plan.untested ?? []).filter((file) => !file.startsWith(".bot-herdr/") && fileKind(file) === "code");
  const command = uncovered.length ? testCommand(cwd) : "";
  // Falling back runs the whole suite: the targeted command must not read as if it ran too.
  const planned = { ...plan, report: (plan.report ?? "").split("\n").filter((line) => !line.startsWith("$ ")).join("\n") };
  const targeted = command ? planned : scriptSummary(S.run(cwd, "run_changed_tests", extra, { capture: true }));
  const full = command ? runSuite(cwd, command) : null;
  const counts = full ? testCounts(full.out) : targeted.counts ?? { total: targeted.tests ?? 0, pass: targeted.tests ?? 0, fail: 0, skipped: 0 };
  const ran = { lint: lint.lint ?? 0, typecheck: lint.typecheck ?? 0, tests: counts.total || (targeted.tests ?? 0) };
  const anything = (lint.checks ?? []).length > 0 || Boolean(full) || Boolean(targeted.ran);
  const codes = [lint.code, full?.code, command ? undefined : targeted.code].filter((code) => code !== undefined);
  return { cwd, lint, targeted, full, command, ran, counts, anything, exit: !anything ? 0 : codes.some((code) => code !== 0) ? 1 : 0 };
}

/** What ran, in one line before the verdict. */
const ranLine = (ran, full) => `Ran: ${ran.lint} lint, ${ran.typecheck} typecheck, ${ran.tests} tests (${full ? "full suite" : "targeted"})`;

/** The verdict in its own words: what ran, how many passed, failed and skipped, and what is set up. */
function verdictLine(exit, ran, counts, lint) {
  const parts = [`${counts.pass} tests pass`];
  if (counts.fail) parts.push(`${counts.fail} failed`);
  if (counts.skipped) parts.push(`${counts.skipped} skipped`);
  const kinds = [ran.lint ? "lint" : "", ran.typecheck ? "typecheck" : ""].filter(Boolean);
  if (kinds.length) parts.push(`${kinds.join(" and ")} ${lint.code === 0 ? (kinds.length > 1 ? "pass" : "passes") : kinds.length > 1 ? "fail" : "fails"}`);
  return `${exit === 0 ? "PASS" : "FAIL"}: ${parts.join(", ")}${kinds.length ? "" : "; no lint or typecheck is set up"}`;
}

/** One `### <title>` section of a markdown document, or "" when it has none. */
function mdSection(md, title) {
  const lines = String(md ?? "").split("\n");
  const start = lines.findIndex((line) => new RegExp(`^#{2,4}\\s+${title}\\s*$`, "i").test(line));
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{2,4}\s/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
}

/** The last `bh check` receipt per step, as the lines a review reads. */
function lastReceipts(list) {
  const byStep = new Map();
  for (const receipt of list) byStep.set(receipt.step ?? "task", receipt);
  return [...byStep].map(([step, r]) => `- step ${step}: ${r.command}: ran ${r.ran?.lint ?? 0} lint, ${r.ran?.typecheck ?? 0} typecheck, ${r.ran?.tests ?? 0} tests${r.fallback ? `, fallback ${r.fallback}` : ""}, exit ${r.exit}, head ${String(r.head ?? "").slice(0, 7)}, diff ${String(r.diff ?? "").slice(0, 12)}`);
}

/** Every turn every agent recorded under DATA/usage. */
function usageFiles() {
  return listDir(join(DATA, "usage")).filter((d) => d.isFile() && d.name.endsWith(".jsonl")).flatMap((d) => readJsonl(join(DATA, "usage", d.name)));
}

/** Usage grouped by agent and model: turns, tokens, cache, cost and minutes. */
function usageByModel(list) {
  const groups = new Map();
  for (const r of list) {
    const key = `${r.agent ?? "unknown"}|${r.model ?? ""}`;
    const g = groups.get(key) ?? { agent: r.agent ?? "unknown", model: r.model ?? null, turns: 0, input: 0, output: 0, cache: 0, costUsd: 0, ms: 0 };
    g.turns += 1;
    g.input += Number(r.input) || 0;
    g.output += Number(r.output) || 0;
    g.cache += (Number(r.cacheRead) || 0) + (Number(r.cacheWrite) || 0);
    g.costUsd += Number(r.costUsd) || 0;
    g.ms += Number(r.ms) || 0;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, costUsd: Number(g.costUsd.toFixed(4)), minutes: Number((g.ms / 60000).toFixed(1)) }));
}

/** One usage line: who, on which model, and what it cost; minutes only when the harness reported no tokens or cost. */
function usageLine(g) {
  const who = `${g.agent}${g.model ? ` (${g.model})` : ""}: ${g.turns} turns`;
  return g.input + g.output + g.cache + g.costUsd === 0 ? `${who}, ${g.minutes} min` : `${who}, ${g.input} input, ${g.output} output, ${g.cache} cache, $${g.costUsd}, ${g.minutes} min`;
}

/** The `## Knowledge Proposals` bullets of a report. */
function proposals(md) {
  return mdSection(md, "Knowledge Proposals").split("\n").filter((line) => /^-\s+/.test(line)).map((line) => line.replace(/^-\s+/, "").trim()).filter(Boolean);
}

/** What a review needs before it reads code: the acceptance criteria, the reports, the receipts and the risk. */
async function reviewContext(root, task, cwd) {
  const { qaRiskBrief, unreadRisk } = await import("./classifier/qa-risk.mjs");
  const criteria = task.plan ? mdSection(readText(join(store(root, "plans", task.plan, "plan.md")), ""), "Acceptance criteria") : "";
  const reports = [
    ...task.steps.filter((s) => s.report).map((s) => `- step ${s.n}: ${s.report.file} — ${s.report.summary}`),
    ...T.board(root, task.id, { kinds: ["done"] }).filter((e) => e.file && !task.steps.some((s) => s.report?.file === e.file)).map((e) => `- board #${e.n}: ${e.file} — ${e.text}`),
  ];
  const hash = changeHash(cwd);
  const risk = task.qa ? qaRiskBrief(task.qa) : `${qaRiskBrief(unreadRisk("this task was not classified with bh classify qa-risk"))}\nThis task was not classified: the engine set a full MEDIUM review.`;
  const previous = (task.gates ?? []).at(-1);
  return [
    "## What the engine checked and found",
    criteria ? `### Acceptance criteria\n${criteria}` : "",
    reports.length ? `### Reports on the task\n${reports.join("\n")}` : "",
    `### Check receipts\nThe tree this review reads hashes to ${hash}. A receipt whose diff hash equals it is proof the check ran on this code: cite it, do not re-run. Re-run anything else you rely on.\n${lastReceipts(T.checks(root, task.id)).join("\n") || "No bh check receipt yet: run bh check yourself."}`,
    risk,
    previous ? `### The previous round\nRound ${previous.round} ended ${previous.verdict}: ${previous.file}. Check each finding there first and say which are addressed.` : "",
  ].filter(Boolean).join("\n\n");
}

async function main(argv) {
  const [cmd = "help", sub, ...more] = argv;
  const root = projectRoot();
  const c = C.makeClassifier();
  const { flags, rest } = parseArgs(argv.slice(1), ["option", "kinds"], [...BOOLEANS, "refresh", "peek", "board", "shared", "drop"]);
  const args = rest.slice(1);

  switch (cmd) {
    case "help":
    case "--help":
    case "-h":
      return console.log(HELP);

    case "task": {
      if (sub === "new") {
        const request = need(bodyText(flags, args), 'bh task new "<request>"');
        const triage = await C.triage(c, request);
        const task = T.newTask(root, { request, title: flags.title, plan: flags.plan ?? null, track: flags.track ?? C.trackFor(triage), by: myAddress() });
        task.triage = triage;
        task.base = git(root, ["rev-parse", "HEAD"]).out.trim() || null;
        const isolation = isolate(root, task, flags);
        T.saveTask(root, task);
        return out(flags, { ...task, isolation }, (t) => [
          `${t.id}: ${t.title}`,
          `Track: ${t.track} (suggested from the triage)`,
          `Triage (${triage.by}): size ${triage.size}, ${triage.kind ?? "kind unknown"}; domains ${Object.entries(triage.domains).map(([d, p]) => `${d} ${p}`).join(", ")}; research ${triage.research}; ambiguous ${triage.ambiguous}`,
          W.gitLine(t.git) || isolation,
        ].filter(Boolean).join("\n"));
      }
      if (sub === "list") return out(flags, T.listTasks(root, { all: Boolean(flags.all) }), (l) => l.map(T.taskLine).join("\n") || "No tasks yet.");
      if (sub === "current") return out(flags, T.currentTask(root), (t) => t?.id ?? "No task.");
      const id = /^t-\d{8}-\w+$/.test(args[0] ?? "") ? args[0] : T.currentTask(root)?.id;
      need(id, `bh task ${sub} <id>`);
      const rest2 = args[0] === id ? args.slice(1) : args;
      if (sub === "show" || sub === undefined) {
        const task = T.loadTask(root, id);
        const where = [W.gitLine(task.git), W.missingWorktree(task)].filter(Boolean).join("\n");
        const entries = T.board(root, id);
        const detail = T.taskDetail(root, task, entries);
        const worked = detail.timeMs;
        return out(flags, { ...detail, worked, board: entries, cwd: W.taskCwd(task, root) }, () => T.taskText(task, entries, { all: Boolean(flags.board), workedMs: worked }).replace(/\n/, `\n${where ? `${where}\n` : ""}`));
      }
      if (sub === "steps") {
        const titles = typeof flags.file === "string" ? T.stepsFromMarkdown(bodyText(flags, [])) : rest2;
        need(titles.length || "", `bh task steps <id> "<step 1>" "<step 2>" …`);
        const task = T.updateTask(root, id, (t) => T.setSteps(t, titles));
        return out(flags, task, (t) => t.steps.map((s) => `${s.n}. ${s.title}`).join("\n"));
      }
      if (sub === "step") {
        const [n, to] = rest2;
        need(to, "bh task step <id> <n> start|done|block|skip");
        const step = T.updateTask(root, id, (t) => T.moveStep(t, n, to, { agent: stepAgent(flags, t, n, to), note: flags.note }));
        return out(flags, step, (s) => `Step ${s.n} is ${s.status}: ${s.title}`);
      }
      if (sub === "status") {
        const status = need(rest2[0], "bh task status <id> <status>");
        const task = T.updateTask(root, id, (t) => T.setStatus(t, status));
        return out(flags, task, (t) => `${t.id} is ${t.status}.`);
      }
      if (sub === "comment") {
        const words = () => rest2.join(" ") || bodyText(flags, []);
        const usage = 'bh task comment <id> [--step N] "<text>"';
        const one = T.updateTask(root, id, (t) => changeOne(T, t, flags, words) ?? { c: T.comment(t, { step: flags.step ?? null, text: need(words(), usage) }) });
        return out(flags, one.c, () => one.said ?? `Comment ${one.c.id} added.`);
      }
      if (sub === "resolve" && flags.comment !== undefined) {
        const x = T.updateTask(root, id, (t) => T.resolveComment(t, String(flags.comment)));
        return out(flags, x, () => `Comment ${x.id} resolved.`);
      }
      if (sub === "resolve") {
        const task = T.updateTask(root, id, (t) => {
          t.comments = (t.comments ?? []).map((x) => ({ ...x, open: false }));
          return t;
        });
        return out(flags, task, () => "Comments marked addressed.");
      }
      if (sub === "archive" || sub === "unarchive") {
        const task = T.updateTask(root, id, (t) => {
          t.archived = sub === "archive";
          return t;
        });
        return out(flags, task, (t) => `${t.id} ${t.archived ? "archived" : "back in the list"}.`);
      }
      if (sub === "delete") {
        const gone = T.deleteTask(root, id);
        return out(flags, gone, (g) => `Deleted ${g.deleted}.${g.branch ? ` Its branch ${g.branch} is kept.` : ""}`);
      }
      throw new UsageError("bh task new|list|show|steps|step|status|comment|resolve|archive|delete");
    }

    case "board": {
      const id = need(args[0], "bh board post|read <task> …");
      if (sub === "post") {
        const [kind, ...words] = args.slice(1);
        const entry = T.post(root, id, { kind, text: need(words.join(" ") || bodyText(flags, []), 'bh board post <task> <kind> "<text>"'), from: flags.from ?? actor(), to: flags.to ?? null });
        return out(flags, entry, (e) => `Posted ${e.kind} #${e.n}.`);
      }
      const kinds = flags.kinds ? String(flags.kinds).split(",") : null;
      return out(flags, T.board(root, id, { kinds, since: Number(flags.since ?? 0) }), (l) => l.map(T.boardLine).join("\n") || "The board is empty.");
    }

    case "gate": {
      const id = need(sub, 'bh gate <task> --verdict PASS|CHANGES_REQUIRED --file <report> "<summary>"');
      const verdict = need(flags.verdict, "bh gate <task> --verdict PASS|CHANGES_REQUIRED");
      const summary = need(args.join(" "), 'bh gate <task> --verdict V --file <report> "<summary>"');
      const file = need(typeof flags.file === "string" ? flags.file : "", "bh gate <task> --file <report>");
      const task = T.loadTask(root, id);
      const head = git(W.taskCwd(task, root), ["rev-parse", "HEAD"]).out.trim() || null;
      const gate = T.recordGate(root, id, { verdict, round: flags.round ? Number(flags.round) : null, file, summary, from: flags.from ?? actor(), head });
      return out(flags, gate, (g) => `Gate round ${g.round}: ${g.verdict} — ${g.summary}`);
    }

    case "report": {
      const id = need(sub, 'bh report <task> [--step <n>] --file <path> "<summary>"');
      const summary = need(args.join(" "), 'bh report <task> [--step <n>] --file <path> "<summary>"');
      const file = need(typeof flags.file === "string" ? flags.file : "", 'bh report <task> --file <path> "<summary>"');
      const step = flags.step === undefined ? null : Number(flags.step);
      const entry = T.report(root, id, { step, file, summary, from: flags.from ?? actor(), to: flags.to ?? (process.env.BH_PARENT || null) });
      return out(flags, entry, (e) => `${e.step ? `Reported step ${e.step}` : "Reported"}: ${e.text}`);
    }

    case "inbox": {
      const key = `${slug(process.env.BH_AGENT || "agent")}${myAddress() ? `-${fileKey(myAddress())}` : ""}`;
      const cursorFile = join(DATA, "inbox", `${key}.json`);
      const seen = readJson(cursorFile, {}) ?? {};
      const me = [myAddress(), process.env.BH_AGENT || null].filter(Boolean);
      const lead = Boolean(process.env.BH_LEAD);
      const tasks = flags.task ? [T.loadTask(root, flags.task)] : T.listTasks(root).filter((t) => t.status === "active" || t.status === "paused");
      const fresh = tasks.flatMap((t) => T.board(root, t.id, { kinds: ["done"] })
        .filter((e) => e.file && e.n > (seen[t.id] ?? 0) && (me.includes(e.to) || (lead && !e.to)))
        .map((e) => ({ task: t.id, ...e })));
      if (fresh.length && !flags.peek) withLock(cursorFile, () => {
        const cursor = readJson(cursorFile, {}) ?? {};
        for (const e of fresh) cursor[e.task] = Math.max(cursor[e.task] ?? 0, e.n);
        writeJson(cursorFile, cursor);
      });
      return out(flags, fresh, (l) => l.map(inboxLine).join("\n") || "No new reports.");
    }

    case "usage": {
      const since = typeof flags.since === "string" ? flags.since : "";
      const list = (flags.task ? T.usageOf(root, flags.task) : usageFiles()).filter((r) => !since || String(r.at) >= since);
      return out(flags, { rows: usageByModel(list) }, (x) => x.rows.map(usageLine).join("\n") || "No usage recorded.");
    }

    case "plan": {
      if (sub === "new") {
        const idea = need(bodyText(flags, args), 'bh plan new "<idea>"');
        return out(flags, P.newPlan(root, { idea, title: flags.title }), (p) => `${p.id}: ${p.title}`);
      }
      if (sub === "list") return out(flags, P.listPlans(root, { all: Boolean(flags.all) }), (l) => l.map(P.planLine).join("\n") || "No plans yet.");
      const id = need(args[0], `bh plan ${sub} <id>`);
      const plan = P.loadPlan(root, id);
      if (sub === "seat") {
        // The user leaves a panel seat out of this plan, or brings it back.
        personOnly("The panel's seats");
        const seat = need(args[1], "bh plan seat <id> <seat> --off|--on").toLowerCase();
        const off = new Set(plan.off ?? []);
        if (flags.on) off.delete(seat);
        else off.add(seat);
        plan.off = [...off];
        P.savePlan(root, plan);
        return out(flags, { off: plan.off }, (x) => `Seats left out: ${x.off.join(", ") || "none"}.`);
      }
      if (sub === "show") {
        const open = P.openComments(plan);
        plan.asked = Q.forPlan(plan.id);
        return out(flags, plan, (p) => `${P.planLine(p)}${p.off?.length ? `\nThe user left these seats off the panel: ${p.off.join(", ")}.` : ""}\n\n${p.markdown || "(no draft yet)"}${open.length ? `\n## Open comments from the user\n${open.map((x) => `- ${x.line ? `line ${x.line} ("${x.quote}")` : "the plan"}: ${x.text}`).join("\n")}` : ""}`);
      }
      if (sub === "write") {
        P.writeDraft(plan, need(bodyText(flags, args.slice(1)), "bh plan write <id> --file draft.md"), { status: flags.status, title: flags.title });
        P.savePlan(root, plan);
        return out(flags, plan, (p) => `${p.id} round ${p.round}: ${p.status}.`);
      }
      if (sub === "comment") {
        const one = changeOne(P, plan, flags, () => args.slice(1).join(" ") || bodyText(flags, []));
        const x = one?.c ?? P.comment(plan, { line: flags.line ?? null, text: need(args.slice(1).join(" ") || bodyText(flags, []), 'bh plan comment <id> "<text>"') });
        P.savePlan(root, plan);
        return out(flags, x, () => one?.said ?? `Comment ${x.id} added.`);
      }
      if (sub === "resolve" && flags.comment !== undefined) {
        const x = P.resolveComment(plan, String(flags.comment));
        P.savePlan(root, plan);
        return out(flags, x, () => `Comment ${x.id} resolved.`);
      }
      if (sub === "resolve") {
        plan.comments = plan.comments.map((x) => ({ ...x, open: false }));
        P.savePlan(root, plan);
        return out(flags, plan, () => "Comments marked addressed.");
      }
      if (sub === "task") {
        const steps = T.stepsFromMarkdown(plan.markdown);
        const task = T.newTask(root, { request: `${plan.idea}\n\nThe agreed plan: bh plan show ${plan.id}`, title: plan.title, plan: plan.id, track: "planned", by: myAddress(), steps });
        task.base = git(root, ["rev-parse", "HEAD"]).out.trim() || null;
        const isolation = isolate(root, task, flags);
        T.saveTask(root, task);
        plan.status = "task";
        plan.task = task.id;
        P.savePlan(root, plan);
        return out(flags, { ...task, isolation }, (t) => [`${t.id}: ${t.title} (${t.steps.length} steps from the plan)`, W.gitLine(t.git) || isolation].filter(Boolean).join("\n"));
      }
      if (sub === "archive" || sub === "unarchive") {
        plan.status = sub === "archive" ? "archived" : "grilling";
        P.savePlan(root, plan);
        return out(flags, plan, () => `${plan.id} ${plan.status}.`);
      }
      if (sub === "delete") {
        const gone = P.deletePlan(root, id);
        return out(flags, gone, (g) => `Discarded ${g.deleted}.`);
      }
      throw new UsageError("bh plan new|list|show|write|comment|resolve|task|archive|delete");
    }

    case "knowledge": {
      if (sub === "ask") {
        const question = need(args.join(" ") || bodyText(flags, []), 'bh knowledge ask "<question>"');
        const { agents, known } = team.team();
        const scout = agents.find((a) => a.role === "scout") ?? team.findMember("scout");
        const files = git(root, ["ls-files"]).out.split("\n").filter(Boolean);
        const repo = files.slice(0, 500).join("\n") + (files.length > 500 ? `\n… (${files.length - 500} more)` : "");
        const knowledge = K.list(root).map((k) => `## ${k.agent}\n${K.withNotes(root, k.agent)}`).filter(Boolean).join("\n\n") || "(no knowledge files yet)";
        const context = `# Knowledge files (.bot-herdr/knowledge)\n\n${knowledge}\n\n# Repository files\n${repo || "(none)"}`;
        const name = team.scoutName(root);
        const message = `${context}\n\n## Question\n${question}`;
        const sent = team.hc(["send", name, question.includes("\n") ? message : `Question: ${question}\n\n${context}`]);
        if (sent.code === 0) return out(flags, { started: false, reused: true, name }, () => `Asked ${name} (reused). Its answer will appear in the chat.`);
        const argv = team.agentArgv(scout, { mode: "lead", name });
        const r = team.hc(["run", "--bg", "--name", name, "--cwd", root, "--", ...argv, "--", message]);
        if (r.code !== 0) throw new Error(`couldn't start Scout: ${(r.err || r.out).trim()}`);
        return out(flags, { started: true, reused: false, name }, () => `Asked ${name}. Its answer will appear in the chat.`);
      }
      if (sub === "list") return out(flags, K.list(root), (l) => l.map((k) => `${k.agent}: ${k.entries} entries, ${k.chars} characters${k.over ? " (over the limit: rewrite it shorter)" : ""}`).join("\n") || "No knowledge yet.");
      if (sub === "search") return out(flags, K.search(root, args.join(" ")), (l) => l.join("\n") || "Nothing found.");
      if (sub === "inbox") {
        const task = flags.task ? T.loadTask(root, flags.task) : T.currentTask(root);
        if (!task) return out(flags, [], "No task to read reports from.");
        const files = [...new Set([
          ...task.steps.filter((s) => s.report?.file).map((s) => s.report.file),
          ...T.board(root, task.id, { kinds: ["done"] }).filter((e) => e.file).map((e) => e.file),
          ...(task.gates ?? []).map((g) => g.file).filter(Boolean),
        ])];
        const known = new Set(K.list(root).flatMap((k) => K.read(root, k.agent).split("\n").filter((l) => /^-\s/.test(l)).map((l) => l.replace(/^-\s+/, "").trim())));
        const items = files.flatMap((file) => proposals(readText(join(root, file))).filter((text) => !known.has(text)).map((text) => ({ text, file })));
        return out(flags, items, (l) => l.map((x) => `- ${x.text} — ${x.file}`).join("\n") || "No new proposals.");
      }
      if (sub === "add") {
        const agent = need(args[0], 'bh knowledge add <agent> "<fact>"');
        const fact = need(args.slice(1).join(" ") || bodyText(flags, []), 'bh knowledge add <agent> "<fact>"');
        const r = K.add(root, agent, fact, flags.section ?? "Facts");
        return out(flags, r, () => (r.added ? `Recorded for ${agent}.` : "Already there.") + (r.chars > K.LIMIT ? ` The file is over ${K.LIMIT} characters: rewrite it shorter with bh knowledge write.` : ""));
      }
      if (sub === "note") {
        const [agent, entry, ...words] = args;
        return out(flags, K.note(root, need(agent, "bh knowledge note <agent> <entry> <note>"), need(entry, "entry"), need(words.join(" ") || bodyText(flags, []), "note")), () => "Note kept.");
      }
      if (sub === "unnote") {
        const gone = K.unnote(root, need(args[0], "bh knowledge unnote <agent> --at <time>"), need(flags.at, "--at"));
        return out(flags, { ok: gone }, () => (gone ? "Note taken back." : "No such note."));
      }
      if (sub === "write") {
        K.write(root, need(args[0], "bh knowledge write <agent> --file F"), need(bodyText(flags, args.slice(1)), "--file"));
        return out(flags, { ok: true }, "Saved; the version before is under archive/.");
      }
      const agent = sub;
      if (!agent) return out(flags, K.list(root), (l) => l.map((k) => `${k.agent} (${k.entries} entries)`).join("\n") || "No knowledge yet.");
      return out(flags, { agent, text: K.read(root, agent), notes: K.notes(root, agent) }, () => K.withNotes(root, agent) || `Nothing recorded for ${agent} yet.`);
    }

    case "scripts":
    case "script": {
      if (!sub || sub === "list") return out(flags, S.scripts(root), (l) => l.map(S.scriptLine).join("\n").replaceAll("node {script}", "bh scripts run"));
      if (sub === "show") return out(flags, S.find(root, need(args[0], "bh scripts show <name>")), (s) => `${s.file}\n\n${readText(s.file)}`);
      if (sub === "run") process.exit(S.run(root, need(args[0], "bh scripts run <name> [args…]"), argv.slice(3)));
      if (sub === "save") return out(flags, { file: S.save(root, need(args[0], "bh scripts save <file>"), flags.name ?? null) }, (r) => `Saved ${r.file}.`);
      if (sub === "pick") {
        const step = need(args.join(" "), 'bh scripts pick "<step>"');
        const all = S.scripts(root);
        const picked = (await C.pickScripts(c, step, all)) ?? S.keywordPick(all, step);
        return out(flags, picked, (l) => l.map(S.scriptLine).join("\n").replaceAll("node {script}", "bh scripts run") || "No script fits; do it by hand.");
      }
      throw new UsageError("bh scripts [list|show|run|save|pick]");
    }

    case "check": {
      const task = flags.task ? T.loadTask(root, flags.task) : T.currentTask(root);
      const child = task ? W.childWorktree(task, process.cwd()) : null;
      const cwd = child ? child.path : W.taskCwd(task, root);
      const base = flags.base ?? child?.base ?? task?.base ?? null;
      const { lint, targeted, full, command, ran, counts, anything, exit } = runChecks(cwd, base);
      const receipt = { at: now(), from: flags.from ?? actor(), step: process.env.BH_STEP ? Number(process.env.BH_STEP) : null, command: "bh check", base, head: git(cwd, ["rev-parse", "HEAD"]).out.trim() || null, diff: changeHash(cwd), ran, counts, fallback: command || null, exit };
      if (task) T.recordCheck(root, task.id, receipt);
      if (flags.json) {
        console.log(JSON.stringify(receipt, null, 2));
        process.exit(exit);
      }
      console.log("## Lint and typecheck (check_changed)");
      console.log(lint.report ?? "");
      console.log("\n## Tests for what changed (run_changed_tests)");
      console.log(targeted.report ?? "");
      if (full) console.log(`\nNo targeted test covered the change: ran the full suite (${command})\n${tail(full.out, 40)}`);
      if (!anything) {
        console.log("\nNO CHECKS: nothing could verify these files");
        process.exit(0);
      }
      console.log(`\n${ranLine(ran, full)}`);
      console.log(verdictLine(exit, ran, counts, lint));
      process.exit(exit);
    }

    case "ask": {
      let parsed;
      if (typeof flags.file === "string" || (!argv.slice(1).length && !process.stdin.isTTY)) parsed = Q.parseQuestions(bodyText(flags, []));
      else {
        const text = need(rest.join(" "), 'bh ask --file questions.md   or   bh ask "<question>" --option "A — meaning" --option "B"');
        const opts = (flags.option ?? []).map((o) => {
          const [label, ...meaning] = String(o).split(/\s+[—–-]{1,2}\s+/);
          return { label: label.replace(/\s*\(Recommended\)\s*/i, ""), meaning: meaning.join(" — "), recommended: /\(Recommended\)/i.test(label), mockup: null };
        });
        parsed = { intro: "", questions: [{ seat: null, text, options: opts, multi: Boolean(flags.multi) }], warnings: [] };
      }
      if (parsed.warnings.length) return refuseAsk(flags, parsed.warnings);
      const from = flags.as ?? myAddress();
      if (!from) throw new Error("bh ask needs to know who is asking: run it in a herdr terminal (HC_TERMINAL_ID), or pass --as <address>.");
      const q = Q.ask({ title: flags.title ?? null, intro: parsed.intro, questions: parsed.questions, from, fromName: flags.from ?? null, cwd: root, plan: typeof flags.plan === "string" ? flags.plan : null });
      const { drawn, failed } = Q.drawMockups(q);
      return out(flags, { ...q, drawn, failed }, askedText);
    }

    case "answer": {
      // Used by the chat: `bh answer <id> --file answers.json`. Saves the answers and sends them to the asker.
      const id = need(sub, "bh answer <id> --file answers.json");
      const answers = JSON.parse(bodyText(flags, []));
      const q = Q.answer(id, answers);
      const text = Q.answersText(q);
      const r = team.hc(["send", q.from, text]);
      return out(flags, { ok: r.code === 0, error: r.code === 0 ? null : (r.err || r.out).trim() }, (x) => (x.ok ? "Sent." : `Saved, but couldn't send: ${x.error}`));
    }

    case "answers":
      return out(flags, Q.loadQuestion(need(sub, "bh answers <id>")), (q) => (q.status === "answered" ? Q.answersText(q) : "Not answered yet."));

    case "reply": {
      const text = need(bodyText(flags, rest), 'bh reply "<markdown>"  or  bh reply --file reply.md');
      const who = flags.as ?? myAddress();
      if (!who) throw new Error("bh reply needs HC_TERMINAL_ID (run it in a herdr terminal) or --as <address>.");
      const file = join(DATA, "replies", `${String(who).replace(/[\\/]/g, "_")}.md`);
      writeText(file, replyText(text));
      return out(flags, { file }, "Saved: the chat shows it as your reply.");
    }

    case "team": {
      if (sub === "save") {
        personOnly("The team");
        const saved = JSON.parse(need(bodyText(flags, []), "bh team save --data <roster>"));
        writeJson(join(DATA, "agents.json"), { agents: saved.agents ?? [], known: saved.known ?? [] });
        const written = team.sync(root);
        return out(flags, { ok: true, templates: written.map((t) => t.name) }, (x) => `Saved. Templates: ${x.templates.join(", ") || "none"}.`);
      }
      const { agents, known } = team.team();
      return out(flags, { agents, known }, () => agents.map((a) => `${a.name}${a.lead ? " (leads)" : ""}: ${argvOf(a, known).join(" ")}`).join("\n"));
    }

    case "sync": {
      const written = team.sync(root);
      return out(flags, written, (l) => `Templates in ${team.templatesDir()}: ${l.map((t) => t.name).join(", ") || "none"}`);
    }

    case "brief": {
      const a = team.findMember(need(sub, "bh brief <agent>"));
      return console.log(team.brief(a, { mode: flags.mode ?? (a.lead ? "lead" : "child"), parent: flags.parent ?? null, task: flags.task ?? null, plan: flags.panel ?? flags.plan ?? null, step: flags.step ?? null, root, name: flags.name ?? null }));
    }

    case "spawn": {
      const a = team.findMember(need(sub, 'bh spawn <agent> --name <short> "<brief>"'));
      const { known } = team.team();
      const name = slug(flags.name ?? `${slug(a.name)}-${Math.random().toString(36).slice(2, 5)}`);
      const task = flags.task ?? null;
      const text = need(bodyText(flags, args), 'bh spawn <agent> --name <short> "<brief>"');
      const mode = flags.panel ? "panel" : flags.review ? "review" : "child";
      let effort = a.effort;
      let routed = null;
      if (flags.effort === "auto") {
        const scored = await C.scoreEffort(c, text, task ? T.loadTask(root, task).request : "");
        effort = C.routeEffort(scored, a.effort, effortsOf(a.harness, a.model), c.config.thresholds);
        if (effort !== a.effort) routed = `${scored.level} (${scored.confidence.toFixed(2)}): effort ${a.effort || "default"} → ${effort}`;
      } else if (typeof flags.effort === "string") effort = flags.effort;
      const agent = { ...a, ...(flags.model ? { model: flags.model } : {}) };
      const parent = myAddress();
      const current = task ? T.loadTask(root, task) : null;
      const editing = mode === "child" && Boolean(roleOf(a.role)?.edits) && !flags.shared;
      const open = editing ? (current?.children ?? []).find((c) => c.state === "open" && c.agent === a.name) : null;
      if (open) throw new Error(`${a.name} already has an open worktree ${open.name}: merge or drop it first`);
      const made = editing ? W.createChildWorktree({ task: current, name, cwd: W.taskCwd(current, root), root }) : "";
      const worktree = made && typeof made === "object" ? made : null;
      if (worktree) T.updateTask(root, task, (t) => {
        t.children = [...(t.children ?? []), { name, agent: a.name, step: flags.step ? Number(flags.step) : null, branch: worktree.branch, path: worktree.path, base: worktree.base, state: "open", at: now() }];
      });
      // A task with a worktree: its agents run there; one of them, in its own.
      const cwd = worktree ? worktree.path : flags.cwd ?? (current ? W.taskCwd(current, root) : root);
      const isolation = worktree ? `${name} works in its own worktree ${worktree.path} (branch ${worktree.branch}); merge it with bh merge ${name} --task ${task}` : typeof made === "string" ? made : "";
      const review = mode === "review" && current ? await reviewContext(root, current, cwd) : "";
      const report = task ? `.bot-herdr/tasks/${task}/reports/${name}.md` : `.bot-herdr/reports/${name}.md`;
      const plan = flags.panel ?? flags.plan ?? null;
      const about = [
        `You are ${name}.`,
        task ? `Your task is ${task} (bh task show ${task}); post on its board with --from ${name}.` : "",
        flags.panel ? `The plan is ${flags.panel} (bh plan show ${flags.panel}).` : "",
        `When done or stuck, write your report to ${report}${task ? `, record it with bh report ${task}${flags.step ? ` --step ${flags.step}` : ""}${parent ? ` --to ${parent}` : ""} --file ${report} "<one-line summary>"` : ""}, and send its path with a one-line summary: hc send ${parent ?? "<the agent that started you>"} "<summary> — ${report}".`,
      ].filter(Boolean).join(" ");
      const first = [text, `(${about})`, review].filter(Boolean).join("\n\n");
      let r;
      if (team.runsHeadless(agent)) {
        // The agent terminal: it runs the harness headless, writes its own brief, and reports
        // its status, so hc wait sees each turn end.
        const argv = team.agentArgv(agent, { mode, name, parent, task, step: flags.step ?? null, plan, effort, model: flags.model ?? null });
        r = team.hc(["run", "--bg", "--name", name, "--cwd", cwd, "--", ...argv, "--", first]);
      } else {
        // The template carries the generic brief (role, team, knowledge); this run's specifics go
        // with the task, so one template per agent and mode serves every spawn.
        const body = team.brief(agent, { mode, root, parent, task, plan, step: flags.step ?? null, name, worktree });
        const variant = [slug(a.name), mode !== "child" ? mode : "", flags.model ? slug(flags.model) : "", effort !== a.effort ? effort : ""].filter(Boolean).join("-");
        // hc runs a template's `command:` through `sh -c`, which Windows doesn't have: there the
        // command goes to hc run as argv instead.
        const template = process.platform === "win32" ? null : team.writeTemplate(agent, known, { name: mode === "child" && variant === slug(a.name) ? variant : `bh-${variant}`, body, effort });
        r = template
          ? team.hc(["run", "--bg", "--name", name, "--cwd", cwd, template.name, first])
          : team.hc(["run", "--bg", "--name", name, "--cwd", cwd, "--", ...withPrompt(argvOf(agent, known, { effort }), first), `${body}\n\n${first}`]);
      }
      if (task && flags.step) T.updateTask(root, task, (t) => T.moveStep(t, flags.step, "start", { agent: name }));
      if (r.code !== 0) throw new Error(`hc run failed: ${(r.err || r.out).trim()}`);
      return out(flags, { name, agent: a.name, effort, routed, isolation, hc: r.out.trim() }, (x) => `Started ${x.name} (${x.agent}${x.effort ? `, effort ${x.effort}` : ""}${x.routed ? `; routed: ${x.routed}` : ""}). Wait with hc wait --children any.${x.isolation ? `\n${x.isolation}` : ""}`);
    }

    case "merge": {
      const name = need(sub, "bh merge <name> --task <id> [--drop]");
      const id = need(flags.task, "bh merge <name> --task <id> [--drop]");
      const task = T.loadTask(root, id);
      const child = (task.children ?? []).find((c) => c.name === name);
      if (!child) throw new Error(`Task ${id} has no child ${name}.`);
      const cwd = W.taskCwd(task, root);
      if (flags.drop) {
        const gone = W.removeChildWorktree({ child, cwd });
        T.updateTask(root, id, (t) => {
          const c = (t.children ?? []).find((x) => x.name === name);
          if (c) Object.assign(c, { state: "dropped", droppedAt: now() });
        });
        return out(flags, { ...child, state: "dropped", error: gone || null }, (x) => (gone ? `${x.error}: ${name} is dropped.` : `Dropped ${name}: its worktree and branch are gone.`));
      }
      const merged = W.mergeChild({ child, cwd });
      if (merged.refused) throw new Error(`Not merged: ${merged.refused}. The task's tree is unchanged.`);
      if (merged.message) return out(flags, { ...child, message: merged.message }, () => merged.message);
      T.updateTask(root, id, (t) => {
        const c = (t.children ?? []).find((x) => x.name === name);
        if (c) Object.assign(c, { state: "merged", mergedAt: now(), stat: merged.stat });
      });
      T.post(root, id, { kind: "done", text: `Merged ${name}: ${merged.stat.files} files, +${merged.stat.added} −${merged.stat.removed}`, from: flags.from ?? actor(), step: child.step ?? null });
      const gone = W.removeChildWorktree({ child, cwd });
      return out(flags, { ...child, state: "merged", stat: merged.stat, error: gone || null }, (x) => `Merged ${name}: ${merged.stat.files} files, +${merged.stat.added} −${merged.stat.removed}. ${gone ? gone : "Its worktree and branch are gone; the changes are staged in the task's tree."}`);
    }

    case "classify": {
      const text = args.join(" ") || bodyText(flags, []);
      if (sub === "route") return out(flags, await C.route(c, text), (r) => `${r.route}${r.probability !== null ? ` (${r.probability.toFixed(2)})` : ""} by ${r.by}`);
      if (sub === "triage") {
        const t = await C.triage(c, need(text, 'bh classify triage "<request>"'));
        return out(flags, { ...t, track: C.trackFor(t) }, (x) => JSON.stringify(x));
      }
      if (sub === "effort") {
        const s = await C.scoreEffort(c, need(text, 'bh classify effort "<step>"'));
        return out(flags, s, (x) => (x ? `${x.level} (${x.confidence.toFixed(2)})` : "The classifier is off: the configured effort applies."));
      }
      if (sub === "qa-risk") {
        const task = flags.task ? T.loadTask(root, flags.task) : null;
        const child = task ? W.childWorktree(task, process.cwd()) : null;
        const cwd = child ? child.path : task ? W.taskCwd(task, root) : root;
        const { files, diff, untracked } = changes(cwd, flags.base ?? child?.base ?? task?.base);
        const risk = await C.qaRisk(c, { files, diff, untracked, root: cwd, request: task?.request, bugfix: task?.triage?.kind === "bugfix" });
        if (task) T.updateTask(root, flags.task, (t) => {
          t.qa = risk;
        });
        const { qaRiskBrief } = await import("./classifier/qa-risk.mjs");
        return out(flags, risk, () => qaRiskBrief(risk));
      }
      if (sub === "status") return out(flags, { enabled: c.config.enabled, host: c.target.name, model: c.target.model, key: Boolean(c.target.key) }, (x) => `Classifier ${x.enabled ? "on" : "off"}; ${x.host} ${x.model}; key ${x.key ? "found" : "missing"}.`);
      throw new UsageError("bh classify route|triage|effort|qa-risk|status");
    }

    case "config": {
      // Settings → Classifier. The key never comes back out: only whether one is set.
      const file = join(DATA, "config.json");
      const saved = readJson(file, {}) ?? {};
      if (typeof flags.data === "string" || typeof flags.file === "string") {
        personOnly("The classifier");
        const patch = JSON.parse(bodyText(flags, []));
        const was = saved.classifier ?? {};
        const next = { ...was, ...patch, features: { ...(was.features ?? {}), ...(patch.features ?? {}) }, thresholds: { ...(was.thresholds ?? {}), ...(patch.thresholds ?? {}) } };
        if (patch.key === undefined) next.key = was.key ?? "";
        writeJson(file, { ...saved, classifier: next });
      }
      const config = C.classifierConfig();
      const t = C.target(config);
      const shown = { ...config, key: Boolean(config.key), keyFound: Boolean(t.key), openrouterKey: Boolean(String(config.key || process.env[C.HOSTS.openrouter.env] || "").trim()), using: t.name, harnessReady: Boolean(C.onHarness(config)), harnesses: Object.keys(C.CLASSIFIER_HARNESSES), hosts: Object.fromEntries(Object.entries(C.HOSTS).map(([k, h]) => [k, { label: h.label, env: h.env, model: h.model }])) };
      return out(flags, shown, (x) => `Classifier ${x.enabled ? "on" : "off"}; kind ${x.kind || "(host)"} (using ${x.using}); key ${x.keyFound ? "found" : "missing"}.`);
    }

    case "questions":
      return out(flags, Q.openQuestions(), (l) => l.map((q) => `${q.id}: ${q.title ?? q.questions[0]?.text ?? ""}`).join("\n") || "No open questions.");

    case "harness": {
      // Adds a harness herdr doesn't know to <app home>/programs.json, so it is listed everywhere.
      if (sub !== "add") throw new UsageError('bh harness add <key> --name "<Name>" --run "<command and arguments>"');
      personOnly("The harness table");
      const key = slug(need(args[0], "bh harness add <key> …"));
      const run = String(need(flags.run, '--run "<command>"')).trim().split(/\s+/).filter(Boolean);
      const file = join(APP_HOME, "programs.json");
      const table = readJson(file, {}) ?? {};
      table.programs ??= {};
      table.programs[key] = { tile: "#1c1d21", color: "#ffffff", ...(table.programs[key] ?? {}), name: String(flags.name ?? key), run };
      writeJson(file, table);
      return out(flags, { key, ...table.programs[key] }, (x) => `Added ${x.name} (${x.run.join(" ")}). herdr lists it within a minute.`);
    }

    case "open": {
      // Opens a file (a question's mockup) in the user's default app, without waiting for it.
      const file = need(sub, "bh open <file>");
      const [cmd, args2] = process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : process.platform === "darwin" ? ["open", [file]] : ["xdg-open", [file]];
      spawn(cmd, args2, { detached: true, stdio: "ignore", windowsHide: true }).unref();
      return out(flags, { ok: true }, "Opened.");
    }

    case "files": {
      // The composer's file browser: one folder's entries. A failure is a sentence, not a stack.
      const F = await import("./lib/files.mjs");
      let listed;
      try {
        listed = F.listFolder(sub ?? "", { all: Boolean(flags.all) });
      } catch (e) {
        console.log(JSON.stringify({ error: e.message }));
        process.exit(1);
      }
      return out(flags, listed, (r) => r.entries.map((e) => `${e.dir ? "d" : "-"} ${e.name}`).join("\n") || "(empty folder)");
    }

    case "models": {
      // Settings' model picker: what the harness itself says it offers (models.js when it can't say).
      const M = await import("./lib/models.mjs");
      if (!sub || !M.HARNESSES[sub]) {
        console.error(`bh models: no harness ${sub ?? ""}. Known: ${Object.keys(M.HARNESSES).join(", ")}.`);
        process.exit(1);
      }
      const shown = await M.modelsFor(sub, { command: typeof flags.command === "string" ? flags.command : null, refresh: Boolean(flags.refresh) });
      return out(flags, shown, (r) => [`${r.harness}: ${r.models.length} models, ${r.source} (${r.method})${r.cached ? ", cached" : ""}${r.error ? ` — ${r.error}` : ""}`, ...r.models.map((m) => `${m.id}${m.name && m.name !== m.id ? `  ${m.name}` : ""}${m.efforts?.length ? `  [${m.efforts.join(", ")}]` : ""}`)].join("\n"));
    }

    case "path":
      return console.log(BH);

    case "mockup": {
      // The chat's pictures: a mockup drawn by a headless browser (`bh mockup <file.html>`, or
      // its HTML with --data), shown as an image.
      const M = await import("./lib/media.mjs");
      const r = typeof flags.data === "string" ? M.drawHtml(bodyText(flags, [])) : M.drawMockup(need(sub, "bh mockup <file.html>  or  bh mockup --data <html>"), { force: Boolean(flags.force) });
      if (r.error && !flags.json) throw new Error(r.error);
      return out(flags, r, (x) => x.png);
    }

    case "clip": {
      // A paste that held no text: the clipboard's image (saved as a PNG) or copied files.
      const M = await import("./lib/media.mjs");
      const { files } = M.clipboard();
      return out(flags, files.map((file) => ({ file, ...M.preview(file) })), (l) => l.map((x) => x.file).join("\n") || "The clipboard holds no image or files.");
    }

    case "preview": {
      // Image files as herdr can show them (it reads images from its own folder only).
      const M = await import("./lib/media.mjs");
      const files = [sub, ...args].filter(Boolean);
      need(files.length || "", "bh preview <image file>…");
      return out(flags, files.map((file) => ({ file, ...M.preview(file) })), (l) => l.map((x) => x.image ?? `${x.file}: ${x.error}`).join("\n"));
    }

    case "agent": {
      const { runAgent } = await import("./lib/agent.mjs");
      const word = need(sub, 'bh agent <agent> [--mode lead|child|panel|review] [--name N] [--parent T] [--task T] [--step N] [--plan P] [--model M] [--effort E] [-- "<first message>"]');
      return runAgent({ word, mode: flags.mode ?? "lead", name: flags.name ?? null, parent: flags.parent ?? null, task: flags.task ?? null, step: flags.step ?? null, plan: flags.plan ?? null, model: flags.model ?? null, effort: flags.effort ?? null, first: args.join(" ") });
    }

    case "access": {
      // Settings → How agents run: headless or as their CLI, and what they may do without
      // asking. Standard unless the user picks full.
      const file = join(DATA, "config.json");
      const saved = readJson(file, {}) ?? {};
      const next = accessOf();
      const level = rest[0];
      if (level && level !== "standard" && level !== "full") throw new UsageError('bh access [standard|full] [--allow "npm test, git commit"] [--git off|branch|worktree] [--repo-history on|off]   or   bh access --data <changes>');
      const patch = typeof flags.data === "string" ? JSON.parse(bodyText(flags, [])) : {};
      if (level) patch.access = level;
      if (typeof flags.allow === "string") patch.allow = flags.allow;
      if (typeof flags.git === "string") patch.git = flags.git;
      if (flags["repo-history"] !== undefined) {
        if (flags["repo-history"] !== "on" && flags["repo-history"] !== "off") throw new UsageError("Repo history is on or off.");
        patch.repoHistory = flags["repo-history"] === "on";
      }
      if (Object.keys(patch).length) {
        personOnly("Agent access");
        if (patch.access === "standard" || patch.access === "full") next.access = patch.access;
        if (patch.allow !== undefined) next.allow = (Array.isArray(patch.allow) ? patch.allow : String(patch.allow).split(/[,\n]/)).map((x) => String(x).trim()).filter(Boolean);
        const was = accessOf().headless;
        if (typeof patch.headless === "boolean") next.headless = patch.headless;
        if (patch.git !== undefined) {
          if (!W.ISOLATIONS.includes(patch.git)) throw new UsageError("Git isolation is off, branch or worktree.");
          next.git = patch.git;
        }
        if (patch.repoHistory !== undefined) {
          if (typeof patch.repoHistory !== "boolean") throw new UsageError("Repo history is true or false.");
          next.repoHistory = patch.repoHistory;
        }
        writeJson(file, { ...saved, agents: next });
        if (next.headless !== was) team.sync(root); // the templates start agents the new way
        // The project's git follows the setting: a query never touches it, only the user's patch.
        if (patch.repoHistory !== undefined) {
          const applied = W.applyRepoHistory({ root, on: next.repoHistory });
          next.repoHistoryNote = applied.note;
          next.repoHistoryError = applied.error;
        }
      }
      return out(flags, next, (x) => `Agents run ${x.headless ? "headless" : "as their CLI"}; access ${x.access}${x.allow.length ? `; also allowed: ${x.allow.join(", ")}` : ""}; git isolation ${x.git}.`);
    }

    default:
      throw new UsageError(`Unknown command ${cmd}. bh help lists them.`);
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(e instanceof UsageError ? `Usage: ${e.message}` : `bh: ${e.message}`);
  process.exit(e instanceof UsageError ? 2 : 1);
});

export { ensureDir, readJson, writeJson, store, spawnSync };
