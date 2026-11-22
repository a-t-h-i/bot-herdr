// The Issues page: cache-first split workbench for viewing, triaging, bundling, and resolving
// GitHub issues for the current workspace. Never polls GitHub on a timer; refreshes only once
// when cache is missing/stale or on explicit Refresh. Untrusted issue text is rendered read-only
// without linkFiles() and never interpolated into chat prompts (ID-only prompts from issuesview.js).

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { settings, setShared } from "herdr";
import { SIZE, ICON, TYPE, LINE, SPACE, CONTROL, MARK, PIP, HAIR, GLYPH, clickable, focusable } from "./look.js";
import { actionButton } from "./button.js";
import { stateView, pill, filterChip, chipHasResults } from "./switch.js";
import { markdownWithFoldedCode } from "./machinetext.js";
import { openPlan, sectionLabel } from "./plandoc.js";
import { colors } from "./theme.js";
import { sendFromChat, showPage, viewShown, OPEN_TASK } from "./pages.js";
import { bh, bhJson, projectDir } from "./bh.js";
import { openLink } from "./viewer.js";
import { alpha } from "./working.js";
import {
  ISSUE_FILTERS,
  RESOLVE_GOAL_PRESETS,
  filterIssues,
  chipCounts,
  issueWorkSummary,
  toggleSelection,
  clearSelection,
  bundleEligibility,
  buildFixIssuePrompt,
  buildStartGoalPrompt,
  isSafeExternalUrl,
  classifyIssuesState,
  formatRelativeAge,
  splitMode,
} from "./issuesview.js";

const MAX = 1140;
const GAP = 14;
const LIST_W = 350;
const HEADER_H = 44;
const BANNER_H = 34;

const CHIP_LABELS = {
  open: "Open",
  untriaged: "Untriaged",
  accepted: "Accepted",
  declined: "Declined",
  closed: "Closed",
};

function toneColor(c, tone) {
  return { success: c.success, warning: c.warning, danger: c.danger, accent: c.accent, info: c.info, muted: c.muted }[tone] ?? c.muted;
}

/** Runs `bh ... --json` and preserves the first stderr line on non-zero exit for clean UI error display. */
async function bhCall(args, opts) {
  const r = await bh([...args, "--json"], opts);
  if (r.code === 0) {
    try {
      return { ok: true, data: JSON.parse(r.stdout), error: null };
    } catch {
      return { ok: false, data: null, error: "Invalid JSON response from bh." };
    }
  }
  return { ok: false, data: null, error: (r.stderr || "").trim().split("\n")[0] || null };
}

/** Custom 14px clickable checkbox using MARK + check.svg (never GPUI Checkbox). */
function checkBox(c, { id, checked, disabled = false, label, onToggle }) {
  const box = div()
    .size(MARK)
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .rounded(PIP)
    .border_1()
    .border_color(checked && !disabled ? c.accent : c.edge)
    .when(checked && !disabled, (el) => el.bg(c.accent).child(svg(ICON("check")).size(GLYPH.xs).text_color(c.accentInk)));
  if (disabled) {
    return div().role("switch").accessibility_label(label).opacity(0.45).cursor_not_allowed().child(box);
  }
  return clickable(
    div()
      .role("switch")
      .accessibility_label(label)
      .p(SPACE[1])
      .rounded(SIZE.nested)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((e, cx) => {
        cx.stop_propagation();
        onToggle(e, cx);
      })
      .child(box),
    c,
    id,
  );
}

/** Narrow-screen back link returning to the issue list. */
function backLink(c, id, label, onClick) {
  return focusable(
    h_flex()
      .cursor_pointer()
      .gap(SPACE[2])
      .items_center()
      .text_size(TYPE.sm)
      .font_medium()
      .text_color(c.muted)
      .hover((s) => s.text_color(c.ink))
      .on_click(onClick)
      .child(svg(ICON("chevron-left")).size(GLYPH.sm))
      .child(label),
    id,
    c,
  );
}

/** Compact neutral label tag for GitHub issue labels. */
function labelChip(c, text) {
  return div()
    .flex_none()
    .px(SPACE[2])
    .py(1)
    .rounded_full()
    .bg(c.well)
    .border_1()
    .border_color(alpha(c.edge, 0.7))
    .text_size(TYPE.xs)
    .text_color(c.muted)
    .child(text);
}

/** Quiet single-line input box wrapping GPUI Input. */
function inputBox(c, state, { icon = null, clearId = null, onClear = null, hasValue = false } = {}) {
  return h_flex()
    .flex_none()
    .h(CONTROL)
    .px(SPACE[3])
    .gap(SPACE[2])
    .items_center()
    .rounded(SIZE.control)
    .bg(c.fill)
    .border_1()
    .border_color(c.edge)
    .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).flex_none().size(GLYPH.sm).text_color(c.faint)))
    .child(Input.new(state).flex_1().min_w(0).h_full().text_size(TYPE.sm).text_color(c.ink))
    .when(Boolean(clearId && hasValue), (el) => el.child(
      actionButton(c, clearId, null, onClear, { icon: "x", tone: "quiet", tooltip: "Clear search", a11y: "Clear search" }),
    ));
}

