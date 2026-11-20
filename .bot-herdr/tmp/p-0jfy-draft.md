## Status
GRILLING

## Title
A browser the agents can drive

## Plan

### Steps
1. Add `engine/lib/browser.mjs`: launch the system Chromium (found by `findBrowser()`), drive it over the DevTools protocol, keep its endpoint in a state file so one-shot agent turns reattach.
2. Add `bh browser` commands: `open <url>`, `snapshot`, `click <ref>`, `type <ref> "<text>"`, `press <key>`, `eval "<js>"`, `console`, `network`, `screenshot [--chat]`, `tabs`, `close`; `--json` output.
3. Enforce the reach rule and profile rule chosen in round one, in code (navigation interception), plus the fixed safeguards under Risks.
4. Add a one-shot `bh browser check` QA can cite: scripted steps, pass/fail per step, exit code, screenshots.
5. Show the browser in the app where the person chose (round one), with the agent's name, the URL, a status line and the take-over control chosen.
6. Tests: unit tests (launch args, reach rule, state-file reattach, failure paths), an integration test against a local fixture server that skips without a browser, and a check for orphaned processes and profiles.
7. Document it in the README and the agents' briefs (QA and Design get it in their toolset).

### Objective
Give every agent a real Chromium it can open, read, click and screenshot, so QA and Design can test web apps end to end, and (if chosen) agents can use sites on the internet, while the person can see what they do.

### Scope and non-goals
- In: a `bh browser` command for every harness, a live view in the app, QA evidence with screenshots.
- Not in: a true embedded web page inside herdr (herdr's mod API has no web view; that would be a change to herdr itself), Playwright or Puppeteer as dependencies, video-smooth streaming, MCP wiring per harness (could come later).

### Acceptance criteria
- An agent on Claude Code, Codex or pi can `bh browser open http://localhost:<port>`, read the page as text with numbered refs, click and type across separate turns, and post a screenshot that shows in the chat.
- The reach and login rules chosen are enforced in code, including redirects.
- `bh browser check` gives a citable pass/fail with screenshots.
- No Chromium process or temporary profile is left after a task ends, a timeout or a crash.
- Without Chromium installed, every command fails with "Install Chromium (pacman -S chromium) or set BH_BROWSER".
- Tests pass with a browser present and skip cleanly without one; `bh check` and `herdr-app check mods/bot-herdr` pass.

### Affected areas
- Dev: `engine/lib/browser.mjs` (new), `engine/bh.mjs` (command), `engine/lib/media.mjs` (`findBrowser` reuse), briefs.
- Design: a page or pane in the mod (`pages.js`, `icons/`, `layouts/bot-herdr.json`), screenshot frames via `image()`.
- QA: new tests under `test/`.

### Decisions by domain
- [DEV] Speak CDP directly, no npm dependency; reuse `findBrowser()` from `media.mjs:30`.
- [DEV] A `bh` command, not an MCP server: `bh` already runs on every harness and is allowed in standard access.
- [DEV] Snapshot as accessibility-tree text with numbered refs (cheap for models); screenshots on request.
- [DESIGN] The live view is streamed screenshots (DevTools screencast frames drawn with `image()`), a few frames a second.
- [QA] One browser at a time across all agents (lock/queue): this machine has about 2.4 GB free RAM.

### Assumptions
- [DEV] Raise the minimum Node version to 22 for the built-in WebSocket (this machine runs Node 26).
- [DEV] Chromium comes from the system (`pacman -S chromium` on this Arch Linux ARM machine); nothing is downloaded by the mod.
- [QA] A failed browser check is retried once and marked flaky, never passed.

### Risks and open points
- Chromium is not installed here yet; it must be before the feature can be tested on this machine.
- Everything runs as root here, so Chromium needs `--no-sandbox`; with open-internet reach that is a real exposure. Agents running as a non-root user keep the sandbox.
- Page text is untrusted: a page can try to steer an agent that also has shell access. Fixed safeguards regardless of answers: separate profile per agent (never the person's default), downloads off, no `file://` outside the project, debugging port on 127.0.0.1 with a random port, browser killed at task end or idle timeout.
- To verify early: whether `image()` caches by path (if so, each frame needs a new file name and cleanup).
- Open (round one): where the browser shows, how take-over works, what it may reach, whether it carries logins.
