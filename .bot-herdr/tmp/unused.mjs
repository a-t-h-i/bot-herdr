import { readFileSync } from "node:fs";
const files = process.argv.slice(2);
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const stmts = [...src.matchAll(/^import\s+(?:\{([^}]*)\}|([\w$]+))[^;\n]*from\s+"[^"]+";?/gm)];
  const names = stmts.flatMap((m) => (m[1] ?? m[2]).split(",").map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean));
  const body = src.replace(/^import\s[\s\S]*?from\s+"[^"]+";?/gm, "");
  const unused = names.filter((n) => !new RegExp(`(?<![\w$.])${n.replace(/\$/g, "\$")}(?![\w$])`).test(body));
  console.log(f, unused.length ? "unused: " + unused.join(", ") : "ok");
}
