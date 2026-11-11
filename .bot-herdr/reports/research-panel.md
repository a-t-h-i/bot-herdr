## Status
OPEN

## Questions
1. How should agent briefs be structured for cross-agent prompt cache hits?
   - Static shared prefix — Place identical global rules and tools at the start; pass agent name, task ID, parent address, and child lists at the end or in the first turn
   - Per-agent system prompts — Keep agent identity and roles at the top of each brief, relying only on single-agent multi-turn caching
   - Unchanged briefs — Retain existing brief layout and accept prompt cache misses across distinct child agents

2. How should `readable()` adjust theme text colours that fail WCAG 2.2 contrast?
   - Polarity-aware binary search — Adjust luminance toward black or white based on background luminance using binary search to preserve maximum original hue
   - Step mix toward ink or ground — Step in 5% increments toward theme `ink` (if bg is light) or theme `ground`/white until contrast >= 4.5:1
   - Snap fallback to theme ink — Test existing color and immediately fall back to `c.ink` without intermediate color mixing

## Notes

### 1. Prompt Caching Specifications & Invalidation Triggers

#### Claude Code (Anthropic Prompt Caching)
- **Source**: Anthropic Prompt Caching Documentation ([docs.anthropic.com / platform.claude.com](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching), updated 2025/2026).
- **How it works**:
  - Exact byte-for-byte prefix matching from prompt start up to defined cache breakpoints (`cache_control: {"type": "ephemeral"}`).
  - Evaluation hierarchy: `tools` -> `system` -> `messages`.
  - Minimum cacheable prefix: **1,024 tokens** (Claude 3.5 Sonnet, Claude 3.7 Sonnet, Claude 3 Opus) or **2,048 tokens** (Claude Haiku).
  - Cache lifetime (TTL): **5 minutes** (ephemeral), refreshed on each cache hit.
  - Cost & performance: Cache reads receive a **90% discount** off base input token pricing; initial cache write incurs a 1.25x multiplier.
- **Claude Code CLI specifics (`claude -p`)**:
  - Claude Code passes tools, system instructions, and user messages. `--append-system-prompt-file` appends to the system prompt block.
  - `--allowedTools` configures tool exposure.
- **What breaks prompt caching in Claude Code**:
  - Any modified, inserted, or removed token before the cache breakpoint invalidates all subsequent tokens.
  - Non-deterministic tool lists: altering the order or list of tools in `--allowedTools` modifies the `tools` prefix, invalidating all system prompt and message caches downstream.
  - Dynamic content in system prompt/`CLAUDE.md`: embedding agent names, session IDs, timestamps, task IDs, or varying path strings early in the prompt.
  - Session switching without `--resume`: fresh sessions start cache evaluation from scratch (though identical prefixes across sessions still hit existing memory cache if within the 5-minute TTL).

