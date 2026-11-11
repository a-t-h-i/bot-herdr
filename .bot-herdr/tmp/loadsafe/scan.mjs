// Throwaway QA load-safety scan (not committed).
// 1. static: identifiers used in call/construct position that are not imported,
//    not declared, and not JS globals.
// 2. dynamic: import every mods/bot-herdr/*.js with bare specifiers stubbed, so a
//    broken import or module-level ReferenceError shows up.
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve("mods/bot-herdr");
const TMP = path.resolve(".bot-herdr/tmp/loadsafe");
const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".js"));
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

const PUNCT_BEFORE_REGEX = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const KEYWORDS_BEFORE_REGEX = new Set(["return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await", "delete", "instanceof", "new"]);

function tokenize(text) {
  const toks = [];
  const n = text.length;
  let i = 0;
  let lastSig = null;
  const push = (t, v, idx) => { const tok = { t, v, i: idx }; toks.push(tok); lastSig = tok; return tok; };

  const skipQuoted = (q) => {
    i++;
    while (i < n) {
      const c = text[i];
      if (c === "\\") { i += 2; continue; }
      if (c === q) { i++; return; }
      i++;
    }
  };
  const skipLine = () => { while (i < n && text[i] !== "\n") i++; };
  const skipBlock = () => { i += 2; while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; };
  const regexOk = () => {
    const p = lastSig;
    return !p || (p.t === "punct" && PUNCT_BEFORE_REGEX.has(p.v)) || (p.t === "id" && KEYWORDS_BEFORE_REGEX.has(p.v));
  };
  const skipRegex = () => {
    i++;
    let cls = false;
    while (i < n) {
      const c = text[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "\n") return;
      if (c === "[") { cls = true; i++; continue; }
      if (c === "]") { cls = false; i++; continue; }
      if (c === "/" && !cls) { i++; break; }
      i++;
    }
    while (i < n && /[a-z]/i.test(text[i])) i++;
  };
  let template = null;
  const code = (braceDepth) => {
    let depth = 0;
    while (i < n) {
      const c = text[i];
      if (c === "/" && text[i + 1] === "/") { skipLine(); continue; }
      if (c === "/" && text[i + 1] === "*") { skipBlock(); continue; }
      if (c === '"' || c === "'") { const at = i; skipQuoted(c); push("str", undefined, at); continue; }
      if (c === "`") { const at = i; template(); push("str", undefined, at); continue; }
      if (c === "/" && regexOk()) { const at = i; skipRegex(); push("str", undefined, at); continue; }
      if (/[A-Za-z_$]/.test(c)) { const at = i; let j = i; while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j++; push("id", text.slice(i, j), at); i = j; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === "{") { depth++; push("punct", c, i); i++; continue; }
      if (c === "}") {
        if (braceDepth > 0 && depth === 0) { i++; return; }
        depth--; push("punct", c, i); i++; continue;
      }
      const two = text.slice(i, i + 2);
      if (two === "=>" || two === "?." || two === "++" || two === "--" || two === "&&" || two === "||") { push("punct", two, i); i += 2; continue; }
      push("punct", c, i); i++;
    }
  };
  template = () => {
    i++;
    while (i < n) {
      const c = text[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { i++; return; }
      if (c === "$" && text[i + 1] === "{") { i += 2; code(1); continue; }
      i++;
    }
  };
  code(0);
  return toks;
}

const DECL_KW = new Set(["const", "let", "var"]);
const GLOBALS = new Set(`
globalThis Array Object String Number Boolean Symbol BigInt Math JSON Date RegExp Error TypeError RangeError
Promise Map Set WeakMap WeakSet Proxy Reflect Function Infinity NaN undefined null true false this
console process Buffer setTimeout clearTimeout setInterval clearInterval queueMicrotask structuredClone
parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI
crypto URL URLSearchParams TextEncoder TextDecoder AbortController AbortSignal fetch ReadableStream
arguments new typeof instanceof in of void delete yield await async function class return if else for while do switch case break continue try catch finally throw const let var import export default from as
require module exports __dirname __filename
`.trim().split(/\s+/));

function collectDeclared(toks) {
  const declared = new Set();
  const addPattern = (k) => {
    let j = k;
    const t = toks[j];
    if (!t) return j;
    if (t.t === "id") {
      if (["true", "false", "null", "undefined", "this"].includes(t.v)) return j + 1;
      declared.add(t.v); return j + 1;
    }
    if (t.v === "{") {
      j++;
      while (j < toks.length && toks[j].v !== "}") {
        if (toks[j].t === "id") {
          if (toks[j + 1] && toks[j + 1].v === ":") { j = addPattern(j + 2); continue; }
          if (!["..."].includes(toks[j].v)) declared.add(toks[j].v);
          j++;
          if (toks[j] && toks[j].v === "=") { let d = 0; while (j < toks.length) { const v = toks[j].v; if (v === "{" || v === "(" || v === "[") d++; if (v === "}" || v === ")" || v === "]") { if (d === 0) break; d--; } if (v === "," && d === 0) break; j++; } }
          continue;
        }
        j++;
      }
      return j + 1;
    }
    if (t.v === "[") {
      j++;
      while (j < toks.length && toks[j].v !== "]") { if (toks[j].t === "id") declared.add(toks[j].v); j++; }
      return j + 1;
    }
    return j + 1;
  };
  const collectParams = (lparen) => {
    let j = lparen + 1, d = 0;
    while (j < toks.length) {
      const v = toks[j].v;
      if (v === "(" || v === "{" || v === "[") d++;
      if (v === ")" && d === 0) break;
      if (v === ")" || v === "}" || v === "]") d--;
      if (toks[j].t === "id" && d <= 0 && toks[j - 1] && ["(", ",", "{"].includes(toks[j - 1].v)) declared.add(v);
      j++;
    }
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== "id") continue;
    if (t.v === "import") {
      let j = k + 1;
      if (toks[j] && toks[j].t === "id" && toks[j].v !== "from") { declared.add(toks[j].v); j++; }
      if (toks[j] && toks[j].v === ",") j++;
      if (toks[j] && toks[j].v === "*" && toks[j + 1] && toks[j + 1].v === "as") { declared.add(toks[j + 2].v); j += 3; }
      if (toks[j] && toks[j].v === "{") {
        j++;
        while (j < toks.length && toks[j].v !== "}") {
          if (toks[j].t === "id") {
            if (toks[j + 1] && toks[j + 1].v === "as") { declared.add(toks[j + 2].v); j += 3; continue; }
            declared.add(toks[j].v);
          }
          j++;
        }
      }
      continue;
    }
    if (DECL_KW.has(t.v)) {
      let j = k + 1;
      for (;;) {
        j = addPattern(j);
        if (toks[j] && toks[j].v === "=") {
          let d = 0; j++;
          while (j < toks.length) {
            const v = toks[j].v;
            if (v === "(" || v === "[" || v === "{") d++;
            if (v === ")" || v === "]" || v === "}") { if (d === 0) break; d--; }
            if (d === 0 && (v === "," || v === ";")) break;
            if (d === 0 && toks[j].t === "id" && ["of", "in"].includes(v)) break;
            j++;
          }
        }
        if (toks[j] && toks[j].v === ",") { j++; continue; }
        break;
      }
      continue;
    }
    if (t.v === "function" || t.v === "class") {
      let j = k + 1;
      if (toks[j] && toks[j].t === "id") { declared.add(toks[j].v); j++; }
      if (t.v === "function" && toks[j] && toks[j].v === "(") collectParams(j);
      continue;
    }
    if (t.v === "catch" && toks[k + 1] && toks[k + 1].v === "(") { collectParams(k + 1); continue; }
  }
  for (let k = 0; k < toks.length; k++) {
    if (toks[k].v === "=>") {
      const p = toks[k - 1];
      if (p && p.t === "id") declared.add(p.v);
      if (p && p.v === ")") {
        let d = 0, j = k - 1;
        for (; j >= 0; j--) { if (toks[j].v === ")") d++; if (toks[j].v === "(") { d--; if (d === 0) break; } }
        if (j >= 0) collectParams(j);
      }
    }
  }
  return declared;
}

