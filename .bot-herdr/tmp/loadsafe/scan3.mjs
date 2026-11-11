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

// ---------- tokenizer ----------
const PUNCT_BEFORE_REGEX = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const KEYWORDS_BEFORE_REGEX = new Set(["return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await", "delete", "instanceof", "new"]);

function tokenize(text) {
  const toks = [];
  let i = 0;
  const n = text.length;
  let tplDepth = 0; // stack of template nesting: count of ${ open
  const tplStack = [];
  let lastSig = null; // last significant token (for regex detection)
  const push = (t, v) => { const tok = { t, v, i }; toks.push(tok); if (t !== "comment") lastSig = tok; return tok; };
  while (i < n) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "/") { while (i < n && text[i] !== "\n") i++; continue; }
    if (ch === "/" && text[i + 1] === "*") { i += 2; while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
    if (ch === '"' || ch === "'") {
      const q = ch; i++;
      while (i < n) { if (text[i] === "\\") { i += 2; continue; } if (text[i] === q) { i++; break; } i++; }
      push("str"); continue;
    }
    if (ch === "`") {
      i++;
      while (i < n) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === "`") { i++; break; }
        if (text[i] === "$" && text[i + 1] === "{") { i += 2; tplStack.push(i); break; }
        i++;
      }
      if (tplStack.length) { // continue in code mode, closing tracked at '}'
        let depth = 1;
        while (i < n) {
          const c = text[i];
          if (c === "/" && text[i + 1] === "/") { while (i < n && text[i] !== "\n") i++; continue; }
          if (c === "/" && text[i + 1] === "*") { i += 2; while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
          if (c === '"' || c === "'" || c === "`") { // skip nested simple string; templates handled naively
            const q = c; i++;
            while (i < n) { if (text[i] === "\\") { i += 2; continue; } if (text[i] === q) { i++; break; } i++; }
            continue;
          }
          if (c === "{") depth++;
          else if (c === "}") { depth--; if (depth === 0) { i++; tplStack.pop(); break; } }
          else if (/[A-Za-z_$]/.test(c)) {
            let j = i; while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j++;
            push("id", text.slice(i, j)); i = j; continue;
          }
          i++;
        }
        continue;
      }
      push("str"); continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(text[j])) j++;
      push("id", text.slice(i, j)); i = j; continue;
    }
    if (ch === "/") {
      const prev = lastSig;
      const regexOk = !prev || (prev.t === "punct" && PUNCT_BEFORE_REGEX.has(prev.v)) || (prev.t === "id" && KEYWORDS_BEFORE_REGEX.has(prev.v));
      if (regexOk) {
        i++;
        let inClass = false;
        while (i < n) { const c = text[i]; if (c === "\\") { i += 2; continue; } if (c === "[") inClass = true; else if (c === "]") inClass = false; else if (c === "/" && !inClass) { i++; break; } else if (c === "\n") break; i++; }
        while (i < n && /[a-z]/i.test(text[i])) i++;
        push("str"); continue;
      }
      push("punct", ch); i++; continue;
    }
    if (/\s/.test(ch)) { i++; continue; }
    // multi-char punct we care about
    const two = text.slice(i, i + 2);
    if (two === "=>" || two === "?." ) { push("punct", two); i += 2; continue; }
    if (two === "++" || two === "--") { push("punct", two); i += 2; continue; }
    push("punct", ch); i++; continue;
  }
  return toks;
}

