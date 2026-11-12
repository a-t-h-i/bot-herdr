# Scout report: mockups on the question card

## Summary
A mockup is lost at the first of four steps that can fail silently: the agent's questions file is parsed, not validated, so a fence in the wrong place or a non-`mockup` fence just disappears, and the agent is never told. I drew four well-formed mockups for real here and they all worked (about 1.1–1.5 s each). I could not see the other machine, so the likeliest struggle is in parsing or harness choice, not drawing.

## Changes
None. Read-only on `mods/` and `test/`. Temp files only, under `%TEMP%\scout-mock-8mLZ` (outside the repo).

## Brief Check
- Q1 path, files, draw point, what the person sees — met (sections 1 and 2).
- Q2 every failure point, ranked, and whether the agent is told — met.
- Q3 real run in a temp app home, `bh ask` not run — met (section 3).
- Q4 gpui native drawing, verified from the d.ts only — met, with what could not be verified stated.
- Q5 AskUserQuestion preview and runner pass-through — met.
- Ranked failure list and 2–3 fixes with trade-offs — met.

## 1. The exact path

1. **Agent writes `questions.md`.** The brief tells it to put a fenced `mockup` block under each option: `mods/bot-herdr/engine/roles/panel.md:35-42, 64-75`; the team's tool line is `mods/bot-herdr/engine/lib/team.mjs:83`.
2. **`bh ask --file questions.md`** → `mods/bot-herdr/engine/bh.mjs:343-360` (`ask` case). The `--file` path calls `Q.parseQuestions`. The inline `--option` form builds options with `mockup: null` (`bh.mjs:354`), so **that form can never carry a mockup**.
3. **Parse:** `mods/bot-herdr/engine/lib/ask.mjs:23-60`. CRLF is normalised (`:24`). A fence opens only on `/^\s*```\s*(mockup|html)\s*$/i` (`:38`) and closes on `/^\s*```\s*$/` (`:32`). The block is attached only if `opt` is set (`:33`), i.e. it must come after an option line.
4. **Files written at ask time:** `ask.mjs:62-75`. Each mockup becomes `<app home>/data/bot-herdr/questions/<id>-<q>-<o>.html` (`:68-69`), wrapped in a document if it has no `<html` (`:67`). The question record is `questions/<id>.json` (`:73`). **No PNG is drawn at `bh ask` time.** The `bh ask` reply is just "Asked (…)" (`bh.mjs:360`).
5. **Draw happens when the card renders, in the mod.** `mods/bot-herdr/composer.js:2116-2122` calls `mockupFile(o.mockupFile, this.cx)` (`mods/bot-herdr/media.js:54-56`). `draw()` (`media.js:25-45`) runs `bh mockup <file> --json` through `bh.js:28-33` (`exec("node", …)`, 30 s default, 60 s `DRAW_MS` at `media.js:10,36`). It is cached in memory by `file:<path>` (`media.js:26-29`).
6. **Engine draws:** `bh.mjs:562-568` → `media.mjs:76-97` `drawMockup`. It reuses an existing PNG if newer than the HTML (`:78`), finds a browser (`:79`), wraps fragments in a `.page.html` (`:84-87`), runs headless Chrome with a temp profile (`:88-91`, `screenshotArgs` at `:62-70`), and returns `{png, image}` with `image = appPath(png)` (`:21`, `:93`). PNG is `questions/<id>-<q>-<o>.png` beside the HTML.
7. **Shown:** `composer.js:2116-2180`. A 16:11 tile per option (`:2119-2124`), `image(d.image)` (`:2165` area), grid of 2 or 3 columns (`drawer.js:18-24`). Clicking opens the lightbox (`composer.js:2127-2132`, `lightbox.js`), where "Choose this" answers.

**What the person sees:** a tile saying "Drawing…" (`composer.js` `.when(d?.state === "drawing")`), then the picture. On failure, "Couldn't draw it here" plus an "Open in browser" link (`composer.js:2173-2177`). The error text is not shown on the question card. The card has no mockup at all when the option had no fence, and no message says why.

