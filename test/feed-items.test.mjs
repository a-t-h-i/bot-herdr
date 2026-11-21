// The chat's feed is built once a frame, not once per reply: who is a child is worked out from one
// pass of the roster, and the same items come back while the feed and the running agents hold.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MODS = fileURLToPath(new URL("../mods/bot-herdr", import.meta.url));

// chat.js imports gpui and herdr, which only herdr's runtime has. They become callable stubs so the
// page loads here and its feed logic runs as in the app; their names come from the sources, so an
// import added later needs nothing added below.
const HOOK = `
import { readdirSync, readFileSync } from "node:fs";
const MODS = ${JSON.stringify(MODS)};
const BARE = ["gpui-kit", "gpui-base", "herdr", "fs/promises"];
const names = new Map(BARE.map((s) => [s, new Set()]));
for (const f of readdirSync(MODS)) {
  if (!f.endsWith(".js")) continue;
  const src = readFileSync(MODS + "/" + f, "utf8");
  for (const m of src.matchAll(/import\\s+\\{([\\s\\S]*?)\\}\\s*from\\s*["']([^"']+)["']/g)) {
    if (!names.has(m[2])) continue;
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\\s+as\\s+/)[0].trim();
      if (name) names.get(m[2]).add(name);
    }
  }
}
const ANY = "const any = (v) => new Proxy(function () {}, { get: (t, k) => (k === 'then' || typeof k === 'symbol') ? undefined : v, apply: () => v, construct: () => v });";
const FS = 'export * from "node:fs/promises"; export const exists = async () => false;';
export async function resolve(spec, ctx, next) {
  return names.has(spec) ? { url: "stub:" + spec, shortCircuit: true } : next(spec, ctx);
}
export async function load(url, ctx, next) {
  if (!url.startsWith("stub:")) return next(url, ctx);
  const spec = url.slice(5);
  if (spec === "fs/promises") return { format: "module", source: FS, shortCircuit: true };
  const list = [...names.get(spec)].map((n) => "v as " + n).join(", ");
  return { format: "module", source: ANY + "\\nconst v = any(function () {});\\nexport { " + list + " };", shortCircuit: true };
}
`;
register(`data:text/javascript,${encodeURIComponent(HOOK)}`);
const { Chat } = await import("../mods/bot-herdr/chat.js");

/** A composer stub: the map of running addresses, counting every lookup it is asked for. */
const stub = (byAddress) => ({
  byAddress,
  lookups: 0,
  entriesByAddress() {
    this.lookups += 1;
    return this.byAddress;
  },
  entryAt(address) {
    this.lookups += 1;
    return this.byAddress.get(address) ?? null;
  },
});

/** A page with a feed and that composer; `composer.lookups` counts the roster work it caused. */
const page = (entries, composer) => Object.assign(Object.create(Chat.prototype), { entries, composer, feedCache: null });

const entry = (id, name, address = `a-${name}`) => ({ id, at: 0, space: "s1", kind: "agent", text: id, from: { address, name } });

test("300 replies ask who runs where once, not once each", () => {
  const names = ["Orchestrator", "Dev", "QA"];
  const entries = Array.from({ length: 300 }, (_, i) => entry(`e${i}`, names[i % 3]));
  const byAddress = new Map([["a-Orchestrator", { name: "Orchestrator", lead: true }], ["a-Dev", { name: "Dev" }], ["a-QA", { name: "QA" }]]);
  const chat = page(entries, stub(byAddress));
  chat.items("s1");
  assert.equal(chat.composer.lookups, 1);
});

test("a lead's reply stands alone, a child's folds, and an agent with no roster entry goes by its name", () => {
  const byAddress = new Map([["lead", { name: "Orchestrator", lead: true }], ["dev", { name: "Dev" }]]);
  const chat = page([entry("l", "Orchestrator", "lead"), entry("d", "Dev", "dev"), entry("u", "Orchestrator", "gone"), entry("x", "Dev", "gone2")], stub(byAddress));
  const out = chat.items("s1");
  assert.deepEqual(out.map((e) => e.kind), ["agent", "kids", "agent", "kids"]);
  assert.deepEqual(out.map((e) => e.id), ["l", "kids-d", "u", "kids-x"]);
  assert.deepEqual(out[1].children.map((e) => e.id), ["d"]);
  assert.deepEqual(out[3].children.map((e) => e.id), ["x"]);
});

test("the feed comes back once, and is built again when a reply arrives", () => {
  const chat = page([entry("d1", "Dev", "dev")], stub(new Map([["dev", { name: "Dev" }]])));
  const first = chat.items("s1");
  assert.equal(chat.items("s1"), first);
  assert.equal(first[0].children.length, 1);
  chat.entries = [...chat.entries, entry("d2", "Dev", "dev")];
  const next = chat.items("s1");
  assert.notEqual(next, first);
  assert.deepEqual(next[0].children.map((e) => e.id), ["d1", "d2"]);
});

test("Chat.page is not shadowed and kids height cache invalidates when a child reply appends", () => {
  const chat = Object.assign(Object.create(Chat.prototype), {
    entries: [entry("d1", "Dev", "dev")],
    composer: stub(new Map([["dev", { name: "Dev" }]])),
    feedCache: null,
    heights: new Map([["kids-d1:1", 96]]),
    back: 0,
    px: 0,
    room: 400,
    lastPage: "chat",
    space: () => "s1",
  });
  assert.equal(typeof chat.page, "function");
  assert.deepEqual(chat.feedHeights("s1"), [96]);
  chat.entries = [...chat.entries, entry("d2", "Dev", "dev")];
  assert.deepEqual(chat.feedHeights("s1"), [undefined]);
});

test("Chat.addLogged clears remote/quiet waits by fileKey, skips kind: asked, and preserves line.space", () => {
  const added = [];
  const chat = Object.assign(Object.create(Chat.prototype), {
    waits: { "host/t4w": { name: "Design", space: "s-wait", at: Date.now() } },
    seen: {},
    seenAt: {},
    composer: { nameOf: () => "Design" },
    space: () => "s-active",
    add(item) {
      added.push(item);
    },
  });
  chat.addLogged("host_t4w", { id: "q1", at: "2026-11-21T10:00:00.000Z", kind: "asked", name: "Design", space: "s-line", text: "" }, [], {});
  assert.equal(Object.keys(chat.waits).length, 0);
  assert.equal(added.length, 0);

  chat.waits["host/t4w"] = { name: "Design", space: "s-wait", at: Date.now() };
  chat.addLogged("host_t4w", { id: "r1", at: "2026-11-21T10:00:05.000Z", kind: "reply", name: "Design", space: "s-line", text: "Ready" }, [], {});
  assert.equal(Object.keys(chat.waits).length, 0);
  assert.equal(added.length, 1);
  assert.equal(added[0].space, "s-line");
  assert.equal(added[0].text, "Ready");
});
