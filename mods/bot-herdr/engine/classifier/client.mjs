export const SYSTEM_ONE_PATH = "/v1/systemone";
export function noul(instructions, yes, no) {
    return {
        type: "noul",
        instructions,
        ...yes !== undefined || no !== undefined ? {
            criteria: {
                ...yes !== undefined ? {
                    true: yes
                } : {},
                ...no !== undefined ? {
                    false: no
                } : {}
            }
        } : {}
    };
}
export function choice(instructions, criteria) {
    return {
        type: "choice",
        instructions,
        criteria
    };
}
export function score(instructions, levels) {
    return {
        type: "score",
        instructions,
        criteria: levels
    };
}
function probabilityOf(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : undefined;
}
export function yesOf(answers, key) {
    const answer = answers?.[key];
    return answer?.type === "noul" ? probabilityOf(answer.noul) : undefined;
}
export function choiceOf(answers, key) {
    const answer = answers?.[key];
    if (answer?.type !== "choice" || typeof answer.choice !== "string" || !answer.probabilities || typeof answer.probabilities !== "object") return undefined;
    const sorted = Object.values(answer.probabilities).map(probabilityOf).filter((value)=>value !== undefined).sort((a, b)=>b - a);
    const probability = probabilityOf(answer.probabilities[answer.choice]) ?? sorted[0] ?? 0;
    return {
        choice: answer.choice,
        probability,
        margin: sorted.length > 1 ? sorted[0] - sorted[1] : sorted[0] ?? 0,
        confidence: probabilityOf(answer.confidence) ?? 0
    };
}
export function scoreOf(answers, key) {
    const answer = answers?.[key];
    if (answer?.type !== "score" || typeof answer.score !== "number" || !Number.isFinite(answer.score)) return undefined;
    return {
        score: answer.score,
        level: Math.round(answer.score),
        confidence: probabilityOf(answer.confidence) ?? 0
    };
}
export class JevError extends Error {
    status;
    retryable;
    waitMs;
    constructor(message, retryable, status, waitMs){
        super(message);
        this.name = "JevError";
        this.retryable = retryable;
        if (status !== undefined) this.status = status;
        if (waitMs !== undefined) this.waitMs = waitMs;
    }
}
const RETRYABLE = new Set([
    408,
    425,
    429,
    500,
    502,
    503,
    504,
    529
]);
const MAX_WAIT_MS = 2000;
const realSleep = (ms)=>new Promise((resolve)=>setTimeout(resolve, ms));
function retryAfter(headers) {
    const ms = Number(headers.get("retry-after-ms"));
    if (headers.has("retry-after-ms") && Number.isFinite(ms) && ms >= 0) return Math.min(ms, MAX_WAIT_MS);
    const seconds = Number(headers.get("retry-after"));
    if (headers.has("retry-after") && Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_WAIT_MS);
    return undefined;
}
function summarize(text) {
    try {
        let current = JSON.parse(text);
        for(let depth = 0; depth < 2 && current && typeof current === "object"; depth += 1){
            const record = current;
            const found = record.message ?? record.error ?? record.detail;
            if (typeof found === "string") return found;
            current = found;
        }
    } catch  {}
    return text.slice(0, 200) || "empty response";
}
async function attempt(url, body, options) {
    const controller = new AbortController();
    const onAbort = ()=>controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onAbort, {
        once: true
    });
    let timedOut = false;
    const timer = setTimeout(()=>{
        timedOut = true;
        controller.abort();
    }, options.timeoutMs);
    try {
        let response;
        try {
            response = await (options.fetch ?? globalThis.fetch)(url, {
                method: "POST",
                headers: {
                    ...options.headers,
                    Authorization: `Bearer ${options.apiKey}`,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "User-Agent": "bot-herdr"
                },
                body,
                signal: controller.signal
            });
        } catch (error) {
            if (options.signal?.aborted) throw error;
            if (timedOut) throw new JevError(`timed out after ${options.timeoutMs} ms`, false);
            throw new JevError(`could not reach ${url}: ${error.message}`, true);
        }
        const text = await response.text();
        if (!response.ok) {
            throw new JevError(`API error ${response.status}: ${summarize(text)}`, RETRYABLE.has(response.status), response.status, retryAfter(response.headers));
        }
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch  {
            throw new JevError("the API answered with something that is not JSON", false, response.status);
        }
        const record = parsed;
        if (!record || typeof record !== "object" || !record.answers || typeof record.answers !== "object") {
            throw new JevError("the API answered without answers", false, response.status);
        }
        return {
            model: typeof record.model === "string" ? record.model : options.model ?? "jev",
            answers: record.answers,
            ...record.usage ? {
                usage: record.usage
            } : {}
        };
    } finally{
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
    }
}
export async function systemOne(request, options) {
    const url = `${options.baseUrl.replace(/\/+$/, "")}${SYSTEM_ONE_PATH}`;
    const body = JSON.stringify({
        ...options.model ? {
            model: options.model
        } : {},
        ...request
    });
    const retries = Math.max(0, options.retries ?? 1);
    for(let tried = 0;; tried += 1){
        options.signal?.throwIfAborted();
        try {
            return await attempt(url, body, options);
        } catch (error) {
            if (!(error instanceof JevError) || !error.retryable || tried >= retries) throw error;
            const wait = error.waitMs ?? Math.min(MAX_WAIT_MS, 300 * 2 ** tried);
            await (options.sleep ?? realSleep)(wait);
        }
    }
}