// ---------- declarations ----------
const DECL_KW = new Set(["const", "let", "var"]);
function collectDeclared(toks) {
  const declared = new Set();
  const addPattern = (k) => {
    // parse an identifier/pattern starting at token k, add bound names, return index after it
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
          const name = toks[j].v;
          if (toks[j + 1] && toks[j + 1].v === ":") { j = addPattern(j + 2); continue; }
          if (!["...", "="].includes(name)) declared.add(name);
          j++;
          if (toks[j] && toks[j].v === "=") { // default value: skip to , or }
            let d = 0;
            while (j < toks.length) {
              const v = toks[j].v;
              if (v === "{" || v === "(" || v === "[") d++;
              if (v === "}" || v === ")" || v === "]") { if (d === 0) break; d--; }
              if (v === "," && d === 0) break;
              j++;
            }
          }
          continue;
        }
        j++;
      }
      return j + 1;
    }
    if (t.v === "[") {
      j++;
      while (j < toks.length && toks[j].v !== "]") {
        if (toks[j].t === "id") { declared.add(toks[j].v); j++; continue; }
        if (toks[j].v === ",") j++;
        else j++;
      }
      return j + 1;
    }
    return j + 1;
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== "id") continue;
    const prev = toks[k - 1];
    // import
    if (t.v === "import" && !(prev && prev.v === "(")) {
      let j = k + 1;
      const fromClause = () => { while (j < toks.length && toks[j].v !== ";" && toks[j].v !== "from") j++; };
      if (toks[j] && toks[j].t === "id" && !["from"].includes(toks[j].v)) { declared.add(toks[j].v); j++; }
      if (toks[j] && toks[j].v === ",") j++;
      if (toks[j] && toks[j].v === "*" && toks[j + 1] && toks[j + 1].v === "as") { declared.add(toks[j + 2].v); j += 3; }
      if (toks[j] && toks[j].v === "{") {
        j++;
        while (j < toks.length && toks[j].v !== "}") {
          if (toks[j].t === "id") {
            const name = toks[j].v;
            if (toks[j + 1] && toks[j + 1].v === "as") { declared.add(toks[j + 2].v); j += 3; continue; }
            declared.add(name);
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
        if (toks[j] && toks[j].v === "=") { // skip initialiser to , or ; at depth 0
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
    }
    if (t.v === "function" || t.v === "class") {
      let j = k + 1;
      if (toks[j] && toks[j].t === "id") { declared.add(toks[j].v); j++; }
      if (t.v === "function" && toks[j] && toks[j].v === "(") {
        // params
        collectParams(toks, j, declared);
      }
      continue;
    }
    if (t.v === "catch" && toks[k + 1] && toks[k + 1].v === "(") { collectParams(toks, k + 1, declared); continue; }
  }
  // arrow params: "( ... ) =>" and "x =>"
  for (let k = 0; k < toks.length; k++) {
    if (toks[k].v === "=>") {
      const p = toks[k - 1];
      if (p && p.t === "id") declared.add(p.v);
      if (p && p.v === ")") {
        // find matching '(' backwards
        let d = 0, j = k - 1;
        for (; j >= 0; j--) { if (toks[j].v === ")") d++; if (toks[j].v === "(") { d--; if (d === 0) break; } }
        if (j >= 0) collectParams(toks, j, declared);
      }
    }
  }
  return declared;
}
function collectParams(toks, lparen, declared) {
  let j = lparen + 1, d = 0;
  while (j < toks.length) {
    const v = toks[j].v;
    if (v === "(" || v === "{" || v === "[") d++;
    if (v === ")" && d === 0) break;
    if (v === ")" || v === "}" || v === "]") d--;
    if (toks[j].t === "id" && d <= 0 && toks[j - 1] && (["(", ",", "{", "[", "..."].includes(toks[j - 1].v) || toks[j - 1].t === "id")) {
      // binding position: identifier directly after ( , { ... or another id? keep simple: after ( , { [
      if (["(", ",", "{"].includes(toks[j - 1].v)) declared.add(v);
    }
    j++;
  }
}

const GLOBALS = new Set(`
globalThis Array Object String Number Boolean Symbol BigInt Math JSON Date RegExp Error TypeError RangeError
Promise Map Set WeakMap WeakSet Proxy Reflect Function Infinity NaN undefined null true false this
console process Buffer setTimeout clearTimeout setInterval clearInterval queueMicrotask structuredClone
parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI
node crypto URL URLSearchParams TextEncoder TextDecoder AbortController AbortSignal fetch ReadableStream
arguments new typeof instanceof in of void delete yield await async function class return if else for while do switch case break continue try catch finally throw const let var import export default from as
require module exports __dirname __filename
`.trim().split(/\s+/));

if (process.env.DBG2) { const t=tokenize(src["viewer.js"]); const idx=t.findIndex(x=>x.v==="openFile"); console.log("tokens",t.length,"openFile idx",idx, JSON.stringify(t.slice(idx-12,idx+6))); process.exit(0); } const report = [];
for (const f of files) {
  const toks = tokenize(src[f]);
  const declared = collectDeclared(toks);
  const fileDeclared = new Set([...declared, ...GLOBALS]);
  const hits = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== "id") continue;
    const prev = toks[k - 1];
    if (prev && (prev.v === "." || prev.v === "?.")) continue;
    if (!fileDeclared.has(t.v)) {
      const next = toks[k + 1];
      const afterNext = toks[k + 2];
      if (next && next.v === "(") hits.push({ kind: "call", name: t.v, line: lineOf(src[f], t.i) });
      else if (next && (next.v === "." || next.v === "?.") && afterNext && ["new", "markdown"].includes(afterNext.v)) hits.push({ kind: `${t.v}.${afterNext.v}`, name: t.v, line: lineOf(src[f], t.i) });
    }
  }
  if (hits.length) report.push({ file: f, hits });
}
function lineOf(text, idx) { let l = 1; for (let i = 0; i < idx; i++) if (text[i] === "\n") l++; return l; }

