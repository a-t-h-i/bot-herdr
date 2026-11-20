// purpose: print the byte size of each role's brief in each mode, to compare a brief change before and after
// usage: node .bot-herdr/tasks/t-20261120-n1rc/scripts/brief_size.mjs [project root]

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? process.cwd();
const team = await import(pathToFileURL(join(here, "../../../../mods/bot-herdr/engine/lib/team.mjs")).href);
const { agents } = team.team();
const by = (role) => agents.find((a) => a.role === role);
const cases = {
  "dev child": [by("dev"), { mode: "child", parent: "t7t", task: "t-00000000-0000", step: 1, name: "dev-child" }],
  "dev child, no task": [by("dev"), { mode: "child", name: "dev-child" }],
  "qa review": [by("qa"), { mode: "review", parent: "t7t", task: "t-00000000-0000", name: "qa-review" }],
  "research panel": [by("research"), { mode: "panel", parent: "t7t", plan: "p-00000000-0000", name: "research-panel" }],
  "dev lead": [by("dev"), { mode: "lead" }],
  "orchestrator lead": [by("orchestrator"), { mode: "lead" }],
};
for (const [label, [agent, options]] of Object.entries(cases)) {
  const bytes = Buffer.byteLength(team.brief(agent, { root, headless: true, ...options }), "utf8");
  console.log(`${label.padEnd(20)} ${String(bytes).padStart(6)} bytes`);
}
