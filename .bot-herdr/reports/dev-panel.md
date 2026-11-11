## Status
OPEN

## Questions
1. Part 3 ("review the engine, prompts, cache") produced findings, not fixes. Should this plan also change code?
   - Findings only — the plan records them (this report plus the others) and the person picks work later
   - Fix the three measured wins — role-text dedupe (brief 19–26 KB → ~12 KB), classifier prompt caps (`qa-risk` diff 60 000 chars, `pickScripts` 24 questions), duplicated engine helpers merged
   - All of it, including usage capture — the above plus reading `cache_read_input_tokens` out of the Claude stream so cache hit rate becomes a number we can tune against
2. Which prompt cost should be attacked first?
   - Per-agent brief size — every new agent pays 10–26 KB (~2.6–6.6k tokens) before its first word; the duplication is inside the role files
   - Per-message model calls — `bh classify route` runs a classifier for every send (node spawn + model call, 70 s timeout), and `qa-risk` can send ~17.5k tokens of raw diff per assessment
   - Cache visibility — nothing measures cache hits today, so any "improvement" is unverifiable; capture usage first, tune after

## Notes

### 1. Theme data (item 1): what the engine/host side owes the contrast fix
QA owns the palette fix; these are the contract facts it has to be built on.

- The host contract is `theme()` (`herdr.d.ts:270-281`, docs in the binary at `~/.config/herdr-app/AGENTS.md` text): it returns **every colour by name** — `background, canvas, chrome, surface, popover, raised, hover, selected, border, input, foreground, muted, dim, accent, accent_foreground, solid, solid_foreground, selection, working, blocked, done, idle, unknown, ansi0..15` — already resolved light/dark and already resolving a theme file's `colors` block **over** its top-level `background/foreground` (that is why the `win98` fixture in `test/palette.test.mjs:7` legitimately uses `foreground: "#000000"`, the `colors.foreground`, not the file's top-level `#c0c0c0`).
- The mod uses a subset and ignores the pairs the host guarantees: `mods/bot-herdr/look.js:180-216` reads `muted`/`dim` raw (`:198-199`), derives them by mixing when absent, and takes `accentInk` from `accent_foreground ?? base.accentInk` (`:204`). It never reads `solid`/`solid_foreground`, which the host documents as "a primary button" — the exact pair for a filled send button with a label on it.
- Measured with the repo's own `contrastOf`, tokens views actually use:
  | theme | pair | ratio |
  |---|---|---|
  | atom-one-dark (file, no `colors` block) | `muted` on `fill` (derived, 3.93) / `faint` (2.91) | fail |
  | atom-one-dark | `accentInk` on `accent` (#fff on our orange 3.12) | fail |
  | win98 (file) | `faint` #808080 on `raised` #dfdfdf | 2.96 fail |
  | bot-herdr-dark (own) | `faint` #73726c on `raised`; `accentInk` on `#d97757` | 2.39 / 3.12 fail |
  | bot-herdr-light (own) | `faint` #a6a39a on `raised`; `accentInk` on `#c96442` | 2.17 / 3.90 fail |
- A theme file with no `colors` block (atom-one-dark) makes `palette()` fall back to **our** `DARK.fill`/accent while keeping the theme's ink — a mixed palette. Any fix must handle "theme has ink but no surfaces", not just "theme has everything".
- The built-in presets (graphite/ink/moss/paper) are compiled into `herdr-app.exe`; `~/.config/herdr-app/themes/` holds only 4 files. A snapshot fixture generated once from `themes()` (QA's proposal) is the only way to cover them offline. `palette.test.mjs` already ships a hand-copied graphite fixture, so that pattern exists.

### 2. "Attach document…" (item 2): traced, and where it can fail silently
**No host API exists for picking files.** The whole `herdr` surface is in `herdr.d.ts:4-43` and in the binary's export table (`fileDialogs`-style symbols: `...feedbackPickImages knownAgents pickFolder feedbackClearImages...`): `pickFolder` (folders, this machine) and frame-only `feedbackPickImages` (`herdr.d.ts:323-326`). There is no `pickFiles`. So `composer.js:521-543` hand-rolls it per platform: `osascript` on macOS, a PowerShell one-liner on Windows (`:529-532`), `zenity`/`kdialog` elsewhere.

What I verified on this machine (Windows 11 26200, PowerShell 5.1.26100, STA):
- The exact argv from `composer.js:531` spawned with `node:child_process` spawns, blocks, and creates a **visible** top-level dialog (`class #32770`, title "Open") — checked by enumerating that PID's windows with `EnumWindows`.
- Same result when the parent hides the console (`Start-Process -WindowStyle Hidden`): the dialog still appears visible. So "no console ⇒ no dialog" is **not** the cause, and WinForms/STA/assembly-load are fine (`Add-Type -AssemblyName System.Windows.Forms` succeeds, `[DialogResult]::OK -eq 'OK'` is true).
- `exec` is a direct process spawn, not a shell: the binary contains no command-line shell wrapper for local exec (only Rust std's `cmd.exe /c` batch strings). So `$d` is not being eaten by a shell; the quoting is not the bug.
- What is left, and is not decidable from outside the app: the dialog is shown **without an owner window** (`$d.ShowDialog()`), so it can land behind herdr's focused window — indistinguishable from "nothing happened"; or the child gets a window station where `ShowDialog` returns immediately. Either way the code cannot tell you: `composer.js:533-540` is
  `const r = await exec(...); if (r.code === 0) this.addFiles(...); return;` — **a non-zero exit, an exception-and-cancel, and an empty selection all end in silence**. Only a spawn *rejection* reaches `this.say("No file picker here…")`.
- Minimum bar for whatever is built: it must surface (a) picker failed, (b) picker cancelled, (c) file chosen. Today all three look identical. One `bh`-side or mod-side log line inside that block would have answered the question in one user click.
- Operational: the app runs the **installed copy** (`~/.config/herdr-app/mods/bot-herdr`, identical files but distinct inodes, same mtimes). Verifying any fix here means `node install.mjs` (or `--switch`) before clicking the menu — `herdr-app check mods/bot-herdr` only type-loads it.
- Panel seats already asked the shape question (QA Q2: repair the dialog vs in-app browser vs folders only). From the engine seat: if the answer is "in-app browser", it needs an engine/`bh` listing endpoint that works for a space's `machine` too, because the composer today just puts raw paths into the message (`route.js:140,237`), and `pickFolder` is documented as this-machine only.

### 3. Engine review: size of what gets sent, and what it costs
Measured with the CLI itself (all reproducible): `node …/bh.mjs brief <role> --mode <mode> | wc -c`, 2026-11-11.

| role | role file | brief (child) | brief (panel) | brief (review) |
|---|---|---|---|---|
| design | 10 665 B | 26 375 | 22 418 | 24 034 |
| qa | 8 719 B | 23 688 | 19 742 | 21 358 |
| orchestrator (lead) | 11 115 B | 20 621 | — | — |
| dev | 4 003 B | 19 181 | 15 219 | 16 835 |
| research | 1 881 B | 11 221 | 13 116 | — |
| scout | 1 595 B | 10 695 | — | — |

So a spawned worker pays ~19 KB (≈4.8k tokens) and a Design child ~26 KB (≈6.6k) before its first token of work. Where it comes from (`engine/lib/team.mjs:61-136`): `global.md` (4.7 KB) **plus** the role file **plus** `worker.md` (5.9 KB) for every editing child, then tools, the report template, and up to 8 000 chars of knowledge (`knowledge.mjs:107-116`, files capped at 20 000 chars by `LIMIT:14`). A dev child therefore carries `Implementation` twice (`roles/dev.md:61`, `roles/worker.md:22`) and both `global.md` and `worker.md` restate rules/pace/handoff. Line-level duplication is zero (checked), so the fix is editorial merge, not dedupe by diff.

Prompt-cache behaviour is already close to right, and that is worth protecting:
- The brief is written **once per session** (`engine/lib/agent.mjs:207-209`, called only at `:224` when there is no session and at `:309` for `/team`) into `data/bot-herdr/briefs/<key>.md`, and passed as `--append-system-prompt-file` on the first Claude turn only (`runner.mjs:141-147`); codex and ACP harnesses get it inside the first prompt and never again (`runner.mjs:193`, `:429`); pi gets a system-prompt file (`:219`).
- CLI-mode agents get the team brief once per terminal, gated by the `bot-herdr.briefed3` label (`composer.js:306,312`, `brief.js:77-84`).
- Dynamic content (knowledge, the person's instructions for that agent) sits at the **end** of the brief (`team.mjs:131-136`), so the stable prefix is not disturbed — good; keep that ordering in any rewrite.
- **But none of it is measurable**: `grep usage engine/lib/runner.mjs` is empty. `claudeTurn`'s `result` event carries `usage` (including `cache_read_input_tokens` / `cache_creation_input_tokens`) and it is dropped (`runner.mjs:169-176`). Without that, "better cache hit rate" cannot be claimed, only argued. This is the smallest first step and it is ~10 lines into `state`.

Classifier cost is where the token waste actually is:
- `qaRiskRequest` (`classifier/qa-risk.mjs:313-331`) sends `diff: clip(input.diff, 60_000)` plus 10 questions. Measured: a 60 KB diff yields a **69 819-char prompt (≈17.5k tokens)**; the rubric itself is ~9.7k chars. It runs on a harness with a **60 s** timeout (`harness.mjs:86`, `index.mjs:135`) and 8 s on the API. The engine already computes a compact view of the same change (`diff_summary`, `fileKind`, `parseDiff`) — sending the summary plus hunks, not the raw diff, is the obvious cut.
- `pickScripts` (`index.mjs:287-295`) asks **one noul per candidate script, up to 24**, on every step → 24 questions where a single `choice` (or top-3) answers the same thing.
- Per message: `composer.js:246` spawns `bh classify route` (≈180 ms node start, measured `bh` invocations at 149–185 ms) plus a model call with a 70 s timeout, for every send.
- The classifier prompt is rebuilt per call by `promptFor` (`harness.mjs:24-52`) with `JSON.stringify(state, null, 1)` — no reuse, no cache. Cheap per call; fine as long as the calls themselves are few (see above).

Performance and dead weight in the engine (small, real):
- `engine/lib/core.mjs` and `engine/scripts/lib/common.mjs` implement the same `sh`, `projectRoot`, `parseArgs` (~120 lines duplicated) — the scripts are plain `node file.mjs` processes in the same package, so they can import `../lib/core.mjs`.
- `scripts/check_changed.mjs` and `scripts/run_changed_tests.mjs` overlap `bh check`, which already runs lint/typecheck/tests for what changed (`bh.mjs:47`); `diff_summary` already reports the tests that cover each file, so `find_tests_for` is mostly redundant for agents that use `diff_summary`.
- `bh` cold start 149–185 ms per call; briefs tell agents to call it constantly, so it is worth keeping module loading lazy in `bh.mjs` (it already dynamic-imports `qa-risk.mjs` at `:481`).
- No unused exports found in `engine/lib` or `engine/classifier` (scanned every `.mjs` in `mods/` and `test/`); the engine's dead weight is duplication, not orphans.
- `qa-risk.mjs` is written in a different (dense, 4-space) style from the rest of the engine — if it was generated, the source should be in the repo or it should be reformatted; if hand-written, it is an outlier to merge.

### Done, from my seat
Whatever the plan builds must be verifiable without the OS dialog and without a human click: a pure `pickerCommand(platform)` / `parsePickerOutput(stdout)` pair with tests (QA proposes the same), a visible outcome for failed/cancelled picks, contrast checked in one parameterised test over a committed theme snapshot, and — if part 3 is implemented — at least one number (usage/cache tokens, or prompt size) captured where a reviewer can read it. Anything installed must be re-installed with `node install.mjs` before it is judged working.
