// bh home: the redesigned Home page's data (what the project is doing, what needs the user) lands
// with the Design Language Redesign milestones. The command exists now so plans, scripts and the
// help can name it; it answers with a placeholder instead of crashing.

/** `bh home …`: a placeholder until the Home page lands. */
export function runHomeCli({ sub, args, flags, out }) {
  const result = { command: "home", sub: sub ?? null, args, implemented: false, note: "not implemented yet" };
  return out(flags, result, () => `home: ${result.note}.`);
}