export class Issues {
  init(_given, cx) {
    this.dir = projectDir();
    this.width = 960;
    this.height = 720;
    this.shown = viewShown("issues");
    this.handle = cx.focus_handle();
    this.search = InputState.new({ placeholder: "Search issues, #number, or label..." });
    this.search.on("change", (_e, cx) => cx.notify());
    this.declineReason = InputState.new({ placeholder: "Reason for declining this issue..." });
    this.declineReason.on("change", (_e, cx) => cx.notify());
    this.declineReason.on("submit", (_e, cx) => this.confirmDecline(cx));
    this.resetProjectState(this.dir);
    this.loadList(cx, this.dir, { allowAutoFetch: this.shown });
  }

  resetProjectState(dir) {
    this.dir = dir;
    this.data = null;
    this.dataRev = 0;
    this.loading = true;
    this.listBusy = false;
    this.fetching = false;
    this.autoFetched = false;
    this.loadError = null;
    this.refreshError = null;
    this.actionError = null;
    this.actionNotice = null;
    this.actionBusy = false;
    this.chip = "open";
    this.opened = null;
    this.stayClosed = false;
    this.selected = clearSelection();
    this.resolveOpen = false;
    this.declineOpen = false;
    this.declinePost = false;
    this.declineClose = false;
    this.commentsLoading = new Set();
    this.machineOpen = new Set(); // the folded code blocks the reader expanded
    this.commentsLoaded = new Set();
    this.search?.set_value?.("");
    this.declineReason?.set_value?.("");
  }

  switchTo(dir) {
    if (dir === this.dir) return false;
    this.resetProjectState(dir);
    return true;
  }

