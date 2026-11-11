// The mod's way into the bh tool (engine/bh.mjs): tasks, plans, knowledge, questions, the
// classifier and the team's templates all live there, so every harness and this chat share one
// copy. It runs with node, in the project folder of the space you are looking at.

import { exec, appHome, home, spaces, focused } from "herdr";

/** Set by Settings: the classifier is on, has a key and may pick who answers a plain message. */
export const ROUTING_KEY = "bot-herdr.routing";

export const bhPath = () => `${appHome()}/mods/bot-herdr/engine/bh.mjs`;

/** JSON (or text) as one safe argument: no quoting trouble on any OS. */
export const enc = (value) => encodeURIComponent(typeof value === "string" ? value : JSON.stringify(value));

/** The space you are looking at. */
export function currentSpace() {
  const f = focused();
  return spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
}

/** The folder bh treats as the project: the space's folder, else where its terminal is, else home. */
export function projectDir(space = currentSpace()) {
  if (space?.folder && !space.machine) return space.folder;
  return focused()?.cwd || home();
}

/** Runs bh. Never throws: a failure comes back as a non-zero code with the reason in stderr. */
export async function bh(args, { cwd = projectDir(), timeout = 30000 } = {}) {
  try {
    return await exec("node", [bhPath(), ...args], { cwd, timeout });
  } catch (e) {
    return { code: 1, stdout: "", stderr: String(e?.message ?? e) };
  }
}

/** Runs bh with --json and parses what it prints; null when it fails. */
export async function bhJson(args, opts) {
  const r = await bh([...args, "--json"], opts);
  if (r.code !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}
