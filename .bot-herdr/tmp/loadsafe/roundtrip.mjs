import { splitBlocks, joinBlocks, withBody } from "../../../mods/bot-herdr/mdblocks.js";
const cases = [
  "", "a", "a\n", "a\r\nb\r\n", "# h1\r\n\r\npara\r\n", "```js\r\nx\r\n```\r\n", "```\r\nunclosed\r\n",
  "| a | b |\r\n|---|---|\r\n| 1 | 2 |\r\n", "- one\r\n- two\r\n\r\n> q\r\n", "\r\n\r\nlead\r\n\r\nbody\r\n\r\n\r\n",
  "no final newline", "  \r\n \t\r\n", "para\r\nline2\r\n\r\npara2",
];
let bad = 0;
for (const t of cases) {
  const out = joinBlocks(splitBlocks(t));
  if (out !== t) { bad++; console.log("MISMATCH", JSON.stringify(t), "->", JSON.stringify(out)); }
}
// editing a block keeps the rest byte-identical
const t = "a\r\n\r\n```\r\ncode\r\n```\r\n\r\nb\r\n";
const blocks = splitBlocks(t);
const edited = joinBlocks(withBody(blocks, 1, "code\nmore\r\n"));
console.log("edit result:", JSON.stringify(edited));
console.log(bad ? `${bad} mismatches` : "all round trips exact");
