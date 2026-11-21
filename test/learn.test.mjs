// Learning: the project store, its candidates from answered questions/plans/knowledge, strict
// https links, the escaped standalone page, PDF fallback, and the installer's layout migration.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const tmp = mkdtempSync(join(tmpdir(), "bh-learn-"));
const APP = join(tmp, "app");
process.env.BH_APP_HOME = APP;

const BH = fileURLToPath(new URL("../mods/bot-herdr/engine/bh.mjs", import.meta.url));
const L = await import(new URL("../mods/bot-herdr/engine/lib/learn.mjs", import.meta.url));
const Q = await import(new URL("../mods/bot-herdr/engine/lib/ask.mjs", import.meta.url));
const { store } = await import(new URL("../mods/bot-herdr/engine/lib/core.mjs", import.meta.url));
const { ensureLearningPage } = await import(new URL("../install.mjs", import.meta.url));

const project = (name) => {
  const dir = join(tmp, name);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const env = { ...process.env, BH_APP_HOME: APP, HC_TERMINAL_ID: "", PATH: "", BH_BROWSER: "/nonexistent/bh-learn-browser" };
const run = (cwd, args) => {
  const r = spawnSync(process.execPath, [BH, ...args], { cwd, encoding: "utf8", env });
  return { code: r.status, out: r.stdout, err: r.stderr };
};

const runAsync = (cwd, args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [BH, ...args], { cwd, env });
  let out = "";
  let err = "";
  child.stdout.on("data", (data) => (out += data));
  child.stderr.on("data", (data) => (err += data));
  child.on("close", (code) => resolve({ code, out, err }));
});

const mdFile = (name, text) => {
  const file = join(tmp, name);
  writeFileSync(file, text);
  return file;
};

const LESSON = {
  slug: "idempotent-writes",
  title: "Idempotent writes",
  summary: "A retry must not write the same thing twice.",
  chapter: "decisions",
  whyRepo: "The user chose retry-safe writes for the API.",
  markdown: "# The idea\n\nA retry is safe when the same request twice is the same as once.\n\n- Keep an idempotency key\n- Store the first result\n\nSee [Idempotence](https://en.wikipedia.org/wiki/Idempotence) and `POST`.\n",
  sources: [{ kind: "question", ref: "q-1", label: "Retry safety" }],
  links: [{ title: "Idempotence", url: "https://en.wikipedia.org/wiki/Idempotence", note: "The general idea" }],
};

test("lessons: write, list, show, read, unread, delete, and a worktree writing the project's store", () => {
  const root = project("crud");
  const first = L.writeLesson(root, LESSON);
  assert.equal(first.ok, true);
  assert.equal(first.archived, null);
  assert.equal(first.lesson.read, false);
  assert.equal(first.lesson.readAt, null);
  assert.equal(first.lesson.readMins, 1);
  assert.equal(first.lesson.created, first.lesson.updated);
  assert.ok(existsSync(join(root, ".bot-herdr", "learn", "idempotent-writes.md")));

  const listed = L.listLessons(root);
  assert.deepEqual(listed.lessons.map((l) => l.slug), [LESSON.slug]);
  assert.equal(typeof listed.updated, "string");
  assert.equal(listed.candidatesCount, listed.candidates.length);
  assert.match(L.getLesson(root, LESSON.slug).markdown, /idempotency key/);
  assert.throws(() => L.getLesson(root, "no-such-lesson"), /No lesson no-such-lesson/);

  const worktree = join(root, ".bot-herdr", "worktrees", "feat");
  mkdirSync(worktree, { recursive: true });
  writeFileSync(join(worktree, ".git"), "gitdir: /elsewhere\n");
  const second = L.writeLesson(worktree, { ...LESSON, slug: "small-functions", chapter: "architecture" });
  assert.equal(second.ok, true);
  assert.ok(existsSync(join(root, ".bot-herdr", "learn", "small-functions.md")));
  assert.deepEqual(L.listLessons(worktree).lessons.map((l) => l.slug).sort(), ["idempotent-writes", "small-functions"]);

  const read = L.setLessonRead(root, LESSON.slug);
  assert.equal(read.read, true);
  assert.ok(read.readAt);
  assert.equal(L.getLesson(root, LESSON.slug).read, true);
  assert.equal(L.setLessonRead(root, LESSON.slug, false).readAt, null);

  assert.deepEqual(L.deleteLesson(root, LESSON.slug), { ok: true, slug: LESSON.slug });
  assert.equal(existsSync(join(root, ".bot-herdr", "learn", `${LESSON.slug}.md`)), false);
  assert.deepEqual(L.listLessons(root).lessons.map((l) => l.slug), ["small-functions"]);
  assert.ok(readdirSync(join(root, ".bot-herdr", "learn", "archive")).some((name) => name.startsWith(`${LESSON.slug}-`)));
});

