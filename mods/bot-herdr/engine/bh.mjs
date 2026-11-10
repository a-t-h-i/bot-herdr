#!/usr/bin/env node
// bh: bot-herdr's tools for the agents (and for the bot-herdr chat). One command line, so every
// harness can use them: tasks and their boards, plans, knowledge, shared scripts, questions for
// the person, replies to the chat, the classifier, and starting team members.
//
//   node <app home>/mods/bot-herdr/engine/bh.mjs help

import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { argvOf, effortsOf, slug, withPrompt } from "../roster.js";
import { APP_HOME, BH, DATA, UsageError, accessOf, bodyText, ensureDir, myAddress, need, parseArgs, projectRoot, readJson, readText, sh, store, writeJson, writeText } from "./lib/core.mjs";
import * as T from "./lib/tasks.mjs";
import * as P from "./lib/plans.mjs";
import * as K from "./lib/knowledge.mjs";
import * as S from "./lib/scripts.mjs";
import * as Q from "./lib/ask.mjs";
import * as team from "./lib/team.mjs";
import * as W from "./lib/workspace.mjs";
import * as C from "./classifier/index.mjs";
import { replyText } from "./lib/agent.mjs";

const HELP = `bh: bot-herdr's tools. Run from the project folder. Add --json for machine-readable output.

Tasks
  bh task new "<request>" [--title T] [--track fast|full] [--plan P] [--branch|--worktree|--no-git]
                                  start a task (prints its triage, and its branch or worktree when Settings isolates tasks)
  bh task list [--all]            bh task show [<id>]            bh task current
  bh task steps <id> "<step>" "<step>" …   (or --file plan.md: its ## Steps list)
  bh task step <id> <n> start|done|block|skip [--agent A] [--note N]
  bh task status <id> active|paused|done|abandoned     bh task archive <id>
  bh task comment <id> [--step N] "<text>"     bh task resolve <id>     (the person's comments)
  bh board post <task> contract|decision|blocker|question|done|note "<text>" [--from A] [--to B]
  bh board read <task> [--kinds a,b] [--since N]

Plans
  bh plan new "<idea>"            bh plan list            bh plan show <id>
  bh plan write <id> --file draft.md [--status grilling|ready]
  bh plan comment <id> [--line N] "<text>"     bh plan resolve <id>
  bh plan task <id>               (a task from the plan's steps)     bh plan archive <id>

Knowledge (one file per agent)
  bh knowledge [<agent>]          bh knowledge list       bh knowledge search "<words>"
  bh knowledge add <agent> "<fact>" [--section Facts|Standards|Decisions|History]
  bh knowledge note <agent> "<entry words>" "<note>"      bh knowledge write <agent> --file F

Scripts
  bh scripts                      bh scripts show <name>        bh scripts run <name> [args…]
  bh scripts pick "<step>"        bh scripts save <file> [--name snake_case]
  bh check [--base <ref>]         lint, typecheck and tests for what changed

The person
  bh ask --file questions.md [--title T]      (or: bh ask "<question>" --option "A — meaning" --option "B")
  bh reply "<markdown>"  |  bh reply --file reply.md       your reply in the bot-herdr chat

The team
  bh team                         who is set up, with harness, model and effort
  bh spawn <agent> --name <short> [--task T --step N] [--effort auto|<level>] [--panel P] [--review] "<brief>"
  bh agent <agent> [--mode lead|child] [--name N] [-- "<first message>"]   run an agent headless in this terminal
  bh classify route|triage|effort|qa-risk "<text>" [--task T]
  bh brief <agent> [--mode lead|child|panel|review]        bh sync   (write the hc templates)

Used by the bot-herdr chat and Settings (--data takes URI-encoded JSON; agents can't change these)
  bh team save --data <roster>    bh config [--data <changes>]    bh questions    bh open <file>
  bh harness add <key> --name "<Name>" --run "<command and arguments>"
  bh access [standard|full] [--allow "npm test, git commit"]     how agents run, what they may do without asking
  bh mockup <file.html> | --data <html>     bh clip     bh preview <image>…     pictures for the chat`;

/**
 * Settings that decide what agents may do are the person's: refused when a headless agent runs
 * bh (the agent terminal marks everything it starts with BH_AGENT), so no agent can widen its
 * own access. An agent run as its CLI asks the person before each command anyway.
 */
function personOnly(what) {
  if (process.env.BH_AGENT) throw new Error(`${what} is the person's to change, in bot-herdr's Settings. Ask them if you need it.`);
}