**Chat replies (the same mechanism, for context):** `feed.js:140` regex `^```[ \t]*(mockup|html)[^\n]*\n…` (this one does accept an info string), drawn by `chat.js:888-950`, which shows the error's first line and "Open in browser" on failure.

## 2. Failure points, ranked by how likely each is the struggle

**Ranked, most likely first:**

1. **Agent writes a mockup the parser drops, silently (most likely).** Verified by running `parseQuestions` (section 3 and below):
   - Fence info string: "```mockup title" does not match `ask.mjs:38`; the body is then discarded because it is neither a question nor an option (`ask.mjs:49-57`). Result: no mockup, no error.
   - `~~~` fences: not recognised at all. Same silent drop.
   - Fence on the question, not under an option (`ask.mjs:33`): `opt` is null, so the fence is consumed and discarded. Verified: "Only option" has no mockup.
   - Fence under the *previous* option after a blank/other line: attaches to the wrong option only if the agent puts it before the next `- ` line. Not tested.
   - Fence indentation and CRLF are fine: `\s*` is tolerated (`ask.mjs:32,38`), and `\r\n` is normalised (`:24`). Verified: 4-space and 8-space indents and CRLF all parsed.
   - Agent wrote `bh ask "…" --option …`: no mockup possible (`bh.mjs:354`).
   - **Asking through Claude Code's own AskUserQuestion**: the card is built by `fromAskTool` (`mods/bot-herdr/engine/lib/runner.mjs:162-182`), which reads only `label` and `description`. Any `preview` field is dropped, and `mockup: null` is hard-coded (`runner.mjs:178`). Runner routes it at `runner.mjs:252-257` and `:339`.
   - Nothing tells the agent a block was dropped. `parseQuestions` returns no warnings, and `bh ask` replies "Asked (…)" (`bh.mjs:360`).
2. **No browser found, and the reason is hidden (likely on a second machine).** `media.mjs:29-48`:
   - Windows: only `Edge`, `Chrome`, `Brave` and `Chromium` under `PROGRAMFILES`, `PROGRAMFILES(X86)` and `LOCALAPPDATA` (`:32-36`). Scoop, custom install folders, and Chrome Beta or Canary (other app folders) are not searched. Verified: with an empty env and `exists: false`, `findBrowser` returns null.
   - Linux: only PATH lookups of `chromium`, `chromium-browser`, `google-chrome`, `google-chrome-stable`, `microsoft-edge`, `brave-browser` (`:43-46`). Not searched: `/opt/google/chrome`, `/snap/bin` if not on PATH, and flatpak (`flatpak run com.google.Chrome`). Verified: linux with nothing on PATH returns null.
   - macOS: only `/Applications` and `~/Applications` (`:38-41`).
   - `BH_BROWSER` overrides everything (`:31`). `chrome-headless-shell` is not searched (the test uses it at `test/round5.test.mjs:252`).
   - Failure display: "Couldn't draw it here" (`composer.js:2173`). The reason is only in `drawMockup`'s error (`media.mjs:80`), which the card does not show.
3. **The mod can't run `node` or the engine, and the error becomes generic.** The mod shells out with `exec("node", …)` (`bh.js:28-33`). If herdr's process PATH has no `node` (common when node comes from nvm or fnm in the shell profile only), `parse()` returns null and the error becomes "The mockup couldn't be drawn." (`media.js:36-38`). Not reproduced here; inferred from the code.
4. **Headless draw fails or hangs.**
   - `spawnSync` timeout 45 s (`media.mjs:91`) is shorter than the mod's 60 s (`media.js:10`), so the engine kills first; the error reads "The browser didn't draw it: …" (`media.mjs:92`).
   - `--virtual-time-budget=2500` (`media.mjs:66`), so remote fonts or images that stall are a risk. The brief says "no images, fonts or links: the sandbox strips them" (`panel.md:35-37`), but **no sanitiser exists** in the code (grepped `mods/bot-herdr`: none). Remote `<link>` or `@import` will be fetched by Chrome.
   - `--no-sandbox` only when root (`media.mjs:90-91`). `--headless=new` needs Chrome 112 or newer; an older Edge or Chromium will fail with no PNG.
   - A stale or still-running browser is avoided by a fresh profile per draw (`media.mjs:88`).
