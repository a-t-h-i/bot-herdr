// Mockups on question cards (step 3 for t-20261112-8jkz): the fences a question file may hold,
// what is kept and what is warned about, bh ask refusing and drawing, and the harness's own
// question tool's previews. Everything writes to a temp app home, never the user's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = mkdtempSync(join(tmpdir(), "bh-mq-"));
process.env.BH_APP_HOME = APP;
const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const lib = (name) => import(new URL(`../mods/bot-herdr/engine/${name}`, import.meta.url));
const questionsIn = (app) => join(app, "data", "bot-herdr", "questions");

/** bh with its own app home (a fresh temp one unless given), never a herdr terminal's. */
function bh(args, { app = APP, env = {} } = {}) {
  return spawnSync(process.execPath, [BH, ...args], {
    cwd: app, encoding: "utf8", env: { ...process.env, BH_APP_HOME: app, HC_TERMINAL_ID: "", BH_AGENT: "", BH_BROWSER: "", ...env },
  });
}

function questionFile(lines) {
  const dir = mkdtempSync(join(tmpdir(), "bh-mq-file-"));
  const file = join(dir, "questions.md");
  writeFileSync(file, lines.join("\n"));
  return file;
}

test("a mockup fence: backticks with an info string, tildes, indented and CRLF all keep their block", async () => {
  const { parseQuestions } = await lib("lib/ask.mjs");
  const md = [
    "Intro line",
    "1. [DESIGN] Which look?",
    "   - Warm (Recommended) — soft",
    "     ``` mockup",
    "     <style>p{color:red}</style><p>Warm</p>",
    "     ```",
    "   - Cool — blue",
    "     ~~~mockup",
    "     <p>Cool</p>",
    "     ~~~",
    "2. Which header?",
    "- Plain — meaning",
    "    ```html",
    "    <header>x</header>",
    "    ```  ",
  ].join("\r\n");
  const got = parseQuestions(md);
  assert.equal(got.intro, "Intro line");
  assert.deepEqual(got.warnings, []);
  assert.equal(got.questions.length, 2);
  const [warm, cool] = got.questions[0].options;
  assert.equal(warm.label, "Warm");
  assert.equal(warm.recommended, true);
  assert.equal(warm.mockup, "<style>p{color:red}</style><p>Warm</p>");
  assert.equal(cool.mockup, "<p>Cool</p>");
  assert.equal(got.questions[1].options[0].mockup, "<header>x</header>");
});

test("a mockup block in the wrong place is dropped, and the warning says where", async () => {
  const { parseQuestions } = await lib("lib/ask.mjs");
  const md = [
    "```mockup", "<p>early</p>", "```",
    "1. Layout?",
    "```mockup", "<p>under the question</p>", "```",
    "- A — a",
    "```mockup", "<p>one</p>", "```",
    "```mockup", "<p>two</p>", "```",
  ].join("\n");
  const got = parseQuestions(md);
  assert.deepEqual(got.warnings, [
    "Before the first question: a mockup block sits under the question, not under an option. Put it right under the option line it shows.",
    "Question 1: a mockup block sits under the question, not under an option. Put it right under the option line it shows.",
    'Question 1, option "A": two mockup blocks; only the first is kept.',
  ]);
  assert.equal(got.questions[0].options[0].mockup, "<p>one</p>");
});

test("a mockup block that is never closed is dropped with a warning and does not swallow the next question", async () => {
  const { parseQuestions } = await lib("lib/ask.mjs");
  const got = parseQuestions(["1. Layout?", "- A — a", "```mockup", "<p>x</p>", "2. Next?", "- B"].join("\n"));
  assert.equal(got.questions[0].options[0].mockup, null);
  assert.deepEqual(got.warnings, ['Question 1, option "A": a mockup block is never closed; end it with a line of ``` and nothing else. It is dropped.']);
});

test("scripts and link tags are taken out of a mockup; nothing else is rewritten", async () => {
  const { sanitizeMockup } = await lib("lib/ask.mjs");
  const html = '<link rel="stylesheet" href="https://x.test/a.css">\n<style>p{color:red}</style>\n<SCRIPT type="text/javascript">\nalert(1)\n</script >\n<p onclick="go()">a</p><Link\nhref="b.css">';
  assert.equal(sanitizeMockup(html), '\n<style>p{color:red}</style>\n\n<p onclick="go()">a</p>');
});

test("a question record writes its mockups without scripts or links", async () => {
  const Q = await lib("lib/ask.mjs");
  const rec = Q.ask({ from: "t0", questions: [{ seat: null, text: "x?", multi: false, options: [{ label: "A", meaning: "", recommended: false, mockup: '<link rel="stylesheet" href="a.css"><p>hi</p><script>x()</script>' }] }] });
  const html = readFileSync(rec.questions[0].options[0].mockupFile, "utf8");
  assert.match(html, /<p>hi<\/p>/);
  assert.doesNotMatch(html, /<script|<link/i);
});