const out = (flags, value, text) => console.log(flags.json ? JSON.stringify(value, null, 2) : typeof text === "function" ? text(value) : text ?? value);

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

/** What a task changed since it started: files and diff, untracked files included. */
function changes(root, base) {
  const from = base || "HEAD";
  const diff = git(root, ["diff", from]).out;
  const files = new Set(git(root, ["diff", "--name-only", from]).out.split("\n").filter(Boolean));
  for (const f of git(root, ["ls-files", "--others", "--exclude-standard"]).out.split("\n").filter(Boolean)) files.add(f);
  return { files: [...files], diff };
}

async function main(argv) {
  const [cmd = "help", sub, ...more] = argv;
  const root = projectRoot();
  const c = C.makeClassifier();
  const { flags, rest } = parseArgs(argv.slice(1), ["option", "kinds"]);
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
      const task = T.loadTask(root, id);
      const rest2 = args[0] === id ? args.slice(1) : args;
      if (sub === "show" || sub === undefined) {
        const where = [W.gitLine(task.git), W.missingWorktree(task)].filter(Boolean).join("\n");
        return out(flags, { ...task, worked: T.worked(task), board: T.board(root, id), cwd: W.taskCwd(task, root) }, () => T.taskText(task, T.board(root, id)).replace(/\n/, `\n${where ? `${where}\n` : ""}`));
      }
      if (sub === "steps") {
        const titles = typeof flags.file === "string" ? T.stepsFromMarkdown(bodyText(flags, [])) : rest2;
        need(titles.length || "", `bh task steps <id> "<step 1>" "<step 2>" …`);
        T.setSteps(task, titles);
        T.saveTask(root, task);
        return out(flags, task, (t) => t.steps.map((s) => `${s.n}. ${s.title}`).join("\n"));
      }
      if (sub === "step") {
        const [n, to] = rest2;
        need(to, "bh task step <id> <n> start|done|block|skip");
        const step = T.moveStep(task, n, to, { agent: flags.agent, note: flags.note });
        T.saveTask(root, task);
        return out(flags, step, (s) => `Step ${s.n} is ${s.status}: ${s.title}`);
      }
      if (sub === "status") {
        T.setStatus(task, need(rest2[0], "bh task status <id> <status>"));
        T.saveTask(root, task);
        return out(flags, task, (t) => `${t.id} is ${t.status}.`);
      }
      if (sub === "comment") {
        const x = T.comment(task, { step: flags.step ?? null, text: need(rest2.join(" ") || bodyText(flags, []), 'bh task comment <id> [--step N] "<text>"') });
        T.saveTask(root, task);
        return out(flags, x, () => `Comment ${x.id} added.`);
      }
      if (sub === "resolve") {
        task.comments = (task.comments ?? []).map((x) => ({ ...x, open: false }));
        T.saveTask(root, task);
        return out(flags, task, () => "Comments marked addressed.");
      }
      if (sub === "archive" || sub === "unarchive") {
        task.archived = sub === "archive";
        T.saveTask(root, task);
        return out(flags, task, (t) => `${t.id} ${t.archived ? "archived" : "back in the list"}.`);
      }
      throw new UsageError("bh task new|list|show|steps|step|status|comment|resolve|archive");
    }

    case "board": {
      const id = need(args[0], "bh board post|read <task> …");
      if (sub === "post") {
        const [kind, ...words] = args.slice(1);
        const entry = T.post(root, id, { kind, text: need(words.join(" ") || bodyText(flags, []), 'bh board post <task> <kind> "<text>"'), from: flags.from ?? null, to: flags.to ?? null });
        return out(flags, entry, (e) => `Posted ${e.kind} #${e.n}.`);
      }
      const kinds = flags.kinds ? String(flags.kinds).split(",") : null;
      return out(flags, T.board(root, id, { kinds, since: Number(flags.since ?? 0) }), (l) => l.map((e) => `${e.n}. [${e.kind}]${e.from ? ` ${e.from}` : ""}${e.to ? ` → ${e.to}` : ""}: ${e.text}`).join("\n") || "The board is empty.");
    }

    case "plan": {
      if (sub === "new") {
        const idea = need(bodyText(flags, args), 'bh plan new "<idea>"');
        return out(flags, P.newPlan(root, { idea, title: flags.title }), (p) => `${p.id}: ${p.title}`);
      }
      if (sub === "list") return out(flags, P.listPlans(root, { all: Boolean(flags.all) }), (l) => l.map(P.planLine).join("\n") || "No plans yet.");
      const id = need(args[0], `bh plan ${sub} <id>`);
      const plan = P.loadPlan(root, id);
      if (sub === "show") {
        const open = P.openComments(plan);
        return out(flags, plan, (p) => `${P.planLine(p)}\n\n${p.markdown || "(no draft yet)"}${open.length ? `\n## Open comments from the person\n${open.map((x) => `- ${x.line ? `line ${x.line} ("${x.quote}")` : "the plan"}: ${x.text}`).join("\n")}` : ""}`);
      }
      if (sub === "write") {
        P.writeDraft(plan, need(bodyText(flags, args.slice(1)), "bh plan write <id> --file draft.md"), { status: flags.status, title: flags.title });
        P.savePlan(root, plan);
        return out(flags, plan, (p) => `${p.id} round ${p.round}: ${p.status}.`);
      }
      if (sub === "comment") {
        const x = P.comment(plan, { line: flags.line ?? null, text: need(args.slice(1).join(" ") || bodyText(flags, []), 'bh plan comment <id> "<text>"') });
        P.savePlan(root, plan);
        return out(flags, x, () => `Comment ${x.id} added.`);
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
      throw new UsageError("bh plan new|list|show|write|comment|resolve|task|archive");
    }

    case "knowledge": {
      if (sub === "list") return out(flags, K.list(root), (l) => l.map((k) => `${k.agent}: ${k.entries} entries, ${k.chars} characters${k.over ? " (over the limit: rewrite it shorter)" : ""}`).join("\n") || "No knowledge yet.");
      if (sub === "search") return out(flags, K.search(root, args.join(" ")), (l) => l.join("\n") || "Nothing found.");
      if (sub === "add") {
        const [agent, ...words] = args;
        const r = K.add(root, need(agent, "bh knowledge add <agent> \"<fact>\""), need(words.join(" ") || bodyText(flags, []), 'bh knowledge add <agent> "<fact>"'), flags.section ?? "Facts");
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
      const base = flags.base ?? T.currentTask(root)?.base ?? null;
      const extra = base ? ["--base", base] : [];
      console.log("## Lint and typecheck (check_changed)");
      const a = S.run(root, "check_changed", extra);
      console.log("\n## Tests for what changed (run_changed_tests)");
      const b = S.run(root, "run_changed_tests", extra);
      console.log(`\n${a === 0 && b === 0 ? "PASS" : "FAIL"}: lint and typecheck ${a === 0 ? "pass" : "fail"}, tests ${b === 0 ? "pass" : "fail"}.`);
      process.exit(a === 0 && b === 0 ? 0 : 1);
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
        parsed = { intro: "", questions: [{ seat: null, text, options: opts, multi: Boolean(flags.multi) }] };
      }
      const from = flags.as ?? myAddress();
      if (!from) throw new Error("bh ask needs to know who is asking: run it in a herdr terminal (HC_TERMINAL_ID), or pass --as <address>.");
      const q = Q.ask({ title: flags.title ?? null, intro: parsed.intro, questions: parsed.questions, from, fromName: flags.from ?? null, cwd: root });
      return out(flags, q, () => `Asked (${q.id}, ${q.questions.length} question${q.questions.length === 1 ? "" : "s"}). The person answers in the bot-herdr chat; the answers come to you as a message. End your turn now.`);
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
      return console.log(team.brief(a, { mode: flags.mode ?? (a.lead ? "lead" : "child"), parent: flags.parent ?? null, task: flags.task ?? null, plan: flags.panel ?? flags.plan ?? null, root, name: flags.name ?? null }));
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
      let risk = "";
      if (mode === "review" && task) {
        const t = T.loadTask(root, task);
        if (t.qa) risk = (await import("./classifier/qa-risk.mjs")).qaRiskBrief(t.qa);
      }
      const report = task ? `.bot-herdr/tasks/${task}/reports/${name}.md` : `.bot-herdr/reports/${name}.md`;
      const about = [
        `You are ${name}.`,
        task ? `Your task is ${task} (bh task show ${task}); post on its board with --from ${name}.` : "",
        flags.panel ? `The plan is ${flags.panel} (bh plan show ${flags.panel}).` : "",
        `When done or stuck, write your report to ${report} and send its path with a one-line summary: hc send ${parent ?? "<the agent that started you>"} "<summary> — ${report}".`,
      ].filter(Boolean).join(" ");
      const first = `${text}\n\n(${about})`;
      // A task with a worktree: its agents run there.
      const cwd = flags.cwd ?? (task ? W.taskCwd(T.loadTask(root, task), root) : root);
      let r;
      if (team.runsHeadless(agent)) {
        // The agent terminal: it runs the harness headless, writes its own brief, and reports
        // its status, so hc wait sees each turn end.
        const argv = team.agentArgv(agent, { mode, name, parent, task, effort, model: flags.model ?? null });
        r = team.hc(["run", "--bg", "--name", name, "--cwd", cwd, "--", ...argv, "--", risk ? `${first}\n\n${risk}` : first]);
      } else {
        // The template carries the generic brief (role, team, knowledge); this run's specifics go
        // with the task, so one template per agent and mode serves every spawn.
        const body = team.brief(agent, { mode, root }) + (risk ? `\n\n${risk}` : "");
        const variant = [slug(a.name), mode !== "child" ? mode : "", flags.model ? slug(flags.model) : "", effort !== a.effort ? effort : ""].filter(Boolean).join("-");
        const template = team.writeTemplate(agent, known, { name: mode === "child" && variant === slug(a.name) ? variant : `bh-${variant}`, body, effort });
        r = template
          ? team.hc(["run", "--bg", "--name", name, "--cwd", cwd, template.name, first])
          : team.hc(["run", "--bg", "--name", name, "--cwd", cwd, "--", ...withPrompt(argvOf(agent, known, { effort }), first), `${body}\n\n${first}`]);
      }
      if (task && flags.step) {
        const t = T.loadTask(root, task);
        T.moveStep(t, flags.step, "start", { agent: name });
        T.saveTask(root, t);
      }
      if (r.code !== 0) throw new Error(`hc run failed: ${(r.err || r.out).trim()}`);
      return out(flags, { name, agent: a.name, effort, routed, hc: r.out.trim() }, (x) => `Started ${x.name} (${x.agent}${x.effort ? `, effort ${x.effort}` : ""}${x.routed ? `; routed: ${x.routed}` : ""}). Wait with hc wait --children any.`);
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
        const { files, diff } = changes(root, flags.base ?? task?.base);
        const risk = await C.qaRisk(c, { files, diff, request: task?.request, bugfix: task?.triage?.kind === "bugfix" });
        if (task) {
          task.qa = risk;
          T.saveTask(root, task);
        }
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
      const shown = { ...config, key: Boolean(config.key), keyFound: Boolean(t.key), using: t.name, hosts: Object.fromEntries(Object.entries(C.HOSTS).map(([k, h]) => [k, { label: h.label, env: h.env, model: h.model }])) };
      return out(flags, shown, (x) => `Classifier ${x.enabled ? "on" : "off"}; host ${x.host} (using ${x.using}); key ${x.keyFound ? "found" : "missing"}.`);
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
      // Opens a file (a question's mockup) in the person's default app, without waiting for it.
      const file = need(sub, "bh open <file>");
      const [cmd, args2] = process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : process.platform === "darwin" ? ["open", [file]] : ["xdg-open", [file]];
      spawn(cmd, args2, { detached: true, stdio: "ignore", windowsHide: true }).unref();
      return out(flags, { ok: true }, "Opened.");
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
      const word = need(sub, 'bh agent <agent> [--mode lead|child|panel|review] [--name N] [--parent T] [--task T] [--model M] [--effort E] [-- "<first message>"]');
      return runAgent({ word, mode: flags.mode ?? "lead", name: flags.name ?? null, parent: flags.parent ?? null, task: flags.task ?? null, model: flags.model ?? null, effort: flags.effort ?? null, first: args.join(" ") });
    }

    case "access": {
      // Settings → How agents run: headless or as their CLI, and what they may do without
      // asking. Standard unless the person picks full.
      const file = join(DATA, "config.json");
      const saved = readJson(file, {}) ?? {};
      const next = accessOf();
      const level = rest[0];
      if (level && level !== "standard" && level !== "full") throw new UsageError('bh access [standard|full] [--allow "npm test, git commit"] [--git off|branch|worktree]   or   bh access --data <changes>');
      const patch = typeof flags.data === "string" ? JSON.parse(bodyText(flags, [])) : {};
      if (level) patch.access = level;
      if (typeof flags.allow === "string") patch.allow = flags.allow;
      if (typeof flags.git === "string") patch.git = flags.git;
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
        writeJson(file, { ...saved, agents: next });
        if (next.headless !== was) team.sync(root); // the templates start agents the new way
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
