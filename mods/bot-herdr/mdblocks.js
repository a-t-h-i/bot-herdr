// Markdown as blocks, without drawing: a fence, a table, a list, a quote run, a heading line and
// a paragraph, split so that joining the blocks gives back the exact original text. Nothing is
// normalised: CRLF, a missing final newline and an unclosed fence all survive. Tested without
// herdr; mdedit.js draws the live editor.

/** A block's first line: what kind of markdown it is. */
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const TABLE = /^\s*\|/;
const HEADING = /^\s{0,3}#{1,6}\s/;
const QUOTE = /^\s*>/;
const LIST = /^\s*([-*+]|\d{1,9}[.)])\s+/;

/** The text's lines, each with the line ending it had (the last may have none). */
const linesOf = (text) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const withoutEol = (line) => line.replace(/\r?\n$/, "");
const blank = (line) => withoutEol(line).trim() === "";

/** A block's body without the blank lines that separate it from the next one. */
const BLANK_TAIL = /((?:[ \t]*\r?\n)+)$/;
function parts(text) {
  const m = BLANK_TAIL.exec(text);
  return m ? { body: text.slice(0, m.index), gap: m[1] } : { body: text, gap: "" };
}
const block = (type, text) => ({ type, text, ...parts(text) });

function kindOf(line) {
  if (FENCE.test(line)) return "code";
  if (TABLE.test(line)) return "table";
  if (HEADING.test(line)) return "heading";
  if (QUOTE.test(line)) return "quote";
  if (LIST.test(line)) return "list";
  return "paragraph";
}

/** The index one past the last line of the block that starts at `i`. */
function endOf(lines, i, type) {
  if (type === "heading") return i + 1;
  if (type === "code") {
    const mark = FENCE.exec(withoutEol(lines[i]))[1];
    const close = new RegExp(`^\\s{0,3}${mark[0] === "`" ? "`" : "~"}{${mark.length},}\\s*$`);
    for (let j = i + 1; j < lines.length; j++) if (close.test(withoutEol(lines[j]))) return j + 1;
    return lines.length; // an unclosed fence runs to the end
  }
  let j = i + 1;
  // A paragraph runs to a blank line; every other kind runs while its lines keep that kind.
  if (type === "paragraph") {
    while (j < lines.length && !blank(lines[j])) j++;
    return j;
  }
  while (j < lines.length && kindOf(withoutEol(lines[j])) === type) j++;
  return j;
}

/**
 * The text as blocks, each holding its own lines and the blank lines that follow it. A block is
 * `{ type, text, body, gap }`: `body` is what reads and is edited, `gap` the blank lines after it
 * and `text` the two joined. The first block carries the blank lines before it as `lead`.
 */
export function splitBlocks(text) {
  const src = String(text ?? "");
  const lines = linesOf(src);
  const out = [];
  let lead = "";
  let i = 0;
  while (i < lines.length && blank(lines[i])) lead += lines[i++];
  while (i < lines.length) {
    const start = i;
    const type = kindOf(withoutEol(lines[i]));
    i = endOf(lines, i, type);
    while (i < lines.length && blank(lines[i])) i++;
    out.push(block(type, lines.slice(start, i).join("")));
  }
  if (out.length) {
    if (lead) out[0].lead = lead;
  } else if (src) out.push({ ...block("blank", ""), lead: src }); // nothing but blank lines
  else out.push(block("paragraph", ""));
  return out;
}

/** Blocks back into their text. */
export function joinBlocks(blocks) {
  return (blocks ?? []).map((b) => `${b.lead ?? ""}${b.text ?? ""}`).join("");
}

/** The blocks with one block's body replaced: its text keeps the blank lines that followed it. */
export function withBody(blocks, i, value) {
  return blocks.map((b, j) => (j === i ? { ...b, body: value, text: value + b.gap } : b));
}