  /** Cache-only read via `bh issues list --state all`; triggers one deduplicated fetch if empty/stale. */
  loadList(cx, dir = projectDir(), { allowAutoFetch = false } = {}) {
    if (this.listBusy && dir === this.dir) return;
    this.switchTo(dir);
    this.listBusy = true;
    if (!this.data) this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const res = await bhJson(["issues", "list", "--state", "all"], { cwd: dir });
        if (dir !== projectDir()) return;
        if (!res) {
          this.loadError = "Couldn't read GitHub issues from bh. Check that bh is installed.";
        } else {
          this.data = res;
          this.dataRev += 1;
          this.loadError = null;
          if (!res.error) this.refreshError = null;
          if (allowAutoFetch && !this.autoFetched && !res.error && res.repo && (!res.fetchedAt || res.stale)) {
            this.autoFetched = true;
            this.refreshFromGitHub(cx, dir);
          }
        }
      } finally {
        if (dir === projectDir()) {
          this.listBusy = false;
          this.loading = false;
          cx.notify();
        }
      }
    });
  }

  /** Explicit (or single auto-stale) GitHub fetch via `bh issues fetch --state all`. */
  refreshFromGitHub(cx, dir = projectDir()) {
    if (this.fetching && dir === this.dir) return;
    this.switchTo(dir);
    this.fetching = true;
    this.refreshError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const { ok, data: res, error } = await bhCall(["issues", "fetch", "--state", "all"], { cwd: dir });
        if (dir !== projectDir()) return;
        if (!ok || !res) {
          const msg = error || "Couldn't fetch issues from GitHub. Check your network or GitHub auth.";
          if (this.data?.issues?.length) this.refreshError = msg;
          else this.loadError = msg;
        } else if (res.error) {
          if (this.data?.issues?.length) this.refreshError = typeof res.error === "string" ? res.error : res.error.message || "Refresh failed.";
          else this.data = res;
        } else {
          this.data = res;
          this.dataRev += 1;
          this.loadError = null;
          this.refreshError = null;
          this.commentsLoaded = new Set();
        }
      } finally {
        if (dir === projectDir()) {
          this.fetching = false;
          this.loading = false;
          cx.notify();
        }
      }
    });
  }

  /** Lazy-loads full issue comments once via `bh issues show <n> --refresh` (deduped & space-checked). */
  loadComments(num, dir, cx) {
    if (this.commentsLoading.has(num) || this.commentsLoaded.has(num)) return;
    this.commentsLoading.add(num);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const res = await bhJson(["issues", "show", String(num), "--refresh"], { cwd: dir });
        if (dir !== projectDir()) return;
        this.commentsLoaded.add(num);
        if (res && this.data && Array.isArray(this.data.issues)) {
          this.data.issues = this.data.issues.map((item) => (item.number === num
            ? { ...item, ...res, comments: Array.isArray(res.comments) ? res.comments : [], commentCount: Array.isArray(res.comments) ? res.comments.length : item.commentCount }
            : item));
          this.dataRev += 1;
        }
      } finally {
        if (dir === projectDir()) {
          this.commentsLoading.delete(num);
          cx.notify();
        }
      }
    });
  }

  openIssue(num, cx) {
    this.opened = num;
    this.stayClosed = false;
    this.resolveOpen = false;
    this.declineOpen = false;
    this.actionError = null;
    this.actionNotice = null;
    cx.notify();
  }

  /** Runs an issue mutation guarded against rapid double-click and space switches. */
  runAction(cx, work) {
    if (this.actionBusy) return;
    const dir = projectDir();
    this.actionBusy = true;
    this.actionError = null;
    this.actionNotice = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await work(dir, cx);
      } catch (err) {
        if (dir === projectDir()) this.actionError = err instanceof Error ? err.message : String(err);
      } finally {
        if (dir === projectDir()) {
          this.actionBusy = false;
          cx.notify();
        }
      }
    });
  }

  async openPlanById(id, dir) {
    const plan = await bhJson(["plan", "show", id], { cwd: dir });
    if (dir !== projectDir()) return;
    if (plan && !Array.isArray(plan)) openPlan(plan);
    else showPage("plans");
  }

  acceptIssue(num, cx) {
    this.resolveOpen = false;
    this.declineOpen = false;
    this.runAction(cx, async (dir, cx) => {
      const { ok, error } = await bhCall(["issues", "triage", String(num), "--decision", "accept", "--reason", "Accepted from Issues tab"], { cwd: dir });
      if (dir !== projectDir()) return;
      if (!ok) {
        this.actionError = error || `Couldn't accept issue #${num}.`;
        return;
      }
      this.actionNotice = `Accepted #${num}.`;
      this.loadList(cx, dir);
    });
  }

  toggleDecline(cx) {
    this.resolveOpen = false;
    this.declineOpen = !this.declineOpen;
    this.actionError = null;
    if (this.declineOpen) {
      this.declinePost = false;
      this.declineClose = false;
      this.declineReason.focus();
    } else {
      this.declineReason.set_value("");
    }
    cx.notify();
  }

  confirmDecline(cx) {
    const num = this.opened;
    const reason = this.declineReason.value().trim();
    if (!num || !reason) {
      this.actionError = "Enter a brief reason before declining.";
      return cx.notify();
    }
    const canWrite = Boolean(this.data?.canWrite);
    const args = ["issues", "triage", String(num), "--decision", "decline", "--reason", reason];
    if (canWrite && this.declinePost) args.push("--post-comment");
    if (canWrite && this.declineClose) args.push("--close");
    this.runAction(cx, async (dir, cx) => {
      const { ok, error } = await bhCall(args, { cwd: dir });
      if (dir !== projectDir()) return;
      if (!ok) {
        this.actionError = error || `Couldn't decline issue #${num}.`;
        return;
      }
      this.declineOpen = false;
      this.declinePost = false;
      this.declineClose = false;
      this.declineReason.set_value("");
      this.actionNotice = `Declined #${num}.`;
      this.loadList(cx, dir);
    });
  }

  fixInChat(num, cx) {
    this.resolveOpen = false;
    try {
      sendFromChat(buildFixIssuePrompt(num));
    } catch (err) {
      this.actionError = err instanceof Error ? err.message : String(err);
    }
    cx.notify();
  }

  startIssueGoal(num, maxSpendUsd, cx) {
    this.resolveOpen = false;
    this.runAction(cx, async (dir, cx) => {
      const { ok, data: res, error } = await bhCall(["issues", "bundle", String(num), "--ready", "--max-spend", String(maxSpendUsd)], { cwd: dir });
      if (dir !== projectDir()) return;
      const planId = ok ? (res?.plan?.id ?? res?.id ?? null) : null;
      if (!planId) {
        this.actionError = error || `Couldn't create Goal plan for issue #${num}.`;
        return;
      }
      this.loadList(cx, dir);
      sendFromChat(buildStartGoalPrompt(planId, num, maxSpendUsd));
    });
  }

  draftPlanForIssues(nums, cx, { clearAfter = false } = {}) {
    this.resolveOpen = false;
    this.runAction(cx, async (dir, cx) => {
      const { ok, data: res, error } = await bhCall(["issues", "bundle", ...nums.map(String)], { cwd: dir });
      if (dir !== projectDir()) return;
      const planId = ok ? (res?.plan?.id ?? res?.id ?? null) : null;
      if (!planId) {
        this.actionError = error || "Couldn't bundle the selected issue(s) into a plan.";
        return;
      }
      if (clearAfter) this.selected = clearSelection();
      this.loadList(cx, dir);
      await this.openPlanById(planId, dir);
    });
  }

  openSafeUrl(url) {
    if (isSafeExternalUrl(url)) openLink(url);
  }

  jumpToWork(act, cx) {
    if (!act) return;
    if (act.kind === "pr") return this.openSafeUrl(act.url);
    if (act.kind === "task" && act.id) {
      setShared(OPEN_TASK, { id: act.id, at: Date.now() });
      showPage("tasks");
      return;
    }
    if (act.kind === "plan" && act.id) {
      this.runAction(cx, async (dir) => this.openPlanById(act.id, dir));
    }
  }

  onKey(e, cx) {
    if (e.key !== "escape") return;
    if (this.resolveOpen) {
      this.resolveOpen = false;
      cx.stop_propagation();
      cx.notify();
    } else if (this.declineOpen) {
      this.declineOpen = false;
      this.declineReason.set_value("");
      cx.stop_propagation();
      cx.notify();
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────────────────────────

  render(cx) {
    const dir = projectDir();
    const openNow = viewShown("issues");
    if (dir !== this.dir) {
      this.switchTo(dir);
      cx.timer.after(1, (cx) => this.loadList(cx, dir, { allowAutoFetch: openNow }));
    } else if (openNow && !this.shown) {
      cx.timer.after(1, (cx) => this.loadList(cx, dir, { allowAutoFetch: true }));
    }
    this.shown = openNow;

    const c = colors();
    const content = Math.max(320, Math.min(MAX, this.width - SIZE.gutter * 2));
    const issues = Array.isArray(this.data?.issues) ? this.data.issues : [];
    const query = this.search.value();
    const counts = chipCounts(issues);
    const filtered = filterIssues(issues, { chip: this.chip, query });
    const state = classifyIssuesState({
      loading: this.loading,
      data: this.data,
      error: this.loadError,
      visibleCount: filtered.length,
      totalCount: issues.length,
    });
    const showWorkbench = state.kind === "ready" || state.kind === "empty_filter";
    const narrow = splitMode(this.width) === "narrow";

    if (showWorkbench && !narrow && !this.stayClosed && !filtered.some((i) => i.number === this.opened)) {
      this.opened = filtered[0]?.number ?? null;
    }
    const open = issues.find((i) => i.number === this.opened) ?? null;
    if (showWorkbench && open && (open.commentCount ?? 0) > 0 && !(open.comments?.length) && !this.commentsLoading.has(open.number) && !this.commentsLoaded.has(open.number)) {
      const targetNum = open.number;
      cx.timer.after(1, (cx) => this.loadComments(targetNum, dir, cx));
    }

    const hasBanner = Boolean(this.refreshError);
    const stripH = SPACE[5] + HEADER_H + GAP + (hasBanner ? BANNER_H + SPACE[3] : 0);
    const paneH = Math.max(320, this.height - stripH);

    return div()
      .id("bh-issues")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.ink)
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .on_size_change((size, cx) => {
        const zoom = Number(settings().zoom) || 1;
        this.width = size.width / zoom;
        this.height = size.height / zoom;
        cx.notify();
      })
      .child(
        v_flex()
          .id("bh-issues-shell")
          .absolute()
          .inset_0()
          .when(!showWorkbench, (el) => el.overflow_y_scroll())
          .items_center()
          .child(
            v_flex()
              .flex_none()
              .w(content)
              .pt(SPACE[5])
              .when(!showWorkbench, (el) => el.pb(SPACE[5]))
              .gap(GAP)
              .child(this.headerStrip(c))
              .when(hasBanner, (el) => el.child(this.refreshBanner(c)))
              .child(showWorkbench
                ? this.workbench(c, { issues, filtered, counts, query, open, width: content, height: paneH, narrow })
                : this.emptyState(c, state)),
          ),
      );
  }

  /** Top status strip: the repo's name, transport and the explicit Refresh button. */
  headerStrip(c) {
    const repo = this.data?.repo || "GitHub Issues";
    const transport = this.data?.transport === "gh" ? "gh CLI" : this.data?.transport === "rest" ? "REST" : null;

    return h_flex()
      .id("bh-issues-header")
      .flex_none()
      .min_h(HEADER_H)
      .px(SPACE[4])
      .py(SPACE[2])
      .gap(SPACE[3])
      .items_center()
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      // No icon in front of the title: the repo's name is the header.
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).font_semibold().text_color(c.ink).child(repo))
      .when(Boolean(transport), (el) => el.child(labelChip(c, transport)))
      .child(actionButton(c, "bh-issues-refresh", this.fetching ? "Refreshing…" : "Refresh", (_e, cx) => this.refreshFromGitHub(cx), {
        icon: "refresh-cw",
        tone: "secondary",
        disabled: this.fetching,
      }));
  }

  /** Non-blocking banner when a manual refresh failed but cached issues are still usable. */
  refreshBanner(c) {
    return h_flex()
      .id("bh-issues-refresh-err")
      .flex_none()
      .min_h(BANNER_H)
      .px(SPACE[3])
      .py(SPACE[1])
      .gap(SPACE[3])
      .items_center()
      .rounded(SIZE.control)
      .bg(alpha(c.danger, 0.1))
      .border_1()
      .border_color(alpha(c.danger, 0.35))
      .child(svg(ICON("alert-triangle")).flex_none().size(GLYPH.md).text_color(c.danger))
      .child(div().flex_1().min_w(0).truncate().text_size(TYPE.xs).text_color(c.ink).child(this.refreshError))
      .child(actionButton(c, "bh-issues-refresh-retry", "Retry", (_e, cx) => this.refreshFromGitHub(cx), { tone: "quiet" }))
      .child(actionButton(c, "bh-issues-refresh-dismiss", null, (_e, cx) => {
        this.refreshError = null;
        cx.notify();
      }, { icon: "x", tone: "quiet", tooltip: "Dismiss" }));
  }

  /** Full-page loading, remote-missing, error, empty-cache, or empty-repo stateView. */
  emptyState(c, state) {
    if (state.kind === "loading") {
      return stateView(c, { id: "bh-issues-loading", title: state.title, line: state.detail, action: null, loading: true });
    }
    const action = state.kind === "error"
      ? { label: "Retry", on: (_e, cx) => this.refreshFromGitHub(cx) }
      : state.kind === "empty_cache" || state.kind === "empty_repo"
        ? { label: this.fetching ? "Refreshing…" : "Refresh", on: (_e, cx) => this.refreshFromGitHub(cx) }
        : null;
    return stateView(c, { id: `bh-issues-${state.kind}`, title: state.title, line: state.detail, action, loading: false });
  }

  /** Split workbench: 350px left list + hairline divider + flex_1 detail pane (single scroll per pane). */
  workbench(c, { issues, filtered, counts, query, open, width, height, narrow }) {
    const listW = narrow ? width : Math.min(LIST_W, Math.floor(width * 0.44));
    const paneW = narrow ? width : Math.max(0, width - listW - HAIR);
    return h_flex()
      .w(width)
      .h(height)
      .items_start()
      .when(!narrow || !open, (el) => el.child(this.listColumn(c, { issues, filtered, counts, query, width: listW, height, narrow })))
      .when(!narrow, (el) => el.child(div().flex_none().w(HAIR).h(height).bg(c.edge)))
      .when(!narrow || Boolean(open), (el) => el.child(this.detailPane(c, open, { width: paneW, height, narrow, hasQuery: Boolean(query.trim()) })));
  }

  listColumn(c, { issues, filtered, counts, query, width, height, narrow }) {
    const hasQuery = Boolean(query.trim());
    const elig = this.selected.size > 0 ? bundleEligibility(issues, this.selected) : null;
    return v_flex()
      .flex_none()
      .w(width)
      .h(height)
      .gap(SPACE[3])
      .pr(narrow ? 0 : SPACE[4])
      .pb(SPACE[4])
      .child(h_flex().flex_none().items_center().justify_between().gap(SPACE[2])
        .child(div().text_size(TYPE.xl).font_semibold().child("Issues")))
      .child(inputBox(c, this.search, {
        icon: "search",
        clearId: "bh-issues-search-clear",
        hasValue: hasQuery,
        onClear: (_e, cx) => {
          this.search.set_value("");
          cx.notify();
        },
      }))
      .child(h_flex().role("tab_list").flex_none().flex_wrap().gap(SPACE[2]).items_center()
        .children(ISSUE_FILTERS.filter((id) => chipHasResults(counts[id], this.chip === id)).map((id) => filterChip(c, {
          id: `bh-issues-chip-${id}`,
          label: CHIP_LABELS[id],
          count: counts[id],
          on: this.chip === id,
          onClick: (_e, cx) => {
            this.chip = id;
            this.stayClosed = false;
            cx.notify();
          },
        }))))
      .when(Boolean(elig), (el) => el.child(this.bulkBar(c, elig)))
      .child(v_flex()
        .id("bh-issues-list")
        .flex_1()
        .min_h(0)
        .overflow_y_scroll()
        .gap(SPACE[1])
        .when(!filtered.length, (el) => el.child(this.emptyFilterBox(c, hasQuery)))
        .children(filtered.map((issue) => this.issueRow(c, issue))));
  }

  bulkBar(c, elig) {
    return v_flex()
      .id("bh-issues-bulk")
      .flex_none()
      .p(SPACE[3])
      .gap(SPACE[2])
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(elig.ok ? alpha(c.accent, 0.45) : alpha(c.warning, 0.5))
      .child(h_flex().items_center().gap(SPACE[2])
        .child(div().flex_1().text_size(TYPE.sm).font_medium().text_color(c.ink).child(`${elig.numbers.length} selected`))
        .child(actionButton(c, "bh-issues-bulk-clear", "Clear", (_e, cx) => {
          this.selected = clearSelection();
          cx.notify();
        }, { tone: "quiet" }))
        .child(actionButton(c, "bh-issues-bulk-bundle", "Bundle into plan", (_e, cx) => this.draftPlanForIssues(elig.numbers, cx, { clearAfter: true }), {
          tone: "primary",
          disabled: !elig.ok || this.actionBusy,
        })))
      .when(!elig.ok && Boolean(elig.reason), (el) => el.child(
        div().text_size(TYPE.xs).text_color(c.warning).child(elig.reason),
      ));
  }

  emptyFilterBox(c, hasQuery) {
    return v_flex()
      .py(SPACE[4])
      .px(SPACE[2])
      .gap(SPACE[2])
      .items_start()
      .child(div().text_size(TYPE.sm).text_color(c.muted).child(hasQuery ? "No issues match your search." : `No ${CHIP_LABELS[this.chip]?.toLowerCase() ?? ""} issues.`))
      .when(hasQuery, (el) => el.child(actionButton(c, "bh-issues-clear-filter", "Clear search", (_e, cx) => {
        this.search.set_value("");
        cx.notify();
      }, { tone: "quiet" })));
  }

  issueRow(c, issue) {
    const on = this.opened === issue.number;
    const checked = this.selected.has(issue.number);
    const closed = String(issue.state ?? "open").toLowerCase() === "closed";
    const summary = issueWorkSummary(issue);
    const age = formatRelativeAge(issue.updatedAt || issue.createdAt);
    const cCount = Number(issue.commentCount ?? issue.comments?.length ?? 0);
    const labels = Array.isArray(issue.labels) ? issue.labels.slice(0, 2) : [];

    return clickable(
      h_flex()
        .flex_none()
        .p(SPACE[3])
        .gap(SPACE[2])
        .items_start()
        .rounded(SIZE.control)
        .border_1()
        .border_color(on ? c.controlBorder : alpha(c.ground, 0))
        .when(on, (el) => el.bg(c.hover))
        .on_click((_e, cx) => this.openIssue(issue.number, cx))
        .child(checkBox(c, {
          id: `bh-issue-sel-${issue.number}`,
          checked,
          label: `Select issue #${issue.number}`,
          onToggle: (_e, cx) => {
            this.selected = toggleSelection(this.selected, issue.number);
            cx.notify();
          },
        }))
        .child(v_flex().flex_1().min_w(0).gap(SPACE[1])
          .child(h_flex().gap(SPACE[2]).items_center()
            .child(div().flex_none().text_size(TYPE.xs).font_medium().text_color(c.muted).child(`#${issue.number}`))
            .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).font_medium().text_color(closed ? c.muted : c.ink).child(issue.title || "(untitled)")))
          .when(Boolean(issue.triage || summary.pills.length || labels.length), (el) => el.child(
            h_flex().flex_wrap().gap(SPACE[1]).items_center()
              .when(issue.triage?.decision === "accept", (x) => x.child(pill(c, "Accepted", c.success)))
              .when(issue.triage?.decision === "decline", (x) => x.child(pill(c, "Declined", c.danger)))
              .children(summary.pills.map((p) => pill(c, p.label, toneColor(c, p.tone))))
              .children(labels.map((l) => labelChip(c, l))),
          ))
          .child(h_flex().gap(SPACE[3]).items_center()
            .when(Boolean(age), (x) => x.child(div().text_size(TYPE.xs).text_color(c.faint).child(age)))
            .when(cCount > 0, (x) => x.child(h_flex().gap(SPACE[1]).items_center().text_size(TYPE.xs).text_color(c.faint)
              .child(svg(ICON("comment")).size(GLYPH.xs))
              .child(String(cCount)))))),
      c,
      `bh-issue-row-${issue.number}`, { edge: true },
    );
  }

  detailPane(c, issue, { width, height, narrow, hasQuery }) {
    if (!issue) {
      return v_flex()
        .flex_1()
        .w(width)
        .h(height)
        .pl(narrow ? 0 : SPACE[4])
        .items_center()
        .justify_center()
        .child(stateView(c, {
          id: "bh-issues-none-open",
          title: "No issues match your filter",
          line: hasQuery ? "Clear the search query or pick another filter chip." : "Pick an issue from the list to inspect or resolve it.",
          action: hasQuery ? { label: "Clear search", on: (_e, cx) => {
            this.search.set_value("");
            cx.notify();
          } } : null,
          loading: false,
        }));
    }

    const summary = issueWorkSummary(issue);
    const closed = String(issue.state ?? "open").toLowerCase() === "closed";
    const safeUrl = isSafeExternalUrl(issue.url);
    const comments = Array.isArray(issue.comments) ? issue.comments : [];
    const cTotal = Math.max(comments.length, Number(issue.commentCount ?? 0));
    const loadingComments = this.commentsLoading.has(issue.number);

    return v_flex()
      .id(`bh-issue-detail-${issue.number}`)
      .flex_1()
      .min_w(0)
      .w(width)
      .h(height)
      .pl(narrow ? 0 : SPACE[4])
      .pb(SPACE[4])
      .overflow_y_scroll()
      .gap(SPACE[4])
      .when(narrow, (el) => el.child(backLink(c, "bh-issues-back", "All issues", (_e, cx) => {
        this.opened = null;
        this.stayClosed = true;
        this.resolveOpen = false;
        this.declineOpen = false;
        cx.notify();
      })))
      .child(this.detailHeader(c, issue, closed, summary))
      .child(this.actionBar(c, issue, safeUrl))
      .when(Boolean(this.actionError), (el) => el.child(div().text_size(TYPE.sm).text_color(c.danger).child(this.actionError)))
      .when(Boolean(this.actionNotice), (el) => el.child(div().text_size(TYPE.sm).text_color(c.success).child(this.actionNotice)))
      .when(this.resolveOpen, (el) => el.child(this.resolveMenuPanel(c, issue)))
      .when(this.declineOpen, (el) => el.child(this.declineBox(c, issue)))
      .child(this.untrustedNotice(c))
      .child(this.bodySection(c, issue))
      .when(cTotal > 0 || loadingComments, (el) => el.child(this.commentsSection(c, issue, comments, cTotal, loadingComments)));
  }

  detailHeader(c, issue, closed, summary) {
    const labels = Array.isArray(issue.labels) ? issue.labels : [];
    const triage = issue.triage;
    const triageText = triage
      ? `${triage.decision === "decline" ? "Declined" : "Accepted"}${triage.risk ? ` · ${triage.risk} risk` : ""}${triage.effort ? ` · ${triage.effort}` : ""}`
      : null;

    return v_flex()
      .flex_none()
      .gap(SPACE[2])
      .child(h_flex().gap(SPACE[2]).items_start()
        .child(div().flex_none().text_size(TYPE.xl).font_semibold().text_color(c.muted).child(`#${issue.number}`))
        .child(div().flex_1().min_w(0).text_size(TYPE.xl).line_height(`${LINE.xl}px`).font_semibold().text_color(c.ink).child(issue.title || "(untitled)"))
        .when(Boolean(summary.primaryAction), (el) => el.child(actionButton(
          c,
          `bh-issue-jump-${issue.number}`,
          summary.primaryAction.label,
          (_e, cx) => this.jumpToWork(summary.primaryAction, cx),
          {
            tone: "secondary",
            icon: summary.primaryAction.kind === "pr" ? "external-link" : summary.primaryAction.kind === "task" ? "page-tasks" : "page-plans",
          },
        ))))
      .child(h_flex().flex_wrap().gap(SPACE[2]).items_center()
        .child(pill(c, closed ? "Closed" : "Open", closed ? c.muted : c.success))
        .when(Boolean(triageText), (el) => el.child(pill(c, triageText, triage.decision === "decline" ? c.danger : c.success)))
        .children(summary.pills.map((p) => pill(c, p.label, toneColor(c, p.tone))))
        .children(labels.map((l) => labelChip(c, l))))
      .when(Boolean(triage?.reason), (el) => el.child(
        div().text_size(TYPE.xs).text_color(c.muted).child(`Triage note: ${triage.reason}`),
      ));
  }

  actionBar(c, issue, safeUrl) {
    const busy = this.actionBusy;
    return h_flex()
      .flex_none()
      .flex_wrap()
      .gap(SPACE[2])
      .items_center()
      .child(actionButton(c, `bh-issue-resolve-${issue.number}`, this.resolveOpen ? "Resolve ▴" : "Resolve ▾", (e, cx) => {
        cx.stop_propagation();
        this.declineOpen = false;
        this.resolveOpen = !this.resolveOpen;
        cx.notify();
      }, { tone: "primary", icon: "play", disabled: busy }))
      .child(actionButton(c, `bh-issue-accept-${issue.number}`, "Accept", (_e, cx) => this.acceptIssue(issue.number, cx), {
        tone: "secondary",
        icon: "check-circle",
        disabled: busy,
      }))
      .child(actionButton(c, `bh-issue-decline-${issue.number}`, "Decline", (_e, cx) => this.toggleDecline(cx), {
        tone: "danger",
        icon: "x-circle",
        disabled: busy,
      }))
      .child(actionButton(c, `bh-issue-gh-${issue.number}`, "GitHub", () => this.openSafeUrl(issue.url), {
        tone: "quiet",
        icon: "external-link",
        disabled: !safeUrl,
        tooltip: safeUrl ? "Open on GitHub" : "Unavailable or unsafe URL",
      }));
  }

  /** In-flow Resolve menu panel mirroring plandoc.js startMenuPanel (zero GPUI z-order clipping). */
  resolveMenuPanel(c, issue) {
    const declined = String(issue.triage?.decision ?? "").toLowerCase() === "decline";
    const row = (id, title, hint, onClick, { disabled = false, badge = null } = {}) => {
      const el = v_flex()
        .px(SPACE[3])
        .py(SPACE[2])
        .gap(1)
        .rounded(SIZE.nested)
        .when(disabled, (x) => x.opacity(0.45).cursor_not_allowed())
        .when(!disabled, (x) => x.hover((s) => s.bg(c.hover)).on_click((e, cx) => {
          cx.stop_propagation();
          onClick(e, cx);
        }))
        .child(h_flex().gap(SPACE[2]).items_center().justify_between()
          .child(div().text_size(TYPE.sm).font_medium().text_color(c.ink).child(title))
          .when(Boolean(badge), (x) => x.child(div().px(SPACE[2]).rounded_full().bg(alpha(c.accent, 0.14)).text_size(TYPE.xs).font_medium().text_color(c.accent).child(badge))))
        .child(div().text_size(TYPE.xs).text_color(c.muted).child(hint));
      return disabled ? el : clickable(el, c, id);
    };

    return v_flex()
      .id(`bh-issue-resolve-menu-${issue.number}`)
      .flex_none()
      .max_w(360)
      .p(SPACE[2])
      .gap(SPACE[1])
      .rounded(SIZE.control)
      .bg(c.fill)
      .border_1()
      .border_color(alpha(c.accent, 0.4))
      .shadow_md()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(row(
        `bh-issue-fix-${issue.number}`,
        "Fix now in chat",
        `Send issue #${issue.number} to the Orchestrator to investigate, fix, and open a PR`,
        (_e, cx) => this.fixInChat(issue.number, cx),
        { disabled: this.actionBusy },
      ))
      .child(div().h(HAIR).my(SPACE[1]).bg(c.edge))
      .children(RESOLVE_GOAL_PRESETS.map((preset) => row(
        `bh-issue-goal-${issue.number}-${preset.id}`,
        preset.label,
        declined ? "Accept this issue before bundling into a Goal" : preset.hint,
        (_e, cx) => this.startIssueGoal(issue.number, preset.maxSpendUsd, cx),
        { disabled: this.actionBusy || declined, badge: `$${preset.maxSpendUsd}` },
      )))
      .child(div().h(HAIR).my(SPACE[1]).bg(c.edge))
      .child(row(
        `bh-issue-draft-${issue.number}`,
        "Draft a plan first",
        declined ? "Accept this issue before bundling into a plan" : "Create a draft plan and open it for review",
        (_e, cx) => this.draftPlanForIssues([issue.number], cx),
        { disabled: this.actionBusy || declined },
      ));
  }

  /** Inline Decline form with reason input and auth-gated GitHub write toggles. */
  declineBox(c, issue) {
    const canWrite = Boolean(this.data?.canWrite);
    const hasReason = Boolean(this.declineReason.value().trim());
    const toggleRow = (id, label, checked, onToggle) => h_flex()
      .gap(SPACE[2])
      .items_center()
      .child(checkBox(c, { id, checked: canWrite && checked, disabled: !canWrite, label, onToggle }))
      .child(div().text_size(TYPE.sm).text_color(canWrite ? c.ink : c.faint).child(label));

    return v_flex()
      .id(`bh-issue-decline-box-${issue.number}`)
      .flex_none()
      .p(SPACE[3])
      .gap(SPACE[3])
      .rounded(SIZE.control)
      .bg(c.well)
      .border_1()
      .border_color(alpha(c.danger, 0.4))
      .child(div().text_size(TYPE.sm).font_semibold().text_color(c.ink).child(`Decline issue #${issue.number}`))
      .child(inputBox(c, this.declineReason))
      .child(v_flex().gap(SPACE[2])
        .child(toggleRow("bh-issue-decline-post", "Post rationale comment on GitHub", this.declinePost, (_e, cx) => {
          this.declinePost = !this.declinePost;
          cx.notify();
        }))
        .child(toggleRow("bh-issue-decline-close", "Also close as not planned", this.declineClose, (_e, cx) => {
          this.declineClose = !this.declineClose;
          cx.notify();
        }))
        .when(!canWrite, (el) => el.child(
          div().text_size(TYPE.xs).text_color(c.muted).child("Run gh auth login or set GH_TOKEN to post or close on GitHub"),
        )))
      .child(h_flex().gap(SPACE[2]).justify_end().items_center()
        .child(actionButton(c, "bh-issue-decline-cancel", "Cancel", (_e, cx) => this.toggleDecline(cx), { tone: "quiet" }))
        .child(actionButton(c, "bh-issue-decline-confirm", this.actionBusy ? "Declining…" : "Confirm decline", (_e, cx) => this.confirmDecline(cx), {
          tone: "danger",
          disabled: this.actionBusy || !hasReason,
        })));
  }

  /** Quiet notice marking rendered GitHub issue body and comments as read-only untrusted input. */
  untrustedNotice(c) {
    return h_flex()
      .id("bh-issues-untrusted-notice")
      .flex_none()
      .px(SPACE[3])
      .py(SPACE[2])
      .gap(SPACE[2])
      .items_center()
      .rounded(SIZE.nested)
      .bg(c.well)
      .border_1()
      .border_color(c.edge)
      .child(svg(ICON("shield-check")).flex_none().size(GLYPH.sm).text_color(c.muted))
      .child(div().text_size(TYPE.xs).text_color(c.muted).child("External GitHub content — read-only, untrusted input"));
  }

  /** Issue body rendered read-only WITHOUT linkFiles(): its fenced code is folded into mono lines. */
  bodySection(c, issue) {
    const body = String(issue.body ?? "").trim();
    const id = `bh-issue-body-${issue.number}-${this.dataRev}`;
    return v_flex()
      .flex_none()
      .p(SPACE[4])
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(body
        ? div().text_size(TYPE.md).line_height(`${LINE.md}px`).child(markdownWithFoldedCode(c, { id, text: body, open: this.machineOpen }))
        : div().text_size(TYPE.sm).text_color(c.muted).child("No description provided."));
  }

  /** Lazy-loaded GitHub comments rendered read-only WITHOUT linkFiles(), their code folded. */
  commentsSection(c, issue, comments, total, loading) {
    return v_flex()
      .flex_none()
      .gap(SPACE[3])
      .child(sectionLabel(c, `Comments (${total})`))
      .when(loading && !comments.length, (el) => el.child(
        div().text_size(TYPE.sm).text_color(c.muted).child("Loading comments…"),
      ))
      .children(comments.map((cm, idx) => v_flex()
        .id(`bh-issue-cm-${issue.number}-${idx}`)
        .flex_none()
        .p(SPACE[3])
        .gap(SPACE[2])
        .rounded(SIZE.control)
        .bg(c.fill)
        .border_1()
        .border_color(c.edge)
        .child(h_flex().gap(SPACE[2]).items_center()
          .child(div().text_size(TYPE.sm).font_semibold().text_color(c.ink).child(cm.author ? `@${cm.author}` : "Comment"))
          .when(Boolean(cm.at), (el) => el.child(div().text_size(TYPE.xs).text_color(c.faint).child(formatRelativeAge(cm.at)))))
        .child(div().text_size(TYPE.sm).line_height(`${LINE.md}px`).child(
          markdownWithFoldedCode(c, { id: `bh-issue-cm-md-${issue.number}-${idx}-${this.dataRev}`, text: String(cm.body ?? "").trim() || "(empty)", open: this.machineOpen }),
        ))));
  }
}

export default Issues;
