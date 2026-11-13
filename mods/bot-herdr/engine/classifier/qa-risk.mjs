import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
const QA_RISKS = ["none", "low", "medium", "high"];
import { noul, score, scoreOf, yesOf } from "./client.mjs";
import { clip } from "./limits.mjs";
const GENERATED = /(?:^|\/)(?:dist|build|out|coverage|vendor|__generated__|generated)\/|\.min\.(?:js|css)$|\.map$|\.snap$|\.generated\.\w+$/i;
const LOCKFILE = /(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|poetry\.lock|Pipfile\.lock|Cargo\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/;
const MANIFEST = /(?:^|\/)(?:package\.json|requirements[\w.-]*\.txt|Pipfile|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile|composer\.json)$/;
const TEST = /(?:^|\/)(?:tests?|__tests__|spec|e2e)\/|\.(?:test|spec)\.\w+$|_test\.(?:go|py)$|(?:^|\/)test_[\w-]+\.py$/i;
const DOC = /\.(?:md|mdx|markdown|rst|txt|adoc)$|(?:^|\/)(?:LICENSE|LICENCE|NOTICE|AUTHORS|CODEOWNERS)(?:\.\w+)?$/i;
const STYLE = /\.(?:css|scss|sass|less|styl|pcss)$/i;
const ASSET = /\.(?:png|jpe?g|gif|svg|ico|webp|avif|bmp|woff2?|ttf|otf|eot|mp[34]|webm|wav|ogg|pdf)$/i;
const CONFIG = /\.(?:json|jsonc|ya?ml|toml|ini|cfg|conf|properties|env)$|(?:^|\/)\.[\w.-]+$|(?:^|\/)(?:Dockerfile|Makefile|Procfile)$/i;
const VERSION = /\d+\.\d+|"\s*[~^*]|\blatest\b|\bworkspace:|\bgit\+|==|>=|~=/;
export function fileKind(path, changed = []) {
    if (LOCKFILE.test(path)) return "dependency";
    if (GENERATED.test(path)) return "generated";
    if (MANIFEST.test(path)) return changed.some((line)=>VERSION.test(line)) ? "dependency" : "config";
    if (TEST.test(path)) return "test";
    if (DOC.test(path)) return "docs";
    if (STYLE.test(path)) return "style";
    if (ASSET.test(path)) return "asset";
    if (CONFIG.test(path)) return "config";
    return "code";
}
export function parseDiff(diff) {
    const files = new Map();
    let current;
    let inHunk = false;
    let untracked = false;
    for (const line of diff.split("\n")){
        const header = /^diff --git a\/.+? b\/(.+)$/.exec(line);
        if (header) {
            current = {
                added: [],
                removed: []
            };
            files.set(header[1], current);
            inHunk = false;
            continue;
        }
        if (/^New files \(untracked\):$/.test(line)) {
            untracked = true;
            current = undefined;
            continue;
        }
        if (untracked) {
            const named = /^--- (.+?)(?: \((?:large; read it directly|binary|unreadable)\))?$/.exec(line);
            if (named) {
                current = {
                    added: [],
                    removed: []
                };
                files.set(named[1], current);
            } else current?.added.push(line.startsWith("+") ? line.slice(1) : line);
            continue;
        }
        if (line.startsWith("@@")) {
            inHunk = true;
            continue;
        }
        if (!current || !inHunk) continue;
        if (line.startsWith("+")) current.added.push(line.slice(1));
        else if (line.startsWith("-")) current.removed.push(line.slice(1));
    }
    const stat = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(diff);
    return {
        files,
        ...stat ? {
            total: Number(stat[2] ?? 0) + Number(stat[3] ?? 0)
        } : {}
    };
}
const UNTRACKED_MAX = 200_000;
/** Untracked files as the `New files (untracked):` block parseDiff reads; ones too big or unreadable are named back. */
function withUntracked(input) {
    const paths = input.root ? input.untracked ?? [] : [];
    if (!paths.length) return { diff: input.diff, unreadable: [] };
    const blocks = ["New files (untracked):"];
    const unreadable = [];
    for (const path of paths) {
        let text;
        try {
            text = readFileSync(join(input.root, path), "utf8");
        } catch {
            unreadable.push(path);
            continue;
        }
        if (text.length > UNTRACKED_MAX) {
            unreadable.push(path);
            continue;
        }
        blocks.push(`--- ${path}`, ...text.split("\n").map((line)=>`+${line}`));
    }
    return {
        diff: [
            input.diff,
            blocks.join("\n")
        ].filter(Boolean).join("\n"),
        unreadable
    };
}
const SLASH_COMMENT = /^(?:\/\/|\/\*|\*|\*\/|\{\s*\/\*.*\*\/\s*\}$)/;
const COMMENTS = [
    [
        /\.(?:[cm]?[jt]sx?|java|kt|kts|go|rs|c|h|cc|cpp|hpp|cs|swift|scala|dart|css|scss|less)$/i,
        SLASH_COMMENT
    ],
    [
        /\.(?:py|pyi|rb|sh|bash|zsh|pl|r|ya?ml|toml|ps1|ex|exs)$|(?:^|\/)(?:Dockerfile|Makefile)$/i,
        /^#/
    ],
    [
        /\.(?:sql|lua|hs)$/i,
        /^--/
    ],
    [
        /\.(?:html?|vue|svelte|xml)$/i,
        /^(?:<!--|-->)|-->$|^\/\/|^\/\*|^\*/
    ],
    [
        /\.php$/i,
        /^(?:#|\/\/|\/\*|\*)/
    ]
];
export function commentOnly(path, change) {
    if (!change) return false;
    const pattern = COMMENTS.find(([files])=>files.test(path))?.[1];
    if (!pattern) return false;
    return [
        ...change.added,
        ...change.removed
    ].every((line)=>!line.trim() || pattern.test(line.trim()));
}
export const RISK_AREAS = [
    "security",
    "data",
    "destructive",
    "concurrency",
    "workflow",
    "isolation",
    "contract",
    "dependency"
];
const SERIOUS = new Set([
    "security",
    "data",
    "destructive",
    "concurrency",
    "workflow",
    "isolation"
]);
const AREA_RULES = {
    security: {
        path: /auth|login|logout|password|permission|rbac|\bacl\b|secret|credential|oauth|jwt|security|crypto|csrf|sanitiz/i,
        text: /password|passwd|secret|credential|api[_-]?key|authori[sz]|authenticat|permission|\brbac\b|\bacl\b|oauth|\bjwt\b|csrf|\bxss\b|sanitiz|encrypt|decrypt|bcrypt|argon2|\bhmac\b|private[_-]?key/i
    },
    data: {
        path: /migrations?\b|schema\.(?:prisma|sql|rb)$|\.sql$|persistence|database|(?:^|\/)db\//i,
        text: /\b(?:ALTER|CREATE|DROP)\s+(?:TABLE|INDEX|COLUMN|SCHEMA)\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bmigrat(?:e|ion)/i
    },
    destructive: {
        text: /\brm(?:Sync|dirSync)?\s*\(|\bunlink(?:Sync)?\s*\(|\brm\s+-[a-z]*r[a-z]*f|shutil\.rmtree|os\.remove|\bTRUNCATE\b|\bDROP\s+TABLE\b|git\s+(?:reset\s+--hard|clean\s+-\w*f|push\s+(?:-f\b|--force)|branch\s+-D)|\bdeleteMany\s*\(/i
    },
    concurrency: {
        path: /lock|mutex|semaphore|queue|scheduler|concurren|parallel/i,
        text: /\bmutex\b|\bsemaphore\b|\block(?:file)?s?\b|\bAtomics\.|worker_threads|\brace\b|concurren|Promise\.race|\btransaction\b/i
    },
    workflow: {
        path: /workflow|state-?machine|transitions?\b|orchestrat|task-state|\bfsm\b|recover|rollback|retry|restore|resume/i,
        text: /\btransition\s*\(|state\s*machine|\brollback\b|\brecover(?:y)?\b/i
    },
    isolation: {
        path: /worktree|isolation|sandbox/i,
        text: /\bworktree\b|\bsandbox\b|allowed_?tools/i
    },
    contract: {
        path: /protocol|openapi|swagger|\.proto$|\.graphql$|(?:^|\/)(?:api|routes?|endpoints?)\//i,
        text: /\b(?:app|router|server)\.(?:get|post|put|patch|delete)\s*\(|@(?:Get|Post|Put|Patch|Delete)Mapping|@app\.route|@(?:router|app)\.(?:get|post|put|patch|delete)/i
    }
};
const AREA_WORDS = {
    security: {
        factor: "security",
        focus: "security boundaries: the wrong user, no user and an expired session are refused, and no secret leaks"
    },
    data: {
        factor: "persistent data",
        focus: "data integrity: what is saved reads back the same, a migration runs on real data, and a failure halfway loses or corrupts nothing"
    },
    destructive: {
        factor: "destructive operations",
        focus: "destructive operations: they touch only what they should, and a failure halfway leaves things recoverable"
    },
    concurrency: {
        factor: "concurrency",
        focus: "concurrency: races, ordering, double runs, and a lock or claim that is never released"
    },
    workflow: {
        factor: "orchestration and state",
        focus: "state transitions and recovery: no illegal or stuck state, and a crash or failed step recovers"
    },
    isolation: {
        factor: "isolation",
        focus: "isolation: work stays inside its branch, worktree and permission boundaries"
    },
    contract: {
        factor: "a public contract",
        focus: "public contracts: existing callers and saved data keep working (backwards compatibility)"
    },
    dependency: {
        factor: "dependencies",
        focus: "dependencies: the new or changed package works as it is used, and nothing relied on the old one"
    }
};
const UI_FILE = /\.(?:tsx|jsx|vue|svelte|html?)$|(?:^|\/)(?:components?|pages|screens|views)\//i;
function rank(risk) {
    return QA_RISKS.indexOf(risk);
}
function higher(a, b) {
    return rank(a) >= rank(b) ? a : b;
}
function moduleOf(path) {
    const dir = dirname(path);
    return dir === "." ? "(top)" : dir.split("/").slice(0, 3).join("/");
}
function listed(items, max = 3) {
    return items.length > max ? `${items.slice(0, max).join(", ")} and ${items.length - max} more` : items.join(", ");
}
export function readChange(input) {
    const { diff, unreadable } = withUntracked(input);
    const { files: parsed, total } = parseDiff(diff);
    const fresh = new Set(input.untracked ?? []);
    const kinds = input.files.map((path)=>({
            path,
            kind: fresh.has(path) && MANIFEST.test(path) ? "dependency" : fileKind(path, [
                ...parsed.get(path)?.added ?? [],
                ...parsed.get(path)?.removed ?? []
            ])
        }));
    const functional = kinds.filter(({ path, kind })=>kind === "code" && !commentOnly(path, parsed.get(path)));
    const tests = kinds.filter(({ kind })=>kind === "test");
    const dependencies = kinds.filter(({ kind })=>kind === "dependency");
    const config = kinds.filter(({ kind })=>kind === "config");
    const styles = kinds.filter(({ kind })=>kind === "style");
    const count = (paths)=>paths.reduce((sum, { path })=>sum + (parsed.get(path)?.added.length ?? 0) + (parsed.get(path)?.removed.length ?? 0), 0);
    const unseen = functional.some(({ path })=>!parsed.has(path));
    const lines = unseen ? Math.max(count(functional), total ?? 0) : count(functional);
    const factors = [];
    const areas = {};
    const scanned = kinds.filter(({ path, kind })=>(kind === "code" || kind === "config") && !commentOnly(path, parsed.get(path)));
    for (const [area, rule] of Object.entries(AREA_RULES)){
        for (const { path, kind } of scanned){
            const change = parsed.get(path);
            const line = rule.text ? [
                ...change?.added ?? [],
                ...change?.removed ?? []
            ].find((text)=>!/^\s*(?:\/\/|\/\*|\*|#)/.test(text) && rule.text.test(text)) : undefined;
            if (line !== undefined) {
                const word = rule.text.exec(line)?.[0] ?? "";
                areas[area] = {
                    strong: true,
                    where: `${path} ("${word.trim()}")`
                };
                break;
            }
            if (!areas[area] && kind === "code" && rule.path?.test(path)) areas[area] = {
                strong: false,
                where: path
            };
        }
    }
    if (dependencies.length > 0) areas.dependency = {
        strong: true,
        where: listed(dependencies.map(({ path })=>path))
    };
    for (const area of RISK_AREAS){
        const hit = areas[area];
        if (hit) factors.push(`${AREA_WORDS[area].factor}: ${hit.where}${hit.strong ? "" : " (by its path)"}`);
    }
    const modules = [
        ...new Set(functional.map(({ path })=>moduleOf(path)))
    ];
    const inert = kinds.length > 0 && kinds.every(({ path, kind })=>kind === "docs" || kind === "asset" || kind === "generated" || kind === "code" && commentOnly(path, parsed.get(path)));
    let risk;
    if (functional.length === 0) {
        const configLines = count(config);
        const styleLines = count(styles);
        if (tests.length > 0) {
            risk = "low";
            factors.push(`tests only: ${listed(tests.map(({ path })=>path))}`);
        } else if (configLines > 20 || styleLines > 150) {
            risk = "low";
            factors.push(configLines > 20 ? `${configLines} changed configuration lines` : `${styleLines} changed style lines`);
        } else {
            risk = "none";
            factors.push(`nothing that runs changed: ${listed(input.files)}`);
        }
    } else if (modules.length >= 4 || functional.length > 12 || lines > 800) {
        risk = "high";
        factors.push(`a wide change: ${functional.length} files, ${lines} changed lines across ${modules.length} modules (${listed(modules)})`);
    } else if (lines <= 40 && functional.length <= 2 && modules.length <= 1) {
        risk = "low";
        factors.push(`small and local: ${lines} changed lines in ${listed(functional.map(({ path })=>path))}`);
    } else {
        risk = "medium";
        factors.push(`${functional.length} files, ${lines} changed lines in ${listed(modules)}`);
    }
    for (const area of RISK_AREAS){
        const hit = areas[area];
        if (!hit) continue;
        risk = higher(risk, SERIOUS.has(area) && hit.strong ? "high" : "medium");
    }
    if (input.bugfix) {
        risk = higher(risk, "low");
        factors.push("a bug fix: the bug must no longer reproduce");
    }
    const blocked = unreadable.filter((path)=>fileKind(path) === "code");
    if (blocked.length > 0) {
        risk = higher(risk, "medium");
        factors.push(`new source files that could not be read: ${listed(blocked)}`);
    }
    if (tests.length > 0 && functional.length > 0) factors.push(`tests changed with it: ${listed(tests.map(({ path })=>path))}`);
    return {
        risk,
        areas,
        factors,
        testsChanged: tests.length > 0,
        functional: functional.length,
        lines,
        frontend: functional.some(({ path })=>UI_FILE.test(path)),
        inert
    };
}
const RISK_LEVELS = [
    "none: no behavioural risk — comments, documentation, wording, formatting, a trivial style tweak, metadata, generated files, or an obvious configuration value",
    "low: small and local, its behaviour plain and a failure contained — a simple UI change, straightforward wiring, a small mapping, basic validation, an isolated bug fix with obvious behaviour",
    "medium: meaningful behaviour changes and realistic regressions are possible — a new feature, API behaviour, business logic, state transitions, database access, several interacting components, a non-trivial bug fix",
    "high: a defect could spread widely or break an invariant — authentication, authorization, permissions, secrets, destructive operations, persistence and data integrity, migrations, concurrency, orchestration or state machines, recovery, isolation, public contracts, or a cross-cutting refactor"
];
const AREA_QUESTIONS = {
    security: "Does `diff` change authentication, authorization, permissions, secrets, input sanitising or another security boundary?",
    data: "Does `diff` change how data is persisted, migrated or transformed, so a defect could lose or corrupt saved data?",
    destructive: "Does `diff` add or change an operation that deletes or overwrites files, data or history?",
    concurrency: "Does `diff` change concurrent or parallel behaviour: locks, queues, ordering, shared state, or work that can run twice at once?",
    workflow: "Does `diff` change orchestration or a state machine: which states or steps follow which, completion rules, retries, or recovery after a failure?",
    isolation: "Does `diff` change isolation: which branch, worktree, sandbox or permissions an agent or process works within?",
    contract: "Does `diff` change a public contract — an API route, a protocol, a file or wire format, a command-line interface — that existing callers or saved data rely on?"
};
const HUNK_CHARS = 12_000;
/** Where a changed line from this kind of file goes: source before the rest, tests last. */
function kindOrder(kind) {
    if (kind === "code") return 0;
    if (kind === "docs" || kind === "generated" || kind === "asset") return 3;
    if (kind === "test") return 2;
    return 1;
}
/**
 * The change as the model reads it: a one-line summary per file, then changed lines as far as
 * HUNK_CHARS allows, source files first and tests last. Never the raw diff.
 */
export function diffPayload(input) {
    const { files: parsed } = parseDiff(input.diff);
    const rows = input.files.map((path)=>{
        const change = parsed.get(path);
        return {
            path,
            kind: fileKind(path, [
                ...change?.added ?? [],
                ...change?.removed ?? []
            ]),
            change,
            added: change?.added.length ?? 0,
            removed: change?.removed.length ?? 0
        };
    });
    const summary = rows.map((row)=>`${row.path} (${row.kind}, +${row.added}/-${row.removed})`).join("\n");
    const ordered = [...rows].sort((a, b)=>kindOrder(a.kind) - kindOrder(b.kind) || a.path.localeCompare(b.path));
    const picked = [];
    let left = HUNK_CHARS;
    let leftOut = 0;
    for (const row of ordered){
        const lines = [
            ...(row.change?.removed ?? []).map((text)=>`-${text}`),
            ...(row.change?.added ?? []).map((text)=>`+${text}`)
        ];
        if (!lines.length) continue;
        const head = `--- a/${row.path}\n+++ b/${row.path}`;
        const room = left - head.length - 2;
        if (room <= 0) {
            leftOut += lines.length;
            continue;
        }
        const kept = [];
        let used = 0;
        for (const text of lines){
            if (used + text.length + 1 > room) break;
            kept.push(text);
            used += text.length + 1;
        }
        if (!kept.length) {
            leftOut += lines.length;
            continue;
        }
        picked.push([
            head,
            ...kept
        ].join("\n"));
        left -= head.length + used + 1;
        leftOut += lines.length - kept.length;
    }
    const hunks = picked.join("\n") + (leftOut ? `\n… ${leftOut} changed lines left out (the summary above lists their files).` : "");
    return {
        summary,
        hunks
    };
}
export function qaRiskRequest(input, reading) {
    const questions = {
        risk: score("How much verification does the change in `diff` warrant, judged by how likely it is to break something that works, how far a break would spread and how hard it would be to notice?", RISK_LEVELS),
        behaviour: noul("Does `diff` change behaviour a user, a caller or another part of the system can observe?", "Yes: something works differently after it.", "No: it changes wording, comments, formatting, styling or metadata only."),
        tests_cover: noul("Is the behaviour `diff` changes covered by tests — ones it adds or updates, or ones that plainly exist for this code — so few or no new tests are needed?", "Yes: a regression in what it changes would already fail a test.", "No: a regression in what it changes could pass every existing test.")
    };
    for (const [area, text] of Object.entries(AREA_QUESTIONS))questions[`area_${area}`] = noul(text);
    const change = diffPayload(input);
    return {
        state: {
            ...input.request ? {
                request: clip(input.request, 2000)
            } : {},
            changed_files: clip(input.files.join("\n"), 4000),
            engine_signals: clip(reading.factors.join("\n"), 2000),
            diff_summary: clip(change.summary, 4000),
            diff: change.hunks
        },
        questions
    };
}
export async function readRiskWithJev(classifier, input, reading, signal) {
    if (!classifier.enabled("qa")) return undefined;
    const result = await classifier.ask("qa", qaRiskRequest(input, reading), signal ? {
        signal
    } : {});
    const level = scoreOf(result?.answers, "risk");
    if (!result || !level) return undefined;
    const areas = {};
    for (const area of Object.keys(AREA_QUESTIONS)){
        const yes = yesOf(result.answers, `area_${area}`);
        if (yes !== undefined) areas[area] = yes;
    }
    return {
        risk: QA_RISKS[Math.max(0, Math.min(QA_RISKS.length - 1, level.level))],
        confidence: level.confidence,
        areas,
        behaviour: yesOf(result.answers, "behaviour") ?? 0.5,
        testsCover: yesOf(result.answers, "tests_cover") ?? 0,
        model: result.model
    };
}
export const TEST_BUDGETS = {
    none: {
        min: 0,
        max: 0
    },
    low: {
        min: 0,
        max: 1
    },
    medium: {
        min: 1,
        max: 3
    },
    high: {
        min: 2,
        max: 6
    }
};
export const DEPTHS = {
    none: "the engine's checks only",
    low: "light",
    medium: "standard",
    high: "deep and adversarial"
};
function areaFloor(area, hit, jev) {
    const serious = SERIOUS.has(area);
    if (area === "dependency") return "medium";
    const yes = jev?.areas[area];
    if (yes === undefined) return serious && hit.strong ? "high" : "medium";
    if (yes >= 0.5) return serious ? "high" : "medium";
    if (yes >= 0.2) return "medium";
    return hit.strong ? "medium" : "low";
}
export function combineRisk(reading, jev, at = new Date().toISOString()) {
    let risk = jev ? jev.confidence >= 0.5 ? jev.risk : higher(jev.risk, reading.risk) : reading.risk;
    const factors = [
        ...reading.factors
    ];
    const focus = [];
    const touched = new Set();
    for (const area of RISK_AREAS){
        const hit = reading.areas[area];
        if (!hit) continue;
        const floor = areaFloor(area, hit, jev);
        risk = higher(risk, floor);
        if (floor !== "none") touched.add(area);
    }
    for (const [area, yes] of Object.entries(jev?.areas ?? {})){
        if (reading.areas[area] || yes < 0.6) continue;
        risk = higher(risk, SERIOUS.has(area) ? "high" : "medium");
        touched.add(area);
        factors.push(`${AREA_WORDS[area].factor}: Jev reads it in the diff (${yes.toFixed(2)})`);
    }
    const plainlyInert = jev !== undefined && jev.risk === "none" && jev.confidence >= 0.6 && jev.behaviour < 0.3 && reading.lines <= 20 && touched.size === 0;
    if (reading.functional > 0 && !plainlyInert) risk = higher(risk, "low");
    if (reading.risk === "none" && jev && jev.behaviour >= 0.6) risk = higher(risk, "low");
    for (const area of touched)focus.push(AREA_WORDS[area].focus);
    if (factors.some((factor)=>factor.startsWith("a bug fix"))) focus.push("the reported bug no longer reproduces");
    if (reading.frontend && focus.length < 4) focus.push("the changed screens: what the user sees and can do");
    if (focus.length === 0 && risk !== "none") focus.push("the changed behaviour, as its callers and users see it");
    const existing = risk === "none" || reading.testsChanged || (jev ? jev.testsCover >= 0.6 : risk === "low" && !factors.some((factor)=>factor.startsWith("a bug fix")));
    const budget = TEST_BUDGETS[risk];
    const why = jev ? `Jev read the diff as ${jev.risk} (${jev.confidence.toFixed(2)})${jev.risk !== risk ? `; the touched areas and the rules set ${risk}` : ""}` : "the engine's rules (Jev is off or had nothing to read)";
    return {
        risk,
        qaRequired: risk !== "none",
        testBudget: {
            min: existing ? 0 : budget.min,
            max: budget.max
        },
        focusAreas: focus.slice(0, 5),
        riskFactors: factors.slice(0, 8),
        existingTestsLikelySufficient: existing,
        reasoning: `${risk.toUpperCase()}: ${factors.slice(0, 3).join("; ")}. ${why}.`,
        source: jev ? "classifier" : "rules",
        at
    };
}
export async function assessQaRisk(input, classifier, signal) {
    const reading = readChange(input);
    let jev;
    if (classifier && !reading.inert) {
        try {
            jev = await readRiskWithJev(classifier, input, reading, signal);
        } catch  {
            jev = undefined;
        }
    }
    return combineRisk(reading, jev);
}
export function unreadRisk(why, at = new Date().toISOString()) {
    return {
        risk: "medium",
        qaRequired: true,
        testBudget: {
            ...TEST_BUDGETS.medium
        },
        focusAreas: [
            "the acceptance criteria, checked against the repository as it stands"
        ],
        riskFactors: [
            why
        ],
        existingTestsLikelySufficient: false,
        reasoning: `MEDIUM: ${why}, so QA reviews the work in full.`,
        source: "rules",
        at
    };
}
export function budgetWords(budget) {
    return budget.min === budget.max ? `${budget.max}` : `${budget.min}-${budget.max}`;
}
export function qaRiskLine(assessment) {
    const by = assessment.source === "classifier" ? "Jev" : "rules";
    const tests = assessment.qaRequired ? `${budgetWords(assessment.testBudget)} new tests at most` : "no QA agent, the engine's checks decide";
    const about = assessment.riskFactors.map((factor)=>factor.split(":")[0]).slice(0, 3).join(", ");
    return `QA risk: ${assessment.risk} (${by}) · ${tests}${about ? ` · ${about}` : ""}`;
}
export function qaRiskBrief(assessment) {
    return [
        `## QA risk: ${assessment.risk.toUpperCase()} (${assessment.source === "classifier" ? "Jev's read of the diff" : "the engine's rules"})`,
        `Depth: ${DEPTHS[assessment.risk]}. Test budget: ${budgetWords(assessment.testBudget)} new behavioural tests at most — a ceiling, never a quota; write none that adds no confidence.`,
        `Existing tests likely enough: ${assessment.existingTestsLikelySufficient ? "yes — find and run them before writing any" : "no — find what exists first, then cover only the gaps that matter"}.`,
        assessment.focusAreas.length > 0 ? `Focus:\n${assessment.focusAreas.map((area)=>`- ${area}`).join("\n")}` : "",
        assessment.riskFactors.length > 0 ? `Why:\n${assessment.riskFactors.map((factor)=>`- ${factor}`).join("\n")}` : ""
    ].filter(Boolean).join("\n");
}
