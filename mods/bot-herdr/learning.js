// The Learning page (Guided Chapters index) and the fullscreen LearningDoc reader overlay.
// Reads cached lessons via `bh learn list` / `bh learn show` on mount and tab/project switch;
// never triggers automatic LLM calls on mount and never polls on a timer.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { props, settings, shared, setShared, openOverlay, closeOverlay } from "herdr";
import { SIZE, ICON, TYPE, TYPE_SCALE, LINE, SPACE, CONTROL, HAIR, GLYPH, clickable } from "./look.js";
import { actionButton } from "./button.js";
import { stateView, pill } from "./switch.js";
import { sectionLabel } from "./plandoc.js";
import { colors } from "./theme.js";
import { activePage, sendFromChat } from "./pages.js";
import { bh, bhJson, projectDir } from "./bh.js";
import { alpha } from "./working.js";
import {
  isSafeExternalUrl,
  safeLinks,
  isValidSlug,
  readProgress,
  filterLessons,
  groupByChapter,
  learningViewState,
  buildRefreshGuidesPrompt,
  buildScanRepoPrompt,
  formatUpdated,
  primarySourceLabel,
} from "./learningview.js";

/** Shared timestamp bumped whenever a guide's read state changes inside LearningDoc. */
export const LEARN_UPDATED = "bot-herdr.learn.updated";

const LIST_MAX = 860;
const DOC_MAX = 760;
const GAP = 16;

/** Opens a learning guide in the fullscreen in-app reader overlay. */
export function openLesson(slug, cwd = projectDir()) {
  if (!isValidSlug(slug)) return null;
  return openOverlay({
    mod: "bot-herdr",
    kind: "dialog",
    frame: "none",
    width: 0.9,
    height: 0.9,
    props: { view: "learning-doc", slug, cwd },
  });
}

/** Quiet single-line search input box matching the app's search controls. */
function searchBox(c, state, { hasValue, onClear }) {
  return h_flex()
    .flex_none()
    .h(CONTROL)
    .px(SPACE[3])
    .gap(SPACE[2])
    .items_center()
    .rounded(SIZE.control)
    .bg(c.ground)
    .border_1()
    .border_color(c.edge)
    .child(svg(ICON("search")).flex_none().size(GLYPH.sm).text_color(c.faint))
    .child(Input.new(state).flex_1().min_w(0).h_full().text_size(TYPE.sm).text_color(c.ink))
    .when(hasValue, (el) => el.child(
      actionButton(c, "bh-learn-search-clear", null, onClear, {
        icon: "x",
        tone: "quiet",
        tooltip: "Clear search",
        a11y: "Clear search",
      }),
    ));
}

/** Quiet neutral metadata tag for a lesson's primary provenance source. */
function sourcePill(c, label) {
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
    .child(label);
}

/** Circular read-state indicator: green check when read, quiet hollow circle when unread. */
function readCheck(c, read) {
  return div()
    .flex_none()
    .size(20)
    .rounded_full()
    .flex()
    .items_center()
    .justify_center()
    .border_1()
    .border_color(read ? c.success : c.edge)
    .bg(read ? alpha(c.success, 0.14) : c.well)
    .when(read, (el) => el.text_size(TYPE.xs).font_semibold().text_color(c.success).child("✓"));
}

/** Read-progress bar with accessible progress_indicator role. */
function readProgressBar(c, prog) {
  return h_flex()
    .flex_1()
    .min_w(200)
    .gap(SPACE[3])
    .items_center()
    .child(
      div()
        .role("progress_indicator")
        .accessibility_label(`${prog.read} of ${prog.total} concepts read`)
        .flex_1()
        .min_w(100)
        .h(6)
        .rounded_full()
        .bg(c.well)
        .overflow_hidden()
        .when(prog.percent > 0, (el) => el.child(
          div().h_full().w(`${prog.percent}%`).rounded_full().bg(c.success),
        )),
    )
    .child(div().flex_none().text_size(TYPE.xs).font_medium().text_color(c.muted)
      .child(`${prog.read} of ${prog.total} concepts read`));
}

