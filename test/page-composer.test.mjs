// A plan or task comment written in a page's box keeps its attachments: their paths go with the text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { messageText } from "../mods/bot-herdr/route.js";

test("a page composer sends attached file paths with the comment, as the chat does", () => {
  const src = readFileSync(fileURLToPath(new URL("../mods/bot-herdr/work.js", import.meta.url)), "utf8");
  assert.match(src, /const text = messageText\(comp\.input\.value\(\)\.trim\(\), comp\.files\.map\(\(f\) => f\.path\)\);/);
  assert.equal(messageText("Like this", ["C:/p/mock.png"]), "Like this\nC:/p/mock.png");
  assert.equal(messageText("", ["C:/p/mock.png"]), "C:/p/mock.png");
});
