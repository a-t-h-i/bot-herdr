// bh approvals: approval cards for a command an agent may not run on its own. The command and the
// permission hook exist now so plans, scripts and the help can name them; a call the engine would
// refuse is still refused, and a card never holds a call until the approval UI lands.

/** `bh approvals …`: a placeholder until approval cards land. */
export function runApprovalsCli({ sub, args, flags, out }) {
  const result = { command: "approvals", sub: sub ?? null, args, implemented: false, note: "not implemented yet" };
  return out(flags, result, () => `approvals: ${result.note}.`);
}

/**
 * The permission hook for `session/request_permission`: with no approval cards yet, every refused
 * call falls through to the existing reject path (`handled: false`).
 */
export function maybeHoldPermission({ req, call, options, command, access, send, on }) {
  return { handled: false };
}
