// bh review: review comments on a change (the redesigned review flow) lands with the Design
// Language Redesign milestones. The command exists now so plans, scripts and the help can name it;
// it answers with a placeholder instead of crashing.

/** `bh review …`: a placeholder until review comments land. */
export function runReviewCli({ sub, args, flags, out }) {
  const result = { command: "review", sub: sub ?? null, args, implemented: false, note: "not implemented yet" };
  return out(flags, result, () => `review: ${result.note}.`);
}
