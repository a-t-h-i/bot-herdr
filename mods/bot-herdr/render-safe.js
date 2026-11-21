// Pure render-resilience helpers for BotHerdr (main.js): safe init/render wrappers,
// hostile-value-safe error formatting, QuickJS interrupt detection, and dedup signatures.
// Zero gpui-kit, gpui-base, or herdr imports so Node tests can import this directly.

const DEFAULT_DETAIL_MAX = 200;

/** Safely reads a property without throwing on null, primitives, or hostile getters. */
function safeProp(value, key) {
  if (value === null || value === undefined) return undefined;
  try {
    return value[key];
  } catch {
    return undefined;
  }
}

/** Circular-safe JSON replacer that also survives BigInt and Symbol fields. */
function jsonReplacer(seen) {
  return (_k, v) => {
    if (typeof v === "bigint") return `${v}n`;
    if (typeof v === "symbol") return v.toString();
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }
    return v;
  };
}

/** Turns any thrown value (primitive, circular object, null-proto, hostile getter) into text. */
function safeStringify(value) {
  if (value === null) return "Unknown error (null)";
  if (value === undefined) return "Unknown error (undefined)";
  if (typeof value === "string") return value.trim() || "Unknown error";
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return value.name ? `[Function: ${value.name}]` : "[Function]";
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value, jsonReplacer(new WeakSet())) || "[object Object]";
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/** Extracts a normalised message string from an arbitrary thrown value. */
function extractMessage(err) {
  if (err === null || err === undefined || typeof err === "string") return safeStringify(err);
  const msg = safeProp(err, "message");
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  const name = safeProp(err, "name");
  if (err instanceof Error && typeof name === "string" && name.trim()) return name.trim();
  return safeStringify(err);
}

/** Extracts a string stack trace when present, else an empty string. */
function extractStack(err) {
  const stack = safeProp(err, "stack");
  return typeof stack === "string" ? stack.trim() : "";
}

/** Collapses whitespace and trims to a single bounded line for folded machine text. */
function foldDetail(text, max = DEFAULT_DETAIL_MAX) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "Unknown render error";
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Resolves a view name from explicit options or props without throwing. */
function resolveView(explicit, props) {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const fromProps = safeProp(props, "view");
  return typeof fromProps === "string" && fromProps.trim() ? fromProps.trim() : "unknown";
}

/** Invokes an error callback safely so a failing logger can never break resilience. */
function notifyError(onError, record, rawErr) {
  if (typeof onError !== "function") return;
  try {
    onError(record, rawErr);
  } catch {
    // Logging must never turn a handled error back into a crash.
  }
}

/** True when `err` is QuickJS's render-budget abort (`interrupted`). Never throws. */
export function isInterruptError(err) {
  if (typeof err === "string") return err.trim().toLowerCase() === "interrupted";
  const msg = safeProp(err, "message");
  return typeof msg === "string" && msg.trim().toLowerCase() === "interrupted";
}

/** Normalises any thrown value into a structured, plain-language render error record. */
export function formatRenderError(err, opts = {}) {
  const phase = typeof safeProp(opts, "phase") === "string" && opts.phase ? opts.phase : "render";
  const view = resolveView(safeProp(opts, "view"), null);
  const interrupted = isInterruptError(err);
  const message = extractMessage(err);
  const stack = extractStack(err);
  const title = interrupted ? "This view paused while drawing" : "This view could not draw safely";
  const detail = foldDetail(interrupted ? "Drawing was interrupted because it took too long." : message);
  return { at: new Date().toISOString(), phase, view, title, message, detail, stack, interrupted };
}

/** Stable deduplication key so repeated renders of the same failure log only once. */
export function errorSignature(record) {
  return `${safeProp(record, "phase") ?? ""}:${safeProp(record, "view") ?? ""}:${safeProp(record, "message") ?? ""}`;
}

/** Runs `createPage(props, cx)` safely; returns `{ page, error }` and never throws. */
export function safeInit(createPage, props, cx, opts = {}) {
  const view = resolveView(safeProp(opts, "view"), props);
  try {
    if (typeof createPage !== "function") throw new TypeError("View factory is not a function");
    const page = createPage(props, cx);
    return { page, error: null };
  } catch (err) {
    const error = formatRenderError(err, { view, phase: "init" });
    notifyError(safeProp(opts, "onError"), error, err);
    return { page: null, error };
  }
}

/** Runs `page.render(cx)` safely; returns `{ node, error }` and never throws. */
export function safeRender(page, cx, opts = {}) {
  const view = resolveView(safeProp(opts, "view"), null);
  try {
    if (!page || typeof page.render !== "function") throw new TypeError("View has no render method");
    const node = page.render(cx);
    if (node === null || node === undefined) throw new TypeError("View render returned no element");
    return { node, error: null };
  } catch (err) {
    const error = formatRenderError(err, { view, phase: "render" });
    notifyError(safeProp(opts, "onError"), error, err);
    return { node: null, error };
  }
}
