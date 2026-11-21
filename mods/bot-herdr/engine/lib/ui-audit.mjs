// bh ui-audit: the redesign's design-language audit (tokens, contrast, spacing) lands with the
// Design Language Redesign milestones. The command exists now so plans, scripts and the help can
// name it; it answers with a placeholder instead of crashing.

/** `bh ui-audit …`: a placeholder until the design audit lands. */
export function runUiAuditCli({ sub, args, flags, out }) {
  const result = { command: "ui-audit", sub: sub ?? null, args, implemented: false, note: "not implemented yet" };
  return out(flags, result, () => `ui-audit: ${result.note}.`);
}