5. **herdr `image()` path rules.** `appPath` gives a path relative to the *engine's* `APP_HOME` (`media.mjs:21`), but the mod builds its own paths from `appHome()` (`media.js:14`) and `image()` resolves against the app root (`gpui-kit.d.ts:20276-20279`). They agree only if `APP_HOME` = `appHome()`. The engine's `APP_HOME` honours `BH_APP_HOME` (`core.mjs:15`). A cross-drive path (for example, `D:` vs `C:` app home) gives an absolute path that `image()` can't load (`appPath` returns `D:/…`, verified). Result: a blank tile or a tile that stays "Drawing…".
6. **Stale PNG after the HTML is edited.** Reused if the PNG is newer than the HTML (`media.mjs:78`), so fine unless clocks are skewed (the other machine). Not tested.
7. **Question JSON holds absolute paths** (`ask.mjs:68`). Fine locally. If the asking agent runs somewhere else, the HTML isn't on the person's machine and the draw fails (`readFileSync` throws, `media.mjs:82`). Not verified.
8. **No size or content checks.** The brief's "at most 30,000 characters" (`panel.md:38-39`) is not enforced anywhere. A large mockup draws as a 1200x825 crop, with no warning.
9. **Mod-side draw is lazy.** A mockup draws only when the card renders (`composer.js:2116`). If the person never opens the card, nothing is drawn; nothing else is affected.

**Is the asking agent ever told a mockup failed?** No. `answersText` only reports picks and text (`ask.mjs:99-110`). The draw runs in the mod after `bh ask` has already returned (`bh.mjs:360`). No path back to the agent.

## 3. Real run (temp app home; `bh ask` not run)

Script: `%TEMP%\scout-mock-8mLZ\run.mjs`, with `BH_APP_HOME=%TEMP%\scout-mock-8mLZ\apphome`. Node v24.19.0. Chrome found at `C:\Program Files\Google\Chrome\Application\chrome.exe`. Edge is also installed.

Input: question 1 (two well-formed `mockup` blocks, LF), question 2 (4-space and 8-space indents, CRLF line ends, one `mockup` fence and one `html` fence), question 3 (a fence directly under the question, then one option with no fence).

- Parsed: 3 questions. Q1 both options got mockups. Q2 both got mockups (CRLF and indentation fine). Q3's option got none. **The fence under the question vanished silently.**
- `Q.ask` wrote 4 HTML files and 1 JSON record in the temp home. Only 4 mockups were recorded, matching the 4 fenced options.
- `drawMockup` on each:
  - `q-…-1-1` → 1467 ms, PNG 6703 bytes, `image=data/bot-herdr/questions/q-…-1-1.png`
  - `q-…-1-2` → 1105 ms, PNG 6851 bytes
  - `q-…-2-1` → 1188 ms, PNG 6633 bytes
  - `q-…-2-2` → 1110 ms, PNG 6269 bytes
- I opened one PNG (Warm, orange text on white): the content rendered correctly.

Extra parser checks (no drawing):
- "```mockup title" → mockup null, silently dropped.
- "~~~mockup" → mockup null, silently dropped.
- fence not indented under an option (column 0) → works.
- closing fence with trailing space → works.

Not tested: a browser missing or failing (only the null return from `findBrowser` with an empty env was checked); the 45 s timeout (no stall case); external resources; the mod's `exec` path; the card render itself. I did not touch the person's chat.

## 4. gpui: can it draw a mockup natively?

