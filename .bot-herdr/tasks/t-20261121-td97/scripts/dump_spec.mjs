// purpose: print the rendered `herdr-app check --print-spec` tree of every audit page (or one page)
// usage: node .bot-herdr/tasks/t-20261121-td97/scripts/dump_spec.mjs [page] > /tmp/spec.txt
// why: bh ui-audit keeps its spec trees in a temp dir; this mirrors its render step for debugging.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHerdrAppBin } from "../../../../install.mjs";
import { AUDIT_PAGES, WRAPPER_MAIN, fixtureSource } from "../../../../mods/bot-herdr/engine/lib/ui-audit-fixtures.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const only = process.argv[2] ?? null;
const herdrApp = resolveHerdrAppBin();

const work = mkdtempSync(join(tmpdir(), "bh-spec-"));
const app = join(work, "app");
const appHome = join(work, "apphome");
const home = join(work, "home");
mkdirSync(appHome, { recursive: true });
mkdirSync(home, { recursive: true });
cpSync(join(root, "mods/bot-herdr"), join(app, "mods/bot-herdr"), { recursive: true });
writeFileSync(join(app, "package.json"), '{"type":"module"}\n');
writeFileSync(join(app, "mod.json"), '{"place":"none","focusable":true}\n');
writeFileSync(join(app, "main.js"), WRAPPER_MAIN);
writeFileSync(join(appHome, "settings.json"), `${JSON.stringify({ zoom: 1 })}\n`);

for (const page of AUDIT_PAGES) {
  if (only && page.id !== only) continue;
  writeFileSync(join(app, "audit-fixture.js"), fixtureSource(page.id));
  const text = execFileSync(herdrApp, ["check", app, "--print-spec"], {
    env: { ...process.env, HERDR_APP_HOME: appHome, HOME: home },
    cwd: home,
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
  process.stdout.write(`\n===== ${page.id} =====\n${text}\n`);
}
process.stdout.write(`\ntmp: ${work}\nhome: ${homedir()}\n`);