test("overwriting a lesson archives the words before it and keeps read, readAt and created", () => {
  const root = project("archive");
  const saved = L.writeLesson(root, LESSON);
  const read = L.setLessonRead(root, LESSON.slug);
  const again = L.writeLesson(root, { ...LESSON, markdown: `${LESSON.markdown}\nOne more line.\n` });

  assert.equal(again.ok, true);
  assert.ok(again.archived);
  assert.match(basename(again.archived), /^idempotent-writes-\d{8}T\d+Z\.md$/);
  assert.equal(readFileSync(again.archived, "utf8").trim(), LESSON.markdown.trim());
  assert.equal(again.lesson.read, true);
  assert.equal(again.lesson.readAt, read.readAt);
  assert.equal(again.lesson.created, saved.lesson.created);
  assert.match(readFileSync(join(root, ".bot-herdr", "learn", `${LESSON.slug}.md`), "utf8"), /One more line/);

  const files = readdirSync(join(root, ".bot-herdr", "learn", "archive"));
  assert.equal(files.length, 1);
});

test("two writers at once keep both lessons: the index write holds withLock", async () => {
  const root = project("parallel");
  const pairs = [["alpha-lesson", "Alpha"], ["beta-lesson", "Beta"], ["gamma-lesson", "Gamma"]];
  const files = pairs.map(([slug, title]) => mdFile(`${slug}.md`, `# ${title}\n\nOne short guide.\n`));
  const writes = await Promise.all(pairs.map(([slug, title], i) => runAsync(root, [
    "learn", "write", slug, "--file", files[i], "--title", title, "--summary", `${title} summary`, "--json",
  ])));
  for (const write of writes) assert.equal(write.code, 0, write.err);
  assert.deepEqual(L.listLessons(root).lessons.map((l) => l.slug).sort(), pairs.map(([slug]) => slug).sort());
  assert.equal(JSON.parse(run(root, ["learn", "list", "--json"]).out).lessons.length, 3);
});

test("slugs are an allowlist: no traversal, no slashes, no uppercase, no empty", () => {
  const root = project("slugs");
  for (const slug of ["../etc", "a/b", "..", "UPPER", "dot.ted", "", "with space", "-leading"]) {
    assert.throws(() => L.validateSlug(slug), /Bad lesson slug/);
    assert.throws(() => L.writeLesson(root, { ...LESSON, slug }), /Bad lesson slug/);
  }
  assert.equal(L.validateSlug("ok-slug-1"), "ok-slug-1");
  assert.throws(() => L.getLesson(root, "../etc"), /Bad lesson slug/);
  assert.throws(() => L.deleteLesson(root, "a/b"), /Bad lesson slug/);

  const cli = run(root, ["learn", "write", "../etc", "--file", mdFile("bad.md", "x"), "--title", "Bad", "--summary", "Bad"]);
  assert.equal(cli.code, 1);
  assert.match(cli.err, /Bad lesson slug/);
});