test("every mockup is drawn, and one that won't draw does not stop the rest", async () => {
  const Q = await lib("lib/ask.mjs");
  const record = { questions: [
    { options: [{ label: "A", mockupFile: "/m/a.html" }, { label: "B", mockupFile: "/m/b.html" }] },
    { options: [{ label: "C" }, { label: "D", mockupFile: "/m/d.html" }] },
  ] };
  const got = Q.drawMockups(record, (file) => {
    if (file.endsWith("b.html")) return { error: "The browser didn't draw it." };
    if (file.endsWith("d.html")) throw new Error("boom");
    return { png: file, image: "x.png" };
  });
  assert.deepEqual(got.drawn, [{ question: 1, option: "A", image: "x.png" }]);
  assert.deepEqual(got.failed, [
    { question: 1, option: "B", error: "The browser didn't draw it." },
    { question: 2, option: "D", error: "boom" },
  ]);
});

test("a question tool's option preview is its mockup: HTML as it is, text as a preformatted block", async () => {
  const { fromAskTool } = await lib("lib/runner.mjs");
  const Q = await lib("lib/ask.mjs");
  const got = fromAskTool({ questions: [{ question: "Look?", header: "Look", multiSelect: false, options: [
    { label: "Dark", description: "d", preview: "Dark <theme> & more" },
    { label: "Light", description: "l", preview: '<div style="color:#fff">Light</div>' },
    { label: "None", description: "n" },
  ] }] });
  const [dark, light, none] = got.questions[0].options;
  assert.equal(dark.mockup, '<pre style="margin:24px;font:15px/1.5 Consolas,ui-monospace,monospace;white-space:pre-wrap">Dark &lt;theme&gt; &amp; more</pre>');
  assert.equal(light.mockup, '<div style="color:#fff">Light</div>');
  assert.equal(none.mockup, null);
  const rec = Q.ask({ from: "t0", questions: got.questions });
  assert.ok(existsSync(rec.questions[0].options[0].mockupFile), "the text preview is written like any mockup");
});

test("bh ask --file refuses a file with a misplaced block: nothing asked, exit 1, the warning says what to fix", () => {
  const app = mkdtempSync(join(tmpdir(), "bh-mq-refuse-"));
  const file = questionFile(["1. Layout?", "```mockup", "<p>x</p>", "```", "- A — a"]);
  const r = bh(["ask", "--file", file, "--title", "Test", "--as", "t0"], { app });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^Not asked: fix these in .* and run bh ask again:$/m);
  assert.match(r.stdout, /^Question 1: a mockup block sits under the question, not under an option\. Put it right under the option line it shows\.$/m);
  assert.equal(existsSync(questionsIn(app)), false, "nothing written to the questions folder");
});

test("bh ask --file refused with --json says asked: false and the warnings", () => {
  const app = mkdtempSync(join(tmpdir(), "bh-mq-json-"));
  const file = questionFile(["1. Layout?", "- A — a", "```mockup", "<p>x</p>", "```", "```mockup", "<p>y</p>", "```", "```mockup", "<p>z</p>", "```"]);
  const r = bh(["ask", "--file", file, "--json", "--as", "t0"], { app });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const got = JSON.parse(r.stdout);
  assert.equal(got.asked, false);
  assert.deepEqual(got.warnings, ['Question 1, option "A": two mockup blocks; only the first is kept.', 'Question 1, option "A": two mockup blocks; only the first is kept.']);
});

test("bh ask --file says how many mockups drew, and names each one that didn't with its reason", () => {
  const app = mkdtempSync(join(tmpdir(), "bh-mq-fail-"));
  // node stands in for a browser that can't draw: every mockup fails, and each failure is named.
  const file = questionFile(["1. Layout?", "- A — a", "```mockup", "<p>a</p>", "```", "- B — b", "```mockup", "<p>b</p>", "```", "2. Colour?", "- Red — r", "```html", "<p>c</p>", "```"]);
  const r = bh(["ask", "--file", file, "--title", "Test", "--as", "t0"], { app, env: { BH_BROWSER: process.execPath } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^Asked \(q-/m);
  assert.match(r.stdout, /^0 of 3 mockups drawn\.$/m);
  assert.match(r.stdout, /^Couldn't draw question 1, option "A": The browser didn't draw it: .*\. The card shows "Open in browser" for it\.$/m);
  assert.match(r.stdout, /^Couldn't draw question 2, option "Red": /m, "the rest are still tried");
  const got = JSON.parse(bh(["ask", "--file", file, "--json", "--as", "t0"], { app, env: { BH_BROWSER: process.execPath } }).stdout);
  assert.deepEqual(got.drawn, []);
  assert.deepEqual(got.failed.map((f) => [f.question, f.option]), [[1, "A"], [1, "B"], [2, "Red"]]);
});

const REAL = await lib("lib/media.mjs").then((m) => m.findBrowser());

test("bh ask --file draws both mockups in a real browser: 2 of 2 mockups drawn", { skip: !REAL && "no Chrome, Edge, Chromium or Brave here" }, () => {
  const app = mkdtempSync(join(tmpdir(), "bh-mq-real-"));
  const file = questionFile(["1. Layout?", "- Warm — soft", "```mockup", "<style>p{color:#c96442}</style><p>Warm</p>", "```", "- Cool — blue", "```mockup", "<p style=\"color:#2f6fed\">Cool</p>", "```", "2. Anything else?", "- Yes — more", "- No — less"]);
  const r = bh(["ask", "--file", file, "--title", "Test", "--as", "t0"], { app, env: { BH_BROWSER: REAL } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^2 of 2 mockups drawn\.$/m);
  const pngs = readdirSync(questionsIn(app)).filter((f) => f.endsWith(".png"));
  assert.equal(pngs.length, 2);
});