#### OpenAI Codex CLI (OpenAI Prompt Caching)
- **Source**: OpenAI Prompt Caching Guide ([platform.openai.com/docs/guides/prompt-caching](https://platform.openai.com/docs/guides/prompt-caching), updated 2025/2026).
- **How it works**:
  - Automatic implicit prefix caching on requests with $\ge$ **1,024 tokens**, cached in 128-token increments.
  - Retention window: Typically 5–10 minutes up to 30 minutes of inactivity; extended 12-hour persistence available on select newer models for continuous agents.
  - Cost: 50% to 90% discount on cached input tokens (`cached_tokens` in `usage`).
- **Codex CLI specifics (`codex exec`)**:
  - Multi-turn execution resumes threads via `codex exec resume <thread_id>`.
  - Non-resumed turns or fresh sessions prepend prompt instructions (`${brief}\n\n${prompt}`).
- **What breaks prompt caching in Codex**:
  - Divergent prompt prefixes: prepending unique brief headers (e.g. `[bot-herdr brief: you are dev...]`) causes a 100% cache miss between agents.
  - Modifying system instructions, tool definitions, or flags between invocations.

#### Gemini CLI & ACP (Google Context Caching)
- **Source**: Google Gemini Context Caching Documentation ([ai.google.dev/gemini-api/docs/caching](https://ai.google.dev/gemini-api/docs/caching), updated 2025/2026).
- **How it works**:
  - Gemini 2.5 and newer support implicit context caching by default for matching input token prefixes.
  - Thresholds: Multi-turn loops require $\ge$ **2,050 tokens** to trigger automatic caching of prior turns. Explicit caching is used for large static contexts ($\ge$ 32k tokens).
  - Cost: ~75% to 80% discount on cached prompt tokens (`usage_metadata.total_cached_tokens`).
- **What breaks prompt caching**:
  - Prefix mismatch: changing any text before the shared content blocks prevents implicit cache reuse across distinct ACP sessions.

---

### 2. Best Practices for Stable Cacheable Prefixes Across Agents & Sessions

1. **Prefix Invariance**:
   - Order prompt content strictly from **most static to most dynamic**:
     1. Global system directives (`engine/roles/global.md`).
     2. Standard environment & tools manual (static commands, `hc`, `bh`).
     3. Project conventions / repository map (stable `repo_map`).
     4. Role specifications (`dev.md`, `qa.md`, etc.).
     5. Dynamic runtime variables: Agent name, Task ID, Plan ID, parent address, child agent lists, and turn-specific inputs.
2. **Move Dynamic Envelope to User Messages or Prompt Suffix**:
   - Instead of beginning briefs with `[bot-herdr brief: you are <agent>...]`, keep the system prompt identical across all agents. Deliver agent name, task ID, and parent address either at the end of the brief or as the opening user turn.
3. **Deterministic Tool & Flag Ordering**:
   - Sort `--allowedTools` alphabetically in `claudeAccess()` so that tool definitions do not vary arbitrarily across runs.
4. **Shared Prefix across Child Agents**:
   - If Orchestrator, Dev, QA, and Research share an identical static prefix of $\ge$ 1,024 tokens, child agents spawned in parallel will reuse the same cache written by the lead agent, eliminating repeated token encoding and cutting cost by up to 90%.

---

### 3. WCAG 2.2 Contrast Standards & Palette Derivation Algorithm

#### Standards & Thresholds
- **Source**: W3C Recommendation: Web Content Accessibility Guidelines (WCAG) 2.2 (05 October 2023, [w3.org/TR/WCAG22](https://www.w3.org/TR/WCAG22/)).
- **SC 1.4.3 Contrast (Minimum) (Level AA)**:
  - **Normal text** (< 18pt / 24px regular, < 14pt / 18.67px bold): Minimum **4.5:1** contrast ratio.
  - **Large text** ($\ge$ 24px regular, $\ge$ 18.67px bold): Minimum **3:1** contrast ratio.
  - **Level AAA (SC 1.4.6)**: 7:1 for normal text, 4.5:1 for large text.
- **SC 1.4.11 Non-text Contrast (Level AA)**:
  - **UI components & graphical objects**: Minimum **3:1** against adjacent background colors (applies to input borders, buttons, focus rings, state indicators, and icons).

#### Derivation Algorithm for Readable Text from Arbitrary Palettes
1. **Calculate Relative Luminance ($L$)** (IEC 61966-2-1):
   - For each 8-bit channel $C \in \{R, G, B\}$:
     $$s = C / 255$$
     $$C_{lin} = \frac{s}{12.92} \text{ if } s \le 0.03928 \text{ else } \left(\frac{s + 0.055}{1.055}\right)^{2.4}$$
   - $$L = 0.2126 R_{lin} + 0.7152 G_{lin} + 0.0722 B_{lin}$$
2. **Calculate Contrast Ratio**:
   - $$\text{Contrast}(L_a, L_b) = \frac{\max(L_a, L_b) + 0.05}{\min(L_a, L_b) + 0.05}$$
3. **Derive Readable Colour**:
   - If $\text{Contrast}(L_{color}, L_{bg}) \ge 4.5$, return `color` unchanged.
   - Determine contrast polarity against background luminance $L_{bg}$:
     - If $L_{bg} \ge 0.179$, optimal high-contrast target is dark (black / `#000000` or dark ink).
     - If $L_{bg} < 0.179$, optimal high-contrast target is light (white / `#ffffff` or light ink).
   - Binary search $t \in [0.0, 1.0]$ mixing `color` toward the target high-contrast color (10 iterations achieves $\approx 0.1\%$ precision):
     - At step $t$, compute $C_{mix} = \text{lerp}(C_{color}, C_{target}, t)$.
     - Evaluate contrast of $C_{mix}$ against $L_{bg}$.
     - Return the first $C_{mix}$ where $\text{Contrast} \ge 4.5$ (or 3.0 for UI borders/controls).
   - If target ink cannot satisfy 4.5:1 against $L_{bg}$ (e.g. ill-formed custom theme), clamp to pure `#ffffff` or `#000000`.

---

### 4. What Applies to `mods/bot-herdr`

1. **`mods/bot-herdr/engine/lib/team.mjs` (`brief()` function)**:
   - Line 66 starts the brief with `[bot-herdr brief: you are ${agent.name}...]`, line 80 embeds `${task}`, line 81 embeds `${plan}`, line 88 embeds `${slug(a.name)}`, and line 51 embeds `${parent}`.
   - **Impact**: Breaks cross-agent prompt caching completely for Claude Code, Codex, and Gemini. Every agent receives a unique prefix starting at byte 0.
   - **Fix**: Reorder `brief()` so `role("global")` and static tools come first. Place agent identity, parent address, plan, and task into a trailing section or into the initial turn prompt.
2. **`mods/bot-herdr/engine/lib/runner.mjs` (`claudeAccess()`)**:
   - Line 135 constructs `tools` by concatenating standard commands with dynamic `allow` entries.
   - **Fix**: Alphabetically sort `tools` and command permissions to guarantee deterministic string prefixes across invocations.
3. **`mods/bot-herdr/look.js` (`readable()` & `palette()`)**:
   - Line 120 steps $t$ from 0.1 to 1.0 mixing toward `c.ink`.
     - *Issue A*: If `c.ink` does not have 4.5:1 contrast against `c.fill`, `readable()` returns a color that still violates WCAG 2.2.
     - *Issue B*: If `color` is lighter than `bg` on a dark surface, mixing toward a dark `c.ink` decreases contrast before it increases it.
     - *Issue C*: Step size 0.1 causes unnecessary oversaturation/hue drift.
   - Line 194-200 (`palette()`): `edgeDark`, `muted`, `faint` use static multipliers (`mix(fill, ink, 0.18)`, `0.35`, `0.5`). On low-contrast themes, muted text and borders drop below WCAG 2.2 thresholds (3:1 for borders/controls, 4.5:1 for text).
   - **Fix**: Upgrade `readable()` to use polarity-directed mixing toward `#ffffff` or `#000000` (or guaranteed-contrast theme extremes) with binary search, and validate `muted`/`edgeDark` against SC 1.4.3 and SC 1.4.11.