test("only https:// links are saved, in the links list and in the markdown body", () => {
  const root = project("links");
  assert.equal(L.isSafeHttpsUrl("https://en.wikipedia.org/wiki/Idempotence"), true);
  assert.equal(L.isSafeHttpsUrl("https://example.com/a?b=c"), true);
  for (const url of ["http://example.com", "javascript:alert(1)", "JavaScript:alert(1)", "file:///etc/passwd", "data:text/html,<b>x</b>", "vbscript:msgbox(1)", "", "https://", "https://exa mple.com", "ftp://example.com"]) {
    assert.equal(L.isSafeHttpsUrl(url), false, url);
    assert.throws(() => L.writeLesson(root, { ...LESSON, links: [{ title: "Bad", url }] }), /https:\/\//, url);
  }
  for (const body of ["[run](javascript:alert(1))", "[run](DATA:text/html,x)", "[run](vbscript:msgbox)", "[run](file:///etc/passwd)", "[run](JaVaScRiPt:alert(1))"]) {
    assert.throws(() => L.writeLesson(root, { ...LESSON, markdown: body }), /only https:\/\/ links/, body);
  }
  assert.throws(() => L.writeLesson(root, { ...LESSON, links: [{ title: "", url: "https://example.com" }] }), /title/);
  const nine = Array.from({ length: 9 }, (_, i) => ({ title: `Link ${i}`, url: `https://example.com/${i}` }));
  assert.throws(() => L.writeLesson(root, { ...LESSON, links: nine }), /At most 8 links/);

  assert.equal(L.writeLesson(root, { ...LESSON, markdown: "See [MDN](https://developer.mozilla.org/docs/Web/HTTP)." }).ok, true);
  assert.equal(L.getLesson(root, LESSON.slug).links[0].url, "https://en.wikipedia.org/wiki/Idempotence");
});

test("the body cap and read minutes", () => {
  const root = project("caps");
  assert.throws(() => L.writeLesson(root, { ...LESSON, markdown: "x".repeat(L.MAX_BODY_CHARS + 1) }), /6000/);
  assert.equal(L.writeLesson(root, { ...LESSON, markdown: "x".repeat(L.MAX_BODY_CHARS) }).ok, true);

  const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
  assert.equal(L.writeLesson(root, { ...LESSON, slug: "two-minutes", markdown: words }).lesson.readMins, 2);
  assert.equal(L.writeLesson(root, { ...LESSON, slug: "given", markdown: words, readMins: 7 }).lesson.readMins, 7);
});

test("answered questions are canonicalized to the project, worktrees included, and never leak another project", () => {
  const root = project("answered");
  const other = project("other-project");
  const worktree = join(root, ".bot-herdr", "worktrees", "feat");
  const answers = join(APP, "data", "bot-herdr", "questions", "answered");
  mkdirSync(answers, { recursive: true });
  const record = (id, cwd, at) => writeFileSync(join(answers, `${id}.json`), JSON.stringify({
    id, title: `Ask ${id}`, cwd, status: "answered",
    questions: [{ text: `Question ${id}?`, options: [{ label: "Idempotency keys" }] }],
    answers: [{ picks: ["Idempotency keys"] }], created: at, answered: at,
  }));
  record("q-a", root, "2026-01-01T00:00:00.000Z");
  record("q-b", worktree, "2026-01-02T00:00:00.000Z");
  record("q-c", other, "2026-01-03T00:00:00.000Z");
  writeFileSync(join(answers, "q-no-cwd.json"), JSON.stringify({ id: "q-no-cwd", status: "answered", created: "2026-01-04T00:00:00.000Z" }));

  assert.deepEqual(Q.answeredForProject(root).map((q) => q.id), ["q-a", "q-b"]);
  assert.deepEqual(Q.answeredForProject(worktree).map((q) => q.id), ["q-a", "q-b"]);
  assert.deepEqual(Q.answeredForProject(other).map((q) => q.id), ["q-c"]);
  assert.equal(Q.canonicalProjectDir(join(root, ".bot-herdr", "worktrees", "feat")), Q.canonicalProjectDir(root));
  assert.equal(Q.canonicalProjectDir(join(root, ".bot-herdr", "worktrees", "feat", "src")), Q.canonicalProjectDir(root));
  assert.equal(Q.canonicalProjectDir(`${root}/`), Q.canonicalProjectDir(root));
  const windowsPath = root.replace(/\//g, "\\");
  assert.equal(Q.canonicalProjectDir(`${windowsPath}\\.bot-herdr\\worktrees\\feat`), Q.canonicalProjectDir(windowsPath));
});

test("bh learn candidates: this project's questions, plan decisions and knowledge decisions only", () => {
  const root = project("candidates");
  const other = project("candidates-other");
  const answers = join(APP, "data", "bot-herdr", "questions", "answered");
  mkdirSync(answers, { recursive: true });
  writeFileSync(join(answers, "q-here.json"), JSON.stringify({
    id: "q-here", title: "Retry safety", cwd: root, status: "answered",
    questions: [{ text: "How should retries work?" }], answers: [{ picks: ["Idempotency keys"] }],
    created: "2026-01-01T00:00:00.000Z", answered: "2026-01-02T00:00:00.000Z",
  }));
  writeFileSync(join(answers, "q-elsewhere.json"), JSON.stringify({
    id: "q-elsewhere", title: "Other project", cwd: other, status: "answered",
    questions: [{ text: "Elsewhere?" }], answers: [{ picks: ["Something"] }],
    created: "2026-01-01T00:00:00.000Z", answered: "2026-01-02T00:00:00.000Z",
  }));
  mkdirSync(store(root, "plans", "p-1"), { recursive: true });
  writeFileSync(store(root, "plans", "p-1", "plan.json"), JSON.stringify({ id: "p-1", title: "Retry plan", status: "ready", created: "2026-01-01T00:00:00.000Z", updated: "2026-01-05T00:00:00.000Z" }));
  writeFileSync(store(root, "plans", "p-1", "plan.md"), "## Plan\n\n### Decisions by domain\n- **[DEV]** **Retries**: writes take an idempotency key.\n- **[QA]** Test the second write.\n\n### Risks\n- none\n");
  mkdirSync(store(root, "knowledge"), { recursive: true });
  writeFileSync(store(root, "knowledge", "dev.md"), "# dev\n\n## Facts\n- The API stores idempotency keys.\n\n## Decisions\n- Retry-safe writes.\n\n## History\n- Old work.\n");

  const listed = JSON.parse(run(root, ["learn", "candidates", "--json"]).out);
  assert.deepEqual(listed.candidates.map((c) => c.ref).sort(), ["knowledge/dev.md", "p-1", "q-here"]);
  assert.equal(listed.total, 3);
  assert.ok(listed.candidates.every((c) => c.covered === false));
  const question = listed.candidates.find((c) => c.kind === "question");
  assert.equal(question.label, "Retry safety");
  assert.match(question.summary, /Idempotency keys/);
  const knowledge = listed.candidates.find((c) => c.kind === "knowledge");
  assert.match(knowledge.summary, /API stores idempotency keys/);
  assert.match(knowledge.summary, /Retry-safe writes/);
  assert.doesNotMatch(knowledge.summary, /Old work/);

  L.writeLesson(root, { ...LESSON, sources: [{ kind: "question", ref: "q-here", label: "Retry safety" }, { kind: "plan", ref: "p-1", label: "Retry plan" }] });
  const uncovered = JSON.parse(run(root, ["learn", "candidates", "--json"]).out);
  assert.deepEqual(uncovered.candidates.map((c) => c.ref), ["knowledge/dev.md"]);
  assert.equal(uncovered.total, 3);
  const all = JSON.parse(run(root, ["learn", "candidates", "--all", "--json"]).out);
  assert.equal(all.total, 3);
  assert.deepEqual(all.candidates.filter((c) => c.covered).map((c) => c.ref).sort(), ["p-1", "q-here"]);
});

test("a lesson is stale when a source it names changed after it was written", async () => {
  const root = project("stale");
  mkdirSync(store(root, "knowledge"), { recursive: true });
  const file = store(root, "knowledge", "dev.md");
  writeFileSync(file, "# dev\n\n## Facts\n- One fact.\n");
  const sources = [{ kind: "knowledge", ref: "knowledge/dev.md", label: "dev.md" }];
  L.writeLesson(root, { ...LESSON, sources });
  assert.deepEqual(L.listLessons(root).lessons.map((l) => l.stale), [false]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFileSync(file, "# dev\n\n## Facts\n- A newer fact.\n");
  assert.deepEqual(L.listLessons(root).lessons.map((l) => l.stale), [true]);
});

test("the standalone page escapes every untrusted field and keeps only safe https links", () => {
  const html = L.renderLessonHtml({
    slug: "xss",
    title: "<script>alert(1)</script>",
    summary: '<img src=x onerror="alert(2)">',
    chapter: "architecture",
    whyRepo: '<iframe src="https://evil.example"></iframe>',
    sources: [{ kind: "plan", ref: "p-1", label: "<object data=x></object>" }],
    links: [
      { title: "<embed src=x>", url: "javascript:alert(3)", note: "<b onclick=alert(4)>" },
      { title: "MDN", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP", note: "The docs" },
    ],
    readMins: 2,
  }, "# Heading\n\n- **bold** and `code`\n\n[bad](javascript:alert(5)) and [good](https://example.com/a)\n\n<img src=x onerror=alert(6)>\n");

  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">/);
  assert.match(html, /@media print/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;iframe/);
  assert.match(html, /&lt;object/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<iframe/i);
  assert.doesNotMatch(html, /<object/i);
  assert.doesNotMatch(html, /<embed/i);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /javascript:alert\(5\)/);
  assert.match(html, /href="https:\/\/example\.com\/a" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /href="https:\/\/developer\.mozilla\.org\/en-US\/docs\/Web\/HTTP" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /Why this matters in this repo/);
  assert.match(html, /Explore further/);
  assert.doesNotMatch(html, /<embed src=x>/);
});

test("html export writes the page; PDF without a browser is a clear fallback, and --json exits 0", () => {
  const root = project("export");
  L.writeLesson(root, LESSON);
  const html = L.exportLessonHtml(root, LESSON.slug);
  assert.equal(html.ok, true);
  assert.ok(existsSync(html.path));
  assert.match(readFileSync(html.path, "utf8"), /Explore further/);

  const pdf = L.exportLessonPdf(root, LESSON.slug, { findBrowserFn: () => null });
  assert.equal(pdf.ok, false);
  assert.match(pdf.error, /No Chrome, Edge, Chromium or Brave found to export PDF/);

  const cliHtml = JSON.parse(run(root, ["learn", "html", LESSON.slug, "--json"]).out);
  assert.equal(cliHtml.ok, true);
  assert.ok(existsSync(cliHtml.path));

  const cliPdf = run(root, ["learn", "pdf", LESSON.slug, "--json"]);
  assert.equal(cliPdf.code, 0, cliPdf.err);
  const missing = JSON.parse(cliPdf.out);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /No Chrome/);

  const noLesson = run(root, ["learn", "pdf", "no-such-lesson", "--json"]);
  assert.equal(noLesson.code, 0);
  assert.equal(JSON.parse(noLesson.out).ok, false);

  const sentence = run(root, ["learn", "pdf", LESSON.slug]);
  assert.equal(sentence.code, 1);
  assert.match(sentence.err, /No Chrome/);
});

test("bh learn CLI: write, list, show, read, unread, html and delete on a temp repo", () => {
  const root = project("cli");
  const file = mdFile("cli-lesson.md", LESSON.markdown);
  const write = run(root, ["learn", "write", LESSON.slug, "--file", file, "--title", LESSON.title, "--summary", LESSON.summary, "--chapter", "decisions", "--why", LESSON.whyRepo, "--read-mins", "3", "--source", "question:q-1:Retry safety", "--links", JSON.stringify(LESSON.links), "--json"]);
  assert.equal(write.code, 0, write.err);
  const saved = JSON.parse(write.out);
  assert.equal(saved.ok, true);
  assert.equal(saved.lesson.chapter, "decisions");
  assert.equal(saved.lesson.readMins, 3);
  assert.deepEqual(saved.lesson.sources, [{ kind: "question", ref: "q-1", label: "Retry safety" }]);
  assert.equal(saved.lesson.links[0].url, "https://en.wikipedia.org/wiki/Idempotence");

  const listed = JSON.parse(run(root, ["learn", "list", "--json"]).out);
  assert.equal(listed.lessons.length, 1);
  assert.equal(listed.lessons[0].read, false);
  assert.equal(listed.lessons[0].whyRepo, LESSON.whyRepo);
  assert.equal(typeof listed.candidatesCount, "number");
  assert.match(run(root, ["learn", "list"]).out, /Idempotent writes/);

  assert.match(JSON.parse(run(root, ["learn", "show", LESSON.slug, "--json"]).out).markdown, /idempotency key/);
  const read = JSON.parse(run(root, ["learn", "read", LESSON.slug, "--json"]).out);
  assert.equal(read.read, true);
  assert.ok(read.readAt);
  const unread = JSON.parse(run(root, ["learn", "read", LESSON.slug, "--unread", "--json"]).out);
  assert.deepEqual([unread.read, unread.readAt], [false, null]);

  const html = JSON.parse(run(root, ["learn", "html", LESSON.slug, "--json"]).out);
  assert.equal(html.ok, true);
  assert.ok(existsSync(html.path));

  assert.deepEqual(JSON.parse(run(root, ["learn", "delete", LESSON.slug, "--json"]).out), { ok: true, slug: LESSON.slug });
  assert.deepEqual(L.listLessons(root).lessons, []);
});

test("the installer adds Learning right after Knowledge, is idempotent, and widens the switch to 760", () => {
  const layout = () => ({
    id: "root",
    children: [
      { id: "switch", size: { px: 680 } },
      {
        id: "pages",
        type: "column",
        children: [
          { id: "chat", type: "block" },
          { id: "tasks", type: "block" },
          { id: "plans", type: "block" },
          { id: "issues", type: "block" },
          { id: "knowledge", type: "block" },
          { id: "metrics", type: "block" },
        ],
      },
    ],
  });
  const ids = (root) => root.children[1].children.map((c) => c.id);

  const existing = layout();
  assert.equal(ensureLearningPage(existing), true);
  assert.equal(existing.children[0].size.px, 760);
  assert.deepEqual(ids(existing), ["chat", "tasks", "plans", "issues", "knowledge", "learning", "metrics"]);
  assert.deepEqual(existing.children[1].children[5], { id: "learning", type: "block", content: { mod: "bot-herdr", props: { view: "learning" } } });
  assert.equal(ensureLearningPage(existing), false);
  assert.deepEqual(ids(existing), ["chat", "tasks", "plans", "issues", "knowledge", "learning", "metrics"]);

  const oldDefault = layout();
  oldDefault.children[0].size.px = 600;
  oldDefault.children[1].children.splice(5, 0, { id: "learning", type: "block" });
  assert.equal(ensureLearningPage(oldDefault), true);
  assert.equal(oldDefault.children[0].size.px, 760);

  const custom = layout();
  custom.children[0].size.px = 800;
  custom.children[1].children.splice(5, 0, { id: "learning", type: "block" });
  assert.equal(ensureLearningPage(custom), false);
  assert.equal(custom.children[0].size.px, 800);

  const noKnowledge = { id: "root", children: [{ id: "switch", size: { px: 680 } }, { id: "pages", children: [{ id: "chat" }] }] };
  assert.equal(ensureLearningPage(noKnowledge), true);
  assert.deepEqual(noKnowledge.children[1].children.map((c) => c.id), ["chat", "learning"]);

  assert.equal(ensureLearningPage({ id: "root", children: [] }), false);
});