console.log("== static: undeclared identifiers used in call/new/markdown position ==");
if (!report.length) console.log("  none");
for (const r of report) for (const h of r.hits) console.log(`  ${r.file}:${h.line}  ${h.name}  (${h.kind})`);

// ---------- dynamic load with stubbed bare modules ----------
const bare = new Map(); // specifier -> Set of export names / "*" / "default"
for (const f of files) {
  const re = /import\s+([^;]*?)\s+from\s+["']([^"'.][^"']*)["']/g;
  let m;
  while ((m = re.exec(src[f]))) {
    const clause = m[1], spec = m[2];
    if (!bare.has(spec)) bare.set(spec, { names: new Set(), ns: false, def: false });
    const e = bare.get(spec);
    if (/\*\s+as\s+/.test(clause)) e.ns = true;
    const named = clause.match(/\{([^}]*)\}/);
    if (named) for (const part of named[1].split(",")) {
      const p = part.trim(); if (!p) continue;
      const as = p.split(/\s+as\s+/); e.names.add((as[1] || as[0]).trim());
    }
    const before = clause.split("{")[0].replace(/^\s*\*.*$/, "").trim();
    if (before && !/^,/.test(before)) e.def = true;
  }
}
const stubDir = path.join(TMP, "stubs");
fs.mkdirSync(stubDir, { recursive: true });
for (const [spec, e] of bare) {
  const name = spec.replace(/[^a-z0-9]+/gi, "_");
  const lines = [
    `const P = new Proxy(function () {}, {`,
    `  get: (t, k) => (k === "default" || k === "__esModule" ? P : (k === Symbol.toPrimitive ? () => "" : P)),`,
    `  apply: () => P, construct: () => P, set: () => true,`,
    `});`,
  ];
  for (const n of e.names) lines.push(`export const ${n} = P;`);
  if (e.def || true) lines.push(`export default P;`);
  if (e.ns) lines.push(`const NS = P; export { NS };`);
  fs.writeFileSync(path.join(stubDir, name + ".mjs"), lines.join("\n"));
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
  if (f === "gpui-kit.d.ts") continue;
  try {
    await import(pathToFileURL(path.join(ROOT, f)).href);
    console.log(`  ok    ${f}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${f}: ${err && err.message}`);
    if (err && err.stack) console.log(String(err.stack).split("\n").slice(1, 4).join("\n"));
  }
}
console.log(`\n${failures} module(s) failed to load`);