function lineOf(text, idx) { let l = 1; for (let i = 0; i < idx; i++) if (text[i] === "\n") l++; return l; }

// a method definition: NAME(params) {   -- prev token { , ; or } and the matching ) is followed by {
function isMethodDef(toks, k) {
  const prev = toks[k - 1];
  if (!prev || !["{", ",", ";", "}"].includes(prev.v)) return false;
  let d = 0, j = k + 1;
  for (; j < toks.length; j++) {
    if (toks[j].v === "(") d++;
    if (toks[j].v === ")") { d--; if (d === 0) break; }
  }
  return !!(toks[j + 1] && toks[j + 1].v === "{");
}

const report = [];
for (const f of files) {
  const toks = tokenize(src[f]);
  const declared = collectDeclared(toks);
  const known = (n) => declared.has(n) || GLOBALS.has(n);
  const hits = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== "id") continue;
    const prev = toks[k - 1];
    if (prev && (prev.v === "." || prev.v === "?.")) continue;
    if (known(t.v)) continue;
    const next = toks[k + 1];
    const after = toks[k + 2];
    if (next && next.v === "(") {
      if (isMethodDef(toks, k)) continue;
      hits.push({ kind: "call", name: t.v, line: lineOf(src[f], t.i) });
    } else if (next && (next.v === "." || next.v === "?.") && after && ["new", "markdown"].includes(after.v)) {
      hits.push({ kind: `${t.v}.${after.v}`, name: t.v, line: lineOf(src[f], t.i) });
    }
  }
  if (hits.length) report.push({ file: f, hits });
}