Verified from `mods/bot-herdr/gpui-kit.d.ts` only:
- `image(path)` — "A full-color image from the application's own directory… SVG, PNG, JPEG and other GPUI image formats are supported by the host image loader." (`gpui-kit.d.ts:20282-20291`). So an `.svg` file **should** draw in full colour via `image()`. Not verified by running; the herdr app was not launched.
- `svg(path)` is a theme-tinted mask, not full colour (`:20276-20282`).
- `TextView.html` / `TextView.markdown` (`:20701-20710`): "Rich HTML or Markdown text. CSS in HTML is not supported." This cannot render a `<style>`-based mockup.
- No renderer for a layout description (no JSON or DSL in the d.ts). The layout builders are there: `div`, `h_flex`, `v_flex`, `.bg`, `.rounded`, `.border_1`, `.text_size` (used throughout `composer.js` and `chat.js`). A small spec-to-element builder in the mod could draw a simple layout without a browser, but that is new code, not in the d.ts.

Could not verify: whether SVG via `image()` renders correctly in this herdr build; whether the d.ts is complete. `herdr-app shot` exists (in `herdr-app --skill`) for checking the window later.

## 5. Claude's AskUserQuestion: preview per option

- I could not verify from the repo or from this session whether Claude Code's AskUserQuestion accepts a per-option preview. I believe newer builds allow one, but I have no evidence for that here, so treat it as unknown.
- Regardless of the tool, `runner.mjs` does not pass it through: `fromAskTool` maps only `label`, `description` and `multiSelect` (`runner.mjs:167-182`), with `mockup: null`. So nothing reaches the card.
- ACP: runner handles only `session/request_permission` (`runner.mjs:490-502`); no question tool becomes a card, so no mockups either.

## Knowledge Proposals
- Question mockups are stored as `questions/<id>-<q>-<o>.html` and drawn in the mod on card render through `bh mockup`; only `bh ask --file` carries them, never `--option` or AskUserQuestion. (Worth knowing before the next agent struggles with mockups.)

## Script Proposals
- None.

## Blockers
- The actual struggle is on the other machine, which I cannot see. I could not confirm which of items 1–5 it is. Ask the person: which agent/harness, and what the card shows (no picture, "Couldn't draw it here", or nothing at all). Also check whether Chrome or Edge is installed there, and whether `node` is on herdr's PATH.

## Pushback
- `panel.md:35-37` says the sandbox strips scripts, images, fonts and links. No such sandbox exists in the code: `media.mjs` loads the HTML as-is in headless Chrome. This should be fixed in the brief, or the sanitiser added.

## Ways to make mockups reliable
1. **Validate at `bh ask` time and tell the agent (small, high value).** In `parseQuestions`, warn on any fence it drops (info string, `~~~`, not under an option). Draw each mockup in `bh ask` (a PNG beside the HTML) and print a line per failure in the reply, so the agent fixes it before the person sees the card. Trade-off: `bh ask` gets slower (about 1.2 s per mockup) and still needs a browser.
2. **Make the browser step explicit and visible (medium).** Add a Settings check for a browser (with the path it found), extend `findBrowser` to Scoop and flatpak paths, and show the error in the card's "Couldn't draw it here" tile instead of hiding it. Trade-off: more UI and a browser is still required.
3. **Drop the browser for the card (larger).** Have the agent write a simple SVG for each option (`image()` draws full colour), or have the mod render a small layout spec with `div`/`h_flex` builders. Trade-off: new rendering code and less fidelity than real CSS mockups; an SVG is harder for agents to write than HTML.

Recommended order: 1 first (cheap, addresses the most likely cause), then 2. Only then decide on 3.

## Verification
- `parseQuestions` on mixed LF/CRLF, indented and not indented fences — works as described above.
- `drawMockup` ×4 in a temp app home — 4 PNGs, 1.1–1.5 s each; one PNG viewed.
- `findBrowser` with empty env, win32 and linux — null in both.
- `appPath("D:/elsewhere/x.png")` — returns `D:/elsewhere/x.png` (not app-relative).
- `grep` for "sandbox"/"strip" in `mods/bot-herdr` — no sanitiser.
- No `bh ask` run; no edits under `mods/` or `test/`.
