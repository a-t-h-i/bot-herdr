// bh thread: one chat thread's stored conversation (the redesigned chat's threads) lands with the
// Design Language Redesign milestones. The command exists now so plans, scripts and the help can
// name it; it answers with a placeholder instead of crashing.

/** `bh thread …`: a placeholder until chat threads land. */
export function runThreadCli({ sub, args, flags, out }) {
  const result = { command: "thread", sub: sub ?? null, args, implemented: false, note: "not implemented yet" };
  return out(flags, result, () => `thread: ${result.note}.`);
}
