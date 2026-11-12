Goal: scouting for task t-20261112-8jkz. The person: "find a way to render mockups on the questionnaire because agents have been struggling to do that on my other machine". Trace a mockup from an agent's questions file to the question card in the chat, and list every way it fails. Read-only on the code: edit no file under mods/ or test/.

Files to start from (repo at C:/Users/athenkosi.hlubi/Desktop/bot-herdr):
- mods/bot-herdr/engine/lib/ask.mjs (parseQuestions, ask: writes <id>-<q>-<o>.html)
- mods/bot-herdr/engine/lib/media.mjs (findBrowser, screenshotArgs, drawMockup, drawHtml, appPath)
- mods/bot-herdr/engine/bh.mjs (the `ask` and `mockup` commands)
- where the question card draws a mockup: grep mockupFile / mockup in chat.js, drawer.js, composer.js, lightbox.js, work.js
- engine/lib/runner.mjs: how a harness's own question tool (Claude Code AskUserQuestion, ACP) becomes a card, and whether option previews/mockups survive
- what agents are told: engine/roles/*.md, mods/bot-herdr/brief.js, engine/lib/team.mjs (grep mockup)
- test/ (grep mockup)
- mods/bot-herdr/gpui-kit.d.ts: what the mod can draw natively (img(), svg(), any HTML or markdown renderer)

Answer, each with path:line:
1. The exact path: questions.md, parse, files written, when and where the PNG is drawn (at `bh ask` time or when the card renders; engine or mod), how it is shown, and what the person sees while it draws and when it fails.
2. Every failure point: parser strictness (fence indentation, ```html vs ```mockup, ~~~ fences, a fence not directly under an option, CRLF, a fence on the question rather than an option), browser discovery (installs outside the paths searched, portable Chrome, Linux snap/flatpak, macOS), headless flags, the 45 s timeout, herdr image() path rules, and whether the asking agent is ever told a mockup failed.
3. Try it for real without touching the person's chat: in a node one-liner, import the repo copy of ask.mjs and media.mjs with BH_APP_HOME set to a fresh temp folder, parse a questions file with two mockups (one well formed, one with the fence indented under the option and CRLF line ends), then drawMockup each. Report what happens and how long it takes. Do NOT run `bh ask` (it would put a card in the person's chat).
4. Whether gpui can draw a mockup natively instead of a browser screenshot: can img() show an .svg file in full colour? Is there anything in gpui-kit.d.ts that would render a simple layout description? Check with herdr-app --skill or the d.ts only; say what you verified and what you could not.
5. Can Claude Code's AskUserQuestion carry a preview per option today, and does runner.mjs pass it through?

Report: the failure points ranked by how likely each one is the person's "struggle", then two or three ways to make mockups reliable, each with its trade-off in one line. Put the full report in .bot-herdr/tasks/t-20261112-8jkz/reports/scout-mock.md and send me a short summary.