/** Inline status/error notice bar inside the reader overlay. */
function noticeBanner(c, notice, onDismiss) {
  const tone = notice.tone === "danger" ? c.danger : notice.tone === "success" ? c.success : c.info;
  const icon = notice.tone === "danger" ? "alert-triangle" : notice.tone === "success" ? "check-circle" : "info";
  return h_flex()
    .id("bh-learn-doc-notice")
    .role("status")
    .flex_none()
    .px(SPACE[5])
    .py(SPACE[2])
    .gap(SPACE[3])
    .items_center()
    .bg(alpha(tone, 0.1))
    .border_b_1()
    .border_color(alpha(tone, 0.3))
    .child(svg(ICON(icon)).flex_none().size(GLYPH.md).text_color(tone))
    .child(div().flex_1().min_w(0).text_size(TYPE.xs).text_color(c.ink).child(notice.text))
    .child(actionButton(c, "bh-learn-doc-notice-close", null, onDismiss, {
      icon: "x",
      tone: "quiet",
      tooltip: "Dismiss",
      a11y: "Dismiss notice",
    }));
}

export class Learning {
  init(_given, cx) {
    this.dir = projectDir();
    this.width = 960;
    this.shown = activePage() === "learning";
    this.updatedAt = Number(shared(LEARN_UPDATED) ?? 0);
    this.search = InputState.new({ placeholder: "Search concepts or decisions…" });
    this.search.on("change", (_e, cx) => cx.notify());
    this.resetState(this.dir);
    this.load(cx, this.dir);
  }

  resetState(dir) {
    this.dir = dir;
    this.lessons = [];
    this.candidatesCount = 0;
    this.updated = null;
    this.loading = true;
    this.busy = false;
    this.error = null;
    this.search?.set_value?.("");
  }

