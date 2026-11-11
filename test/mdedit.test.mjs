// The live markdown editor's blocks: every text comes back exactly as it went in, and an edit to
// one block leaves the others alone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBlocks, joinBlocks, withBody } from "../mods/bot-herdr/mdblocks.js";

const round = (text) => joinBlocks(splitBlocks(text));
const kinds = (text) => splitBlocks(text).map((b) => b.type);

const DOC = [
  "# A title",
  "",
  "A paragraph that",
  "runs two lines.",
  "",
  "- one",
  "- two",
  "  - nested",
  "- three",
  "",
  "> a quote",
  "> and its second line",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```js",
  "const a = 1;",
  "",
  "const b = 2;",
  "```",
  "",
  "## After",
  "The end.",
].join("\n");

test("every text round-trips exactly, endings and trailing blanks included", () => {
  const texts = [
    DOC,
    DOC.replace(/\n/g, "\r\n"),
    DOC.replace(/\n$/, ""), // no trailing newline
    "\n\n# lead blanks\n",
    "just one line",
    "no newline at the end",
    "```\nunclosed fence\nstill inside\n".replace(/\n$/, ""),
    "",
    "\n",
    "\n\n\n",
    "| only | a table |\n",
  ];
  for (const text of texts) assert.equal(round(text), text);
});

test("a heading, list, nested list, quote, table and fence are their own kinds", () => {
  assert.deepEqual(kinds(DOC), ["heading", "paragraph", "list", "quote", "table", "code", "heading", "paragraph"]);
  assert.deepEqual(kinds("---\nnot a fence\n"), ["paragraph"]); // a rule and a line are one paragraph
  assert.deepEqual(kinds("```\ncode\n\nmore\n```\n"), ["code"]); // blank lines stay inside the fence
  assert.deepEqual(kinds("text\n## no blank line\n"), ["paragraph"]); // a paragraph runs to the blank line
});

test("a blank line ends a block and is kept for the join", () => {
  const blocks = splitBlocks("# Title\n\nOne.\n\nTwo.\n");
  assert.deepEqual(blocks.map((b) => [b.type, b.body]), [["heading", "# Title"], ["paragraph", "One."], ["paragraph", "Two."]]);
  assert.deepEqual(blocks.map((b) => b.gap), ["\n\n", "\n\n", "\n"]);
  assert.equal(blocks[0].lead, undefined);
  assert.equal(round("# Title\n\nOne.\n\nTwo.\n"), "# Title\n\nOne.\n\nTwo.\n");
});

test("CRLF: every block keeps the endings it had", () => {
  const blocks = splitBlocks("# T\r\n\r\nOne.\r\n");
  assert.equal(blocks[0].body, "# T");
  assert.equal(blocks[0].gap, "\r\n\r\n");
  assert.equal(round("# T\r\n\r\nOne.\r\n"), "# T\r\n\r\nOne.\r\n");
});

test("an unclosed fence is one block to the end", () => {
  const blocks = splitBlocks("```\nconst a = 1;\n\nconst b = 2;\n");
  assert.deepEqual(blocks.map((b) => b.type), ["code"]);
  assert.equal(blocks[0].body, "```\nconst a = 1;\n\nconst b = 2;");
  assert.equal(blocks[0].gap, "\n");
});

test("editing one block's body changes only that block's text", () => {
  const blocks = splitBlocks(DOC);
  const next = withBody(blocks, 1, "A rewritten paragraph.");
  assert.equal(next[1].text, "A rewritten paragraph.\n\n");
  for (let i = 0; i < blocks.length; i++) if (i !== 1) assert.equal(next[i], blocks[i]);
  assert.equal(joinBlocks(next), DOC.replace("A paragraph that\nruns two lines.", "A rewritten paragraph."));
});

test("an all-blank document keeps its text and has a block to type into", () => {
  const blocks = splitBlocks("\n\n");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].body, "");
  assert.equal(joinBlocks(blocks), "\n\n");
  assert.deepEqual(splitBlocks(""), [{ type: "paragraph", text: "", body: "", gap: "" }]);
});
