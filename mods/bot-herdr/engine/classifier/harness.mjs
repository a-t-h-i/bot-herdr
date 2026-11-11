// The classifier on a harness you have installed (Settings → Classifier → Model): the same small
// questions, asked of that harness's model in one non-interactive run with no tools, its JSON
// answer read back in the shape the System One API gives. Slower than the API (a CLI starts per
// call) but needs no key beyond the harness's own sign-in.

import { argvOf } from "../../roster.js";
import { launch, stop } from "../lib/runner.mjs";

/** Harnesses that can answer one prompt and exit, and how: prompt over stdin, answer on stdout. */
export const CLASSIFIER_HARNESSES = {
  claude: { args: (m) => [...(m ? ["--model", m] : []), "-p", "--output-format", "text", "--max-turns", "1"] },
  codex: { args: (m) => ["exec", "--skip-git-repo-check", "--sandbox", "read-only", ...(m ? ["-m", m] : []), "-"] },
  gemini: { args: (m) => [...(m ? ["-m", m] : []), "-p", "Answer the request above."] },
  qwen: { args: (m) => [...(m ? ["-m", m] : []), "-p", "Answer the request above."] },
};
export const canClassify = (key) => Object.hasOwn(CLASSIFIER_HARNESSES, key);

const ANSWER = {
  noul: '{"type":"noul","noul":<probability 0 to 1 that the answer is yes>}',
  choice: '{"type":"choice","choice":"<one key>","probabilities":{"<key>":<0 to 1>,...},"confidence":<0 to 1>}',
  score: '{"type":"score","score":<the level\'s number, counting from 0>,"confidence":<0 to 1>}',
};

/** The request as one prompt for a model. */
export function promptFor(request) {
  const qs = Object.entries(request.questions ?? {}).map(([key, q]) => {
    const lines = [`### ${key} (${q.type})`, q.instructions];
    if (q.type === "choice") for (const [k, v] of Object.entries(q.criteria ?? {})) lines.push(`- ${k}: ${v}`);
    if (q.type === "score") (q.criteria ?? []).forEach((v, i) => lines.push(`- ${i}: ${v}`));
    if (q.type === "noul" && q.criteria) {
      if (q.criteria.true) lines.push(`- yes: ${q.criteria.true}`);
      if (q.criteria.false) lines.push(`- no: ${q.criteria.false}`);
    }
    lines.push(`Answer as: ${ANSWER[q.type] ?? "{}"}`);
    return lines.join("\n");
  });
  return [
    "You are a fast classifier for a software team's tools. Don't use any tools and don't explain.",
    "Read the state, answer every question, and reply with only one JSON object whose keys are the question names.",
    "",
    "## State",
    "```json",
    JSON.stringify(request.state ?? {}, null, 1),
    "```",
    "",
    "## Questions",
    ...qs,
  ].join("\n");
}

const prob = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : undefined);

/** The model's reply as System One answers: every question it answered, each with its type. */
export function readAnswers(text, request) {
  const raw = String(text ?? "");
  const from = raw.indexOf("{");
  const to = raw.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  let got;
  try {
    got = JSON.parse(raw.slice(from, to + 1));
  } catch {
    return null;
  }
  const answers = {};
  for (const [key, q] of Object.entries(request.questions ?? {})) {
    const a = got?.[key];
    if (a === undefined || a === null) continue;
    if (q.type === "noul") {
      const p = typeof a === "boolean" ? Number(a) : prob(typeof a === "object" ? a.noul ?? a.probability : a);
      if (p !== undefined) answers[key] = { type: "noul", noul: p };
    } else if (q.type === "choice") {
      const choice = typeof a === "string" ? a : a.choice;
      if (typeof choice !== "string" || !(choice in (q.criteria ?? {}))) continue;
      const probabilities = typeof a === "object" && a.probabilities && typeof a.probabilities === "object" ? a.probabilities : { [choice]: 0.8 };
      answers[key] = { type: "choice", choice, probabilities, confidence: prob(a.confidence) ?? 0.8 };
    } else if (q.type === "score") {
      const score = typeof a === "number" ? a : Number(a.score);
      if (Number.isFinite(score)) answers[key] = { type: "score", score, confidence: prob(a.confidence) ?? 0.8 };
    }
  }
  return Object.keys(answers).length ? { model: "harness", answers } : null;
}

/** Runs the harness once with the prompt on stdin; its stdout, or throws. */
export function runOnce(argv, prompt, { timeoutMs = 60000, cwd = process.cwd() } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = launch(argv, { cwd });
    } catch (e) {
      reject(e);
      return;
    }
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (d) => {
      err = (err + d).slice(-2000);
    });
    const timer = setTimeout(() => {
      stop(child);
      reject(new Error(`timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || out.includes("{")) resolve(out);
      else reject(new Error(err.trim().split("\n").pop() || `exited with ${code}`));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

/** The command that asks a harness one question set. */
export function classifierArgv(harness, model, known) {
  const h = CLASSIFIER_HARNESSES[harness];
  if (!h) throw new Error(`${harness} can't run the classifier`);
  return [...argvOf({ harness, model: "", effort: "", args: "" }, known), ...h.args(model)];
}

export async function askHarness({ harness, model, known }, request, options = {}) {
  const text = await runOnce(classifierArgv(harness, model, known), promptFor(request), options);
  const got = readAnswers(text, request);
  if (!got) throw new Error("the model didn't answer in JSON");
  return got;
}
