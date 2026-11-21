// bh goal progress: how far a Goal has come (criteria, rounds, spend) in the redesigned shape
// lands with the Design Language Redesign milestones. The command exists now so plans, scripts and
// the help can name it; it answers with a placeholder instead of crashing.

/** `bh goal progress …`: a placeholder until Goal progress lands. */
export function runGoalProgressCli({ sub, args, flags, out }) {
  const result = { command: "goal progress", sub: sub ?? null, args, implemented: false, note: "not implemented yet" };
  return out(flags, result, () => `goal progress: ${result.note}.`);
}
