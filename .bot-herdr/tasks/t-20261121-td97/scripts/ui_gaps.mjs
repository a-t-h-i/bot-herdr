// purpose: list each audited page's interactive elements that lack a keyboard path or an accessible label (what ui-audit's coverage counters count).
// usage: node .bot-herdr/tasks/t-20261121-td97/scripts/ui_gaps.mjs [page]
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const lib = join(root, "mods/bot-herdr/engine/lib");
const { AUDIT_PAGES, WRAPPER_MAIN, fixtureSource } = await import(join(lib, "ui-audit-fixtures.mjs"));
const { parseSpec, walk, isInteractive, hasKeyboardPath, hasAccessibleLabel, elementId } = await import(join(lib, "ui-audit-spec.mjs"));
const { resolveHerdrAppBin } = await import(join(root, "install.mjs"));

const only = process.argv[2] ?? null;
const work = mkdtempSync(join(tmpdir(), "bh-gaps-"));
const app = join(work, "app");
const appHome = join(work, "apphome");
const home = join(work, "home");
mkdirSync(appHome, { recursive: true });
mkdirSync(home, { recursive: true });
cpSync(join(root, "mods/bot-herdr"), join(app, "mods/bot-herdr"), { recursive: true, filter: (s) => !/[\\/]node_modules[\\/]/.test(s) });
writeFileSync(join(app, "package.json"), '{"type":"module"}\n');
writeFileSync(join(app, "mod.json"), '{"place":"none","focusable":true}\n');
writeFileSync(join(app, "main.js"), WRAPPER_MAIN);
writeFileSync(join(appHome, "settings.json"), '{"zoom":1}\n');
const bin = resolveHerdrAppBin();
const path = (n) => { const out = []; for (let p = n; p; p = p.parent) out.unshift(elementId(p) ?? p.name); return out.slice(-4).join(" > "); };
for (const page of AUDIT_PAGES) {
  if (only && page.id !== only) continue;
  writeFileSync(join(app, "audit-fixture.js"), fixtureSource(page.id));
  let text;
  try {
    text = execFileSync(bin, ["check", app, "--print-spec"], { env: { ...process.env, HERDR_APP_HOME: appHome, HOME: home }, cwd: home, encoding: "utf8", maxBuffer: 1 << 26 });
  } catch (err) { console.log(`${page.id}: render error ${String(err.message).split("\n")[0]}`); continue; }
  const nodes = walk(parseSpec(text)).filter(isInteractive);
  for (const n of nodes) {
    const gaps = [!hasKeyboardPath(n) && "keys", !hasAccessibleLabel(n) && "label"].filter(Boolean);
    if (gaps.length) console.log(`${page.id}: [${gaps.join(",")}] ${path(n)}`);
  }
}
rmSync(work, { recursive: true, force: true });