console.log("== static: undeclared identifiers in call/new/markdown position ==");
if (!report.length) console.log("  none");
for (const r of report) for (const h of r.hits) console.log(`  ${r.file}:${h.line}  ${h.name}  (${h.kind})`);

// ---------- dynamic load with stubbed bare modules ----------
const bare = new Map();
for (const f of files) {
  const re = /import\s+([^;]*?)\s+from\s+["']([^"'.][^"']*)["']/g;
  let m;
  while ((m = re.exec(src[f]))) {
    const clause = m[1], spec = m[2];
    if (!bare.has(spec)) bare.set(spec, { names: new Set(), ns: false });
    const e = bare.get(spec);
    if (/\*\s+as\s+/.test(clause)) e.ns = true;
    const named = clause.match(/\{([^}]*)\}/);
    if (named) for (const part of named[1].split(",")) {
      const p = part.trim(); if (!p) continue;
      const as = p.split(/\s+as\s+/); e.names.add((as[1] || as[0]).trim());
    }
  }
}
const stubDir = path.join(TMP, "stubs");
fs.mkdirSync(stubDir, { recursive: true });
for (const [spec, e] of bare) {
  const lines = [
    `const P = new Proxy(function () {}, {`,
    `  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : P),`,
    `  apply: () => P, construct: () => P, set: () => true,`,
    `});`,
  ];
  for (const nm of e.names) lines.push(`export const ${nm} = P;`);
  lines.push(`export default P;`);
  fs.writeFileSync(path.join(stubDir, spec.replace(/[^a-z0-9]+/gi, "_") + ".mjs"), lines.join("\n"));
}
const specToStub = new Map([...bare.keys()].map((s) => [s, pathToFileURL(path.join(stubDir, s.replace(/[^a-z0-9]+/gi, "_") + ".mjs")).href]));

registerHooks({
  resolve(specifier, context, next) {
    if (specToStub.has(specifier)) return { url: specToStub.get(specifier), shortCircuit: true };
    return next(specifier, context);
  },
});

console.log("\n== dynamic: import each module (bare specifiers stubbed) ==");
let failures = 0;
for (const f of files) {
  try {
    await import(pathToFileURL(path.join(ROOT, f)).href);
  } catch (err) {
    failures++;
    console.log(`  FAIL ${f}: ${err && err.message}`);
  }
}
console.log(`${failures} module(s) failed to load (${files.length} checked)`);
