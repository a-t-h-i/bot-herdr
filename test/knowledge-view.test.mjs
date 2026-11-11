// The Knowledge page: the file by section, notes on entries, taking a note back.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outline, notesOn, entryKey } from "../mods/bot-herdr/doc.js";

test("knowledge: sections with their entries, the title apart", () => {
  const o = outline("# dev: what I know\n\n## Facts\n- Uses **pnpm**\n- API in `src/api`\n  wrapped\n\n## Standards\n\n## Decisions\n- Postgres\n");
  assert.equal(o.title, "dev: what I know");
  assert.deepEqual(o.sections.map((s) => [s.name, s.entries.length]), [["Facts", 2], ["Standards", 0], ["Decisions", 1]]);
  assert.equal(o.sections[0].entries[1].text, "- API in `src/api`\n  wrapped");
  assert.equal(o.sections[0].entries[1].key, "API in `src/api`");
  assert.equal(entryKey("### A heading"), "A heading");
  assert.deepEqual(outline("Loose text\n").sections[0].name, null);
  assert.equal(notesOn([{ entry: "Uses **pnpm**" }, { entry: "other" }], o.sections[0].entries[0].text).length, 1);
});

test("knowledge: a note can be taken back", async () => {
  process.env.BH_APP_HOME = mkdtempSync(join(tmpdir(), "bh-kv-"));
  const K = await import("../mods/bot-herdr/engine/lib/knowledge.mjs");
  const root = mkdtempSync(join(tmpdir(), "bh-kv-p-"));
  const n = K.note(root, "dev", "Uses pnpm", "and turbo");
  assert.equal(K.notes(root, "dev").length, 1);
  assert.equal(K.unnote(root, "dev", n.at), true);
  assert.equal(K.notes(root, "dev").length, 0);
  assert.equal(K.unnote(root, "dev", n.at), false);
});
