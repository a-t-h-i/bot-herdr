// Machine text's rules, without drawing: what counts as machine output (JSON, a stack trace, a
// path, a branch name), how a long line folds in the middle, and how a markdown body splits into
// prose and fenced code. Pure, so `npm test` checks it; machinetext.js draws it.

/** How much of a folded line is shown before its middle gives way to an ellipsis. */
export const FOLDED = 96;

/** What kind of machine text a value is, or null when it is prose: "json", "stack", "branch", "path". */
export function machineKind(value, { branch = false } = {}) {
  const text = String(value ?? "").trim();
  if (branch) return text ? "branch" : null;
  if (text.length < 24) return null;
  if (/^[[{]/.test(text) || /"\w[\w-]*"\s*:/.test(text)) return "json";
  if (/\n\s+at [\w.$<>]+ \(/.test(text) || /^\s*(?:TypeError|ReferenceError|SyntaxError|Error):/m.test(text)) return "stack";
  if (/^[a-z0-9][a-z0-9._/-]{23,}$/i.test(text) && /[/_.-]/.test(text)) return "path";
  return null;
}

/** One line: whitespace flattened, and when it is longer than `max` its middle replaced by an ellipsis. */
export function middleTruncate(value, max = FOLDED) {
  const flat = String(value ?? "").replace(/\s+/g, " ").trim();
  const room = Math.max(5, max);
  if (flat.length <= room) return flat;
  const tail = Math.floor((room - 1) / 2);
  const head = room - 1 - tail;
  return `${flat.slice(0, head)}…${flat.slice(flat.length - tail)}`;
}

/**
 * A markdown body split into the prose the markdown renderer draws and the fenced code it must
 * not draw at body size: [{ kind: "prose" | "code", text, lang }]. An unclosed fence runs to the end.
 */
export function splitFences(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const parts = [];
  let prose = [];
  let code = null;
  const flushProse = () => {
    const text = prose.join("\n").trim();
    if (text) parts.push({ kind: "prose", text, lang: null });
    prose = [];
  };
  for (const line of lines) {
    const fence = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(line);
    if (code) {
      if (fence && fence[1][0] === code.marker && fence[1].length >= code.length) {
        const text = code.lines.join("\n").trim();
        if (text) parts.push({ kind: "code", text, lang: code.lang || null });
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }
    if (fence) {
      flushProse();
      code = { marker: fence[1][0], length: fence[1].length, lang: fence[2] ?? "", lines: [] };
    } else {
      prose.push(line);
    }
  }
  if (code) {
    const text = code.lines.join("\n").trim();
    if (text) parts.push({ kind: "code", text, lang: code.lang || null });
  } else {
    flushProse();
  }
  return parts;
}

/** The text as a markdown code block, fenced wider than any backtick run inside it. */
export function fenced(text, lang = "") {
  const body = String(text ?? "").replace(/\s+$/, "");
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${body}\n${fence}`;
}