  /** Reads cached Learning guides via `bh learn list --json` (never triggers LLM calls). */
  load(cx, dir = projectDir()) {
    if (this.busy && dir === this.dir) return;
    if (dir !== this.dir) this.resetState(dir);
    this.busy = true;
    if (!this.lessons.length) this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const res = await bhJson(["learn", "list"], { cwd: dir });
        if (dir !== projectDir()) return;
        if (!res) {
          this.error = "Couldn't read learning guides from bh.";
        } else {
          this.lessons = Array.isArray(res.lessons) ? res.lessons : [];
          this.candidatesCount = Number(res.candidatesCount ?? 0);
          this.updated = res.updated ?? null;
          this.error = null;
        }
      } finally {
        if (dir === projectDir()) {
          this.busy = false;
          this.loading = false;
          cx.notify();
        }
      }
    });
  }

  syncContext(cx) {
    const dir = projectDir();
    const openNow = activePage() === "learning";
    const sharedAt = Number(shared(LEARN_UPDATED) ?? 0);
    if (dir !== this.dir) {
      this.resetState(dir);
      cx.timer.after(1, (cx) => this.load(cx, dir));
    } else if (sharedAt > this.updatedAt) {
      this.updatedAt = sharedAt;
      cx.timer.after(1, (cx) => this.load(cx, dir));
    } else if (openNow && !this.shown) {
      cx.timer.after(1, (cx) => this.load(cx, dir));
    }
    this.shown = openNow;
  }

  render(cx) {
    this.syncContext(cx);
    const c = colors();
    const query = this.search.value();
    const filtered = filterLessons(this.lessons, query);
    const state = learningViewState({
      loading: this.loading,
      error: this.error,
      lessons: this.lessons,
      filtered,
    });
    const content = Math.max(320, Math.min(LIST_MAX, this.width - SIZE.gutter * 2));

    return div()
      .id("bh-learning")
      .relative()
      .size_full()
      .bg(c.ground)
      .text_color(c.ink)
      .on_size_change((size, cx) => {
        const zoom = Number(settings().zoom) || 1;
        this.width = size.width / zoom;
        cx.notify();
      })
      .child(
        v_flex()
          .id("bh-learning-scroll")
          .absolute()
          .inset_0()
          .overflow_y_scroll()
          .items_center()
          .child(
            v_flex()
              .flex_none()
              .w(content)
              .max_w(LIST_MAX)
              .py(SPACE[5])
              .gap(GAP)
              .child(this.heroCard(c, query))
              .child(this.body(c, state, filtered)),
          ),
      );
  }

  heroCard(c, query) {
    const prog = readProgress(this.lessons);
    const pending = this.candidatesCount;
    const pendingLabel = pending === 1 ? "1 new decision to explain" : `${pending} new decisions to explain`;
    return v_flex()
      .id("bh-learning-hero")
      .flex_none()
      .p(SPACE[5])
      .gap(SPACE[4])
      .rounded(SIZE.radius)
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .child(
        h_flex()
          .gap(SPACE[4])
          .items_start()
          .flex_wrap()
          .child(
            h_flex()
              .flex_1()
              .min_w(260)
              .gap(SPACE[3])
              .items_start()
              .child(
                v_flex()
                  .flex_1()
                  .min_w(0)
                  .gap(SPACE[1])
                  .child(div().text_size(TYPE_SCALE.title).line_height(`${LINE.lg}px`).font_semibold().text_color(c.textPrimary)
                    .child("Repo Learning Guide"))
                  .child(div().text_size(TYPE_SCALE.body).line_height(`${LINE.md}px`).text_color(c.textSecondary)
                    .child("Short concept primers built from your team's knowledge and the architectural decisions you made.")),
              ),
          )
          .child(
            h_flex()
              .flex_none()
              .gap(SPACE[2])
              .items_center()
              .child(actionButton(c, "bh-learn-scan", "Scan repo", () => sendFromChat(buildScanRepoPrompt()), {
                icon: "search",
                tone: "secondary",
              }))
              .child(actionButton(c, "bh-learn-refresh", "Refresh guides", () => sendFromChat(buildRefreshGuidesPrompt(pending)), {
                icon: "refresh-cw",
                tone: "primary",
              })),
          ),
      )
      .child(
        h_flex()
          .gap(SPACE[3])
          .items_center()
          .flex_wrap()
          .child(readProgressBar(c, prog))
          .when(pending > 0, (el) => el.child(pill(c, pendingLabel, c.warning))),
      )
      .child(searchBox(c, this.search, {
        hasValue: Boolean(query.trim()),
        onClear: (_e, cx) => {
          this.search.set_value("");
          cx.notify();
        },
      }));
  }

  body(c, state, filtered) {
    if (state === "loading") {
      return stateView(c, {
        id: "bh-learning-loading",
        title: "Loading learning guides…",
        line: "Reading cached repo and decision primers.",
        action: null,
        loading: true,
      });
    }
    if (state === "error") {
      return stateView(c, {
        id: "bh-learning-error",
        title: "Couldn't load learning guides",
        line: this.error,
        action: { label: "Retry", on: (_e, cx) => this.load(cx, projectDir()) },
        loading: false,
      });
    }
    if (state === "empty") {
      return v_flex()
        .id("bh-learning-empty-wrap")
        .items_center()
        .gap(SPACE[3])
        .child(stateView(c, {
          id: "bh-learning-empty",
          title: "No learning guides yet",
          line: "Generate plain-English guides from your team's decisions and knowledge, or scan the repo for core concepts.",
          action: null,
          loading: false,
        }))
        .child(
          h_flex()
            .gap(SPACE[2])
            .items_center()
            .child(actionButton(c, "bh-learn-empty-refresh", "Refresh guides", () => sendFromChat(buildRefreshGuidesPrompt(this.candidatesCount)), {
              icon: "refresh-cw",
              tone: "primary",
            }))
            .child(actionButton(c, "bh-learn-empty-scan", "Scan repo", () => sendFromChat(buildScanRepoPrompt()), {
              icon: "search",
              tone: "secondary",
            })),
        );
    }
    if (state === "no-matches") {
      return stateView(c, {
        id: "bh-learning-no-matches",
        title: "No guides match your search",
        line: "Try another term or clear the search input.",
        action: {
          label: "Clear search",
          on: (_e, cx) => {
            this.search.set_value("");
            cx.notify();
          },
        },
        loading: false,
      });
    }
    return v_flex()
      .flex_none()
      .gap(GAP)
      .children(groupByChapter(filtered).map((ch) => this.chapterSection(c, ch)));
  }

  chapterSection(c, chapter) {
    return v_flex()
      .id(`bh-learn-chapter-${chapter.id}`)
      .flex_none()
      .gap(SPACE[3])
      .child(
        h_flex()
          .flex_none()
          .gap(SPACE[3])
          .items_center()
          .child(div().flex_none().text_size(TYPE.xs).font_semibold().text_color(c.muted)
            .child(chapter.title.toUpperCase()))
          .child(div().flex_1().h(HAIR).bg(c.edge))
          .child(div().flex_none().text_size(TYPE.xs).text_color(c.faint)
            .child(String(chapter.items.length))),
      )
      .child(
        v_flex()
          .rounded(SIZE.radius)
          .bg(c.fill)
          .border_1()
          .border_color(c.edge)
          .overflow_hidden()
          .children(chapter.items.map((lesson, i) => this.lessonRow(c, lesson, i > 0))),
      );
  }

  lessonRow(c, lesson, hasTopBorder) {
    const mins = Math.max(1, Number(lesson.readMins) || 2);
    const linksCount = safeLinks(lesson.links).length;
    const meta = `${mins} min · ${linksCount} ${linksCount === 1 ? "link" : "links"}`;
    const row = h_flex()
      .flex_none()
      .px(SPACE[4])
      .py(SPACE[4])
      .gap(SPACE[3])
      .items_center()
      .when(hasTopBorder, (el) => el.border_t_1().border_color(c.edge))
      .on_click(() => openLesson(lesson.slug, projectDir()))
      .child(readCheck(c, Boolean(lesson.read)))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(SPACE[1])
          .child(
            h_flex()
              .gap(SPACE[2])
              .items_center()
              .flex_wrap()
              .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).font_semibold().text_color(c.ink)
                .child(lesson.title || lesson.slug))
              .child(sourcePill(c, primarySourceLabel(lesson)))
              .when(Boolean(lesson.stale), (el) => el.child(pill(c, "Stale", c.warning))),
          )
          .when(Boolean(lesson.summary), (el) => el.child(
            div().truncate().text_size(TYPE.sm).line_height(`${LINE.sm}px`).text_color(c.muted)
              .child(lesson.summary),
          )),
      )
      .child(
        h_flex()
          .flex_none()
          .gap(SPACE[3])
          .items_center()
          .child(div().flex_none().text_size(TYPE.xs).text_color(c.muted).child(meta))
          .child(div().flex_none().text_size(TYPE.sm).font_medium().text_color(c.accent).child("Open →")),
      );
    return clickable(row, c, `bh-learn-row-${lesson.slug}`);
  }
}

