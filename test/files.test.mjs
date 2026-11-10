// Files named in messages become links that open them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { linkFiles, fileTarget, isPath, FILE_LINK } from "../mods/bot-herdr/feed.js";

test("files in a reply become links; code blocks, commands and web addresses don't", () => {
  const out = linkFiles("Edit `src/app.tsx:12`, see docs/a.md. Run `npm test`. https://x.com/a.js\n```\nsrc/b.ts\n```\n[x](y/z.md)");
  assert.match(out, /\[`src\/app\.tsx:12`\]\(bh-file:src%2Fapp\.tsx%3A12\)/);
  assert.match(out, /\[docs\/a\.md\]\(bh-file:docs%2Fa\.md\)\./);
  assert.match(out, /`npm test`/);
  assert.doesNotMatch(out, /bh-file:https/);
  assert.match(out, /```\nsrc\/b\.ts\n```/);
  assert.match(out, /\[x\]\(y\/z\.md\)/);
  assert.deepEqual(fileTarget(`${FILE_LINK}${encodeURIComponent("src/a.ts:12:3")}`), { path: "src/a.ts", line: 12 });
  assert.equal(isPath("C:\\Users\\a\\b.txt"), true);
  assert.equal(isPath("README.md"), true);
  assert.equal(isPath("v1.2"), false);
});