export class LearningDoc {
  init(given, cx) {
    this.p = given ?? props() ?? {};
    this.slug = String(this.p.slug ?? "");
    this.cwd = this.p.cwd || projectDir();
    this.lesson = null;
    this.loading = true;
    this.error = null;
    this.actionBusy = false;
    this.exportNotice = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.load(cx);
  }

  load(cx) {
    if (!isValidSlug(this.slug)) {
      this.loading = false;
      this.error = "Invalid learning guide identifier.";
      cx.notify();
      return;
    }
    this.loading = true;
    this.error = null;
    cx.spawn(async (cx) => {
      try {
        const res = await bhJson(["learn", "show", this.slug], { cwd: this.cwd });
        if (!res || res.ok === false || !res.slug) {
          this.error = res?.error || "Couldn't load this learning guide.";
        } else {
          this.lesson = res;
          this.error = null;
        }
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  close() {
    closeOverlay(props()?.overlay ?? this.p.overlay);
  }

  toggleRead(cx) {
    if (this.actionBusy || !this.lesson) return;
    const wasRead = Boolean(this.lesson.read);
    this.actionBusy = true;
    this.exportNotice = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const args = ["learn", "read", this.slug, ...(wasRead ? ["--unread"] : [])];
        const res = await bhJson(args, { cwd: this.cwd });
        if (res?.ok) {
          this.lesson = { ...this.lesson, read: Boolean(res.read), readAt: res.readAt ?? null };
          setShared(LEARN_UPDATED, Date.now());
        } else {
          this.exportNotice = { tone: "danger", text: res?.error || "Couldn't update read status." };
        }
      } finally {
        this.actionBusy = false;
        cx.notify();
      }
    });
  }

  exportFormat(kind, cx) {
    if (this.actionBusy || !this.lesson) return;
    this.actionBusy = true;
    this.exportNotice = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const res = await bhJson(["learn", kind, this.slug, "--open"], { cwd: this.cwd });
        if (!res?.ok) {
          const fallback = kind === "pdf" ? "Couldn't export PDF." : "Couldn't open HTML guide.";
          this.exportNotice = { tone: "danger", text: res?.error || fallback };
        } else {
          const msg = kind === "pdf"
            ? (res.path ? `Exported PDF: ${res.path}` : "Exported PDF.")
            : "Opened standalone HTML guide in your browser.";
          this.exportNotice = { tone: "success", text: msg };
        }
      } finally {
        this.actionBusy = false;
        cx.notify();
      }
    });
  }

  openExternal(url) {
    if (isSafeExternalUrl(url)) bh(["open", url]);
  }

  render(cx) {
    const c = colors();
    return v_flex()
      .id("bh-learning-doc")
      .role("dialog")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key !== "escape") return;
        this.close();
        cx.stop_propagation();
      })
      .size_full()
      .bg(c.fill)
      .border_1()
      .border_color(c.edge)
      .rounded(SIZE.radius)
      .overflow_hidden()
      .text_color(c.ink)
      .child(this.header(c))
      .when(Boolean(this.exportNotice), (el) => el.child(noticeBanner(c, this.exportNotice, (_e, cx) => {
        this.exportNotice = null;
        cx.notify();
      })))
      .child(this.articleBody(c))
      .child(this.footer(c));
  }

  header(c) {
    const lesson = this.lesson;
    const title = lesson?.title || this.slug || "Learning Guide";
    const mins = Math.max(1, Number(lesson?.readMins) || 2);
    const read = Boolean(lesson?.read);
    const chapterLabel = lesson?.chapter === "decisions" ? "Your decision" : "Architecture";
    const chapterTone = lesson?.chapter === "decisions" ? c.accent : c.info;

    return h_flex()
      .id("bh-learn-doc-header")
      .flex_none()
      .min_h(52)
      .px(SPACE[5])
      .py(SPACE[3])
      .gap(SPACE[3])
      .items_center()
      .flex_wrap()
      .bg(c.fill)
      .border_b_1()
      .border_color(c.edge)
      .child(
        h_flex()
          .flex_1()
          .min_w(220)
          .gap(SPACE[2])
          .items_center()
          .child(div().flex_none().text_size(TYPE.sm).text_color(c.muted).child("Learning ›"))
          .child(div().flex_1().min_w(0).truncate().text_size(TYPE.md).font_semibold().text_color(c.ink).child(title))
          .when(Boolean(lesson), (el) => el.child(pill(c, chapterLabel, chapterTone)))
          .when(Boolean(lesson), (el) => el.child(pill(c, `${mins} min read`, c.muted))),
      )
      .child(
        h_flex()
          .flex_none()
          .gap(SPACE[2])
          .items_center()
          .flex_wrap()
          .child(actionButton(
            c,
            "bh-learn-doc-read",
            read ? "✓ Understood" : "Mark understood",
            (_e, cx) => this.toggleRead(cx),
            { tone: read ? "secondary" : "primary", disabled: this.actionBusy || !lesson },
          ))
          .child(actionButton(
            c,
            "bh-learn-doc-html",
            "Open HTML ↗",
            (_e, cx) => this.exportFormat("html", cx),
            { tone: "secondary", disabled: this.actionBusy || !lesson },
          ))
          .child(actionButton(
            c,
            "bh-learn-doc-pdf",
            "Export PDF",
            (_e, cx) => this.exportFormat("pdf", cx),
            { tone: "secondary", disabled: this.actionBusy || !lesson },
          ))
          .child(actionButton(
            c,
            "bh-learn-doc-close",
            "✕ Esc",
            () => this.close(),
            { tone: "quiet", tooltip: "Close (Esc)" },
          )),
      );
  }

  articleBody(c) {
    if (this.loading) {
      return v_flex().flex_1().min_h(0).bg(c.ground).items_center().justify_center()
        .child(stateView(c, { id: "bh-learn-doc-loading", title: "Loading guide…", line: "Reading lesson content.", action: null, loading: true }));
    }
    if (this.error || !this.lesson) {
      return v_flex().flex_1().min_h(0).bg(c.ground).items_center().justify_center()
        .child(stateView(c, {
          id: "bh-learn-doc-error",
          title: "Couldn't open guide",
          line: this.error || "Guide not found.",
          action: { label: "Retry", on: (_e, cx) => this.load(cx) },
          loading: false,
        }));
    }

    const lesson = this.lesson;
    const links = safeLinks(lesson.links);
    const whyRepo = typeof lesson.whyRepo === "string" ? lesson.whyRepo.trim() : "";

    return v_flex()
      .id("bh-learn-doc-scroll")
      .flex_1()
      .min_h(0)
      .overflow_y_scroll()
      .items_center()
      .bg(c.ground)
      .child(
        v_flex()
          .flex_none()
          .w_full()
          .max_w(DOC_MAX)
          .px(SPACE[5])
          .py(SPACE[5])
          .gap(SPACE[4])
          .child(
            v_flex()
              .gap(SPACE[2])
              .child(div().text_size(TYPE.xl).line_height(`${LINE.xl}px`).font_semibold().text_color(c.ink)
                .child(lesson.title || lesson.slug))
              .when(Boolean(lesson.summary), (el) => el.child(
                div().text_size(TYPE.md).line_height(`${LINE.lg}px`).text_color(c.muted).child(lesson.summary),
              )),
          )
          .when(Boolean(whyRepo), (el) => el.child(this.whyRepoCallout(c, lesson, whyRepo)))
          .child(
            v_flex()
              .flex_none()
              .p(SPACE[5])
              .rounded(SIZE.radius)
              .bg(c.fill)
              .border_1()
              .border_color(c.edge)
              .child(
                div()
                  .text_size(TYPE.md)
                  .line_height(`${LINE.md}px`)
                  .text_color(c.ink)
                  .child(
                    TextView.markdown(`bh-learn-md-${this.slug}`, String(lesson.markdown ?? ""))
                      .selectable(true)
                      .on_link_click((url) => this.openExternal(url)),
                  ),
              ),
          )
          .when(links.length > 0, (el) => el.child(this.linksSection(c, links))),
      );
  }

  whyRepoCallout(c, lesson, whyRepo) {
    return v_flex()
      .id("bh-learn-doc-why")
      .flex_none()
      .p(SPACE[4])
      .gap(SPACE[2])
      .rounded(SIZE.nested)
      .bg(alpha(c.accent, 0.08))
      .border_l_4()
      .border_color(c.accent)
      .child(div().text_size(TYPE.xs).font_semibold().text_color(c.accent).child("WHY THIS MATTERS IN THIS REPO"))
      .child(div().text_size(TYPE.md).line_height(`${LINE.md}px`).text_color(c.ink).child(whyRepo))
      .child(div().text_size(TYPE.xs).text_color(c.muted).child(`Source: ${primarySourceLabel(lesson)}`));
  }

  linksSection(c, links) {
    return v_flex()
      .id("bh-learn-doc-links")
      .flex_none()
      .gap(SPACE[3])
      .child(sectionLabel(c, "Learn more (opens in your browser)"))
      .child(
        h_flex()
          .flex_wrap()
          .gap(SPACE[2])
          .items_center()
          .children(links.map((link, i) => clickable(
            h_flex()
              .role("link")
              .flex_none()
              .px(SPACE[3])
              .py(SPACE[2])
              .gap(SPACE[2])
              .items_center()
              .rounded(SIZE.control)
              .bg(c.fill)
              .border_1()
              .border_color(c.edge)
              .tooltip(link.url)
              .on_click(() => this.openExternal(link.url))
              .child(svg(ICON("external-link")).flex_none().size(GLYPH.sm).text_color(c.accent))
              .child(div().text_size(TYPE.sm).font_medium().text_color(c.ink).child(link.title))
              .when(Boolean(link.note), (el) => el.child(
                div().text_size(TYPE.xs).text_color(c.muted).child(`· ${link.note}`),
              )),
            c,
            `bh-learn-link-${i}`,
          ))),
      );
  }

  footer(c) {
    const lesson = this.lesson;
    const source = lesson ? primarySourceLabel(lesson) : "";
    const updated = lesson?.updated ? formatUpdated(lesson.updated) : "";
    const left = [source ? `Source: ${source}` : "", updated ? `Updated ${updated}` : ""].filter(Boolean).join(" · ");

    return h_flex()
      .id("bh-learn-doc-footer")
      .flex_none()
      .min_h(36)
      .px(SPACE[5])
      .py(SPACE[2])
      .gap(SPACE[3])
      .items_center()
      .justify_between()
      .flex_wrap()
      .bg(c.fill)
      .border_t_1()
      .border_color(c.edge)
      .child(div().text_size(TYPE.xs).text_color(c.muted).child(left))
      .child(div().text_size(TYPE.xs).text_color(c.faint).child("Click any link to open in system browser · Esc to close"));
  }
}

export default Learning;
