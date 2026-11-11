// The word that says an agent is at work: it shimmers in the agent's colour, beside a small
// motion that acts out its job. Every role has five indicators, each a verb and a motion; one is
// picked at random and after a random 30 to 60 seconds another takes its place. Every word for
// the same role shares the pick, so two places never disagree.
//
// Everything moves natively (herdr's `loop`, `frames` and `spin`, on one shared clock), so a
// working agent costs no script time and nothing runs while the word isn't shown.
//
// Drawn to scale: every length is in proportion to the word's type size (the type scale's small
// step), and lands on whole screen pixels at herdr's zoom, so a hairline is a hairline on any
// screen. The motions that follow the word (lines under it, brackets round it, sweeps across
// it) take its width as drawn, measured once per word, never a guess at the font.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { settings } from "herdr";
import { textWidth, agentHue, readable, TYPE, LINE } from "./look.js";

import { INDICATORS, roleOf, indicatorFor, alpha } from "./working.js";

export { INDICATORS, roleOf, indicatorFor, alpha };

/** Each agent type's colour, the same hues its name wears elsewhere (look.js `agentHue`). */
const ROLE_HUES = { planner: "#c4973b", agent: "#8b93a7" };

/**
 * The colour an agent's name or @mention wears everywhere: its type's colour (the same as its
 * working word and its trails), found from the roster by name or from the name itself
 * ("design-toast" is Design). An agent of no known type gets a steady hue of its own.
 */
export function mentionTone(c, name, list = []) {
  const n = String(name ?? "").replace(/^@/, "").trim().toLowerCase();
  if (!n || n === "all" || n === "everyone") return c.accent;
  const entry = list.find((a) => String(a?.name ?? "").toLowerCase() === n);
  const role = entry && entry.role && entry.role !== "custom" ? entry.role : n.split(/[-_\s.]/)[0];
  if (roleOf(role) === "agent") return readable(agentHue(n, c.accent), c.ground, 4.5, c.ink);
  return roleTone(c, role);
}

/** The working word's colour for a role: its type's hue, made readable on the ground. */
export function roleTone(c, role) {
  const key = roleOf(role);
  const hue = key === "oracle" ? c.accent
    : ROLE_HUES[key] ?? agentHue(key, c.accent);
  return readable(hue, c.ground, 4.5, c.ink);
}

/** The word's text size and line height: the type scale's small step. */
const SIZE = TYPE.sm;
const LH = LINE.sm;
/** The text size the motions' numbers were drawn at; `u` keeps them in proportion to SIZE. */
const BASE = 12;

/** herdr's zoom: what one design px is in screen px (before the system's own display scale). */
const zoom = () => Number(settings()?.zoom) || 1;

/**
 * A length from the motions' drawings, at the word's size, on whole screen pixels at herdr's
 * zoom: a 1.5 stroke is 3 pixels at zoom 1.9, never a blurred 2.85. Nothing rounds away to 0.
 */
function u(n) {
  const z = zoom();
  const v = Math.round(((n * SIZE) / BASE) * z) / z;
  return v === 0 && n !== 0 ? Math.sign(n) / z : v;
}

/** A length already in design px, on whole screen pixels at herdr's zoom. */
const snap = (v) => Math.round(v * zoom()) / zoom();

/** Each word's width as drawn, in design px (measured, so the font, zoom and DPI are all in it). */
const widths = new Map();
const widthOf = (word) => widths.get(word) ?? Math.ceil(textWidth(word, SIZE) * 1.07) + 2;

/**
 * The word reports its drawn size. Its line is LH design px tall, so its height says how many
 * reported px make one design px, whatever herdr's zoom does to the report: its width over that
 * is its width in the motions' units.
 */
function learn(word, size, cx) {
  const k = size.height / LH;
  if (!(k > 0) || !(size.width > 0)) return;
  const w = Math.round((size.width / k) * 2) / 2;
  if (Math.abs((widths.get(word) ?? -1) - w) < 0.5) return;
  widths.set(word, w);
  cx?.notify();
}

const fx = (name) => `mods/bot-herdr/icons/fx/${name}.svg`;
const ink = (name, t) => svg(fx(name)).text_color(t);
const text = (word, color) => div().h(LH).line_height(`${LH}px`).whitespace_nowrap().text_size(SIZE).font_semibold().text_color(color).child(word);
const dot = (t, size) => div().flex_none().size(size).rounded_full().bg(t);
/** A box that keeps a moving piece centred, so changing its size grows it from the middle. */
const holder = (w, h) => h_flex().flex_none().w(w).h(h).items_center().justify_center();
/** A stroke with round ends. */
const bar = (t, w, h = u(1.5)) => div().flex_none().w(w).h(h).rounded(h).bg(t);
/** Where lines under the word run: just below its line. */
const lane = () => snap(LH) + u(2);

/**
 * The word: muted, with a window in the agent's colour sweeping across it. The window and the
 * copy inside it move in opposite directions on the same clock, so the coloured letters stay
 * exactly over the muted ones. A new verb crossfades in (the chat's working line does that).
 */
function shimmer(word, tone, W) {
  const band = u(30);
  const period = 3600;
  const travel = W + u(4);
  return div()
    .absolute()
    .top(0)
    .w(band)
    .h(LH)
    .overflow_hidden()
    .loop("left", { from: -band, to: travel, period, easing: "ease-in-out" })
    .child(text(word, tone).absolute().top(0).w(travel + band).loop("left", { from: band, to: -travel, period, easing: "ease-in-out" }));
}

/** Two corner marks closing on the word and opening again (`pull`: how far they come in). */
function corners(t, W, pull, period) {
  const s = u(6);
  const b = u(1.5);
  const r = u(2);
  const y = u(pull * 0.6);
  return [
    div().absolute().w(s).h(s).border_t(b).border_l(b).border_color(t).rounded_tl(r)
      .loop("left", { from: -u(8), to: -u(8) + u(pull), period }).loop("top", { from: -u(4), to: -u(4) + y, period }),
    div().absolute().w(s).h(s).border_b(b).border_r(b).border_color(t).rounded_br(r)
      .loop("left", { from: W + u(2), to: W + u(2) - u(pull), period }).loop("top", { from: snap(LH), to: snap(LH) - y, period }),
  ];
}

/**
 * What each motion adds: `left`/`right` beside the word, `under` behind it, `over` on top of it,
 * `word` changes the word's box, `plain` drops the shimmer (the motion colours the word itself).
 */
function motion(name, t, W, c, word) {
  const L = lane();
  // The line's height on the pixel grid, so strokes measured from it stay crisp.
  const lh = snap(LH);
  switch (name) {
    // The Orchestrator.
    case "lamp":
      return { word: (el) => el.loop("opacity", { from: 0.6, to: 1, period: 2400 }) };
    case "ripple": {
      // A ring that breathes out from the word as it fades, and back in.
      const p = 2800;
      return {
        under: [div().absolute().left(-u(3)).top(-u(2)).w(W + u(6)).h(lh + u(4)).rounded(u(8)).border_1().border_color(t)
          .loop("left", { from: -u(3), to: -u(8), period: p }).loop("width", { from: W + u(6), to: W + u(16), period: p })
          .loop("top", { from: -u(2), to: -u(5), period: p }).loop("height", { from: lh + u(4), to: lh + u(10), period: p })
          .loop("opacity", { from: 0.55, to: 0, period: p })],
      };
    }
    case "twinkle":
      return { right: holder(u(12), u(12)).child(ink("star", t).w(u(10)).h(u(10)).loop("width", { from: u(4), to: u(10), period: 2600 }).loop("height", { from: u(4), to: u(10), period: 2600 }).loop("opacity", { from: 0.35, to: 1, period: 2600 })) };
    case "breathe":
      return { left: holder(u(12), u(12)).child(dot(t, u(8)).loop("width", { from: u(4), to: u(8), period: 3200 }).loop("height", { from: u(4), to: u(8), period: 3200 }).loop("opacity", { from: 0.55, to: 1, period: 3200 })) };
    case "focus":
      return { over: corners(t, W, 5, 2400) };
    // Planning.
    case "route": {
      const pitch = u(6);
      return { over: [div().absolute().left(0).top(L).h(u(2)).overflow_hidden().loop("width", { from: 0, to: W, period: 2400, easing: "linear" }).child(h_flex().w(W).gap(pitch - u(2)).children(Array.from({ length: Math.ceil(W / pitch) }, () => dot(t, u(2)))))] };
    }
    case "outline":
      return { left: div().flex_none().w(u(12)).h(u(10)).flex().flex_col().justify_between().child(bar(t, u(11))).child(div().pl(u(3)).child(bar(t, u(8)).loop("width", { from: u(2), to: u(8), period: 2400 }))).child(div().pl(u(3)).child(bar(t, u(6)).loop("width", { from: u(1), to: u(6), period: 2400, easing: "ease-in" }))) };
    case "fork":
      return { over: [div().absolute().left(0).top(L - u(1)).h(u(6)).overflow_hidden().loop("width", { from: 0, to: W, period: 2800 }).child(ink("fork", t).w(W).h(u(6)))] };
    case "brackets":
    case "braces": {
      const [l, r] = name === "brackets" ? ["[", "]"] : ["{", "}"];
      const mark = (s) => div().absolute().top(0).h(lh).line_height(`${LH}px`).text_size(SIZE).font_medium().text_color(t).child(s);
      return { pad: u(8), over: [mark(l).loop("left", { from: -u(11), to: -u(6), period: 2200 }), mark(r).loop("left", { from: W + u(5), to: W + u(1), period: 2200 })] };
    }
    case "stairs":
      return { left: div().flex_none().w(u(11)).h(u(10)).overflow_hidden().child(div().h(u(10)).overflow_hidden().loop("width", { from: 0, to: u(11), period: 2400, easing: "linear" }).child(ink("stairs", t).w(u(11)).h(u(10)))) };
    // Scout.
    case "lens":
      return { over: [div().absolute().top(u(1)).child(ink("lens", t).size(u(14))).loop("left", { from: -u(2), to: Math.max(0, W - u(12)), period: 2200 })] };
    case "radar":
      return { left: div().relative().flex_none().size(u(12)).child(ink("ring", t).absolute().top(0).left(0).size(u(12))).child(ink("sweep", t).absolute().top(0).left(0).size(u(12)).spin(1800)) };
    case "sonar":
      return { left: div().flex_none().w(u(14)).h(lh).line_height(`${LH}px`).text_size(TYPE.xs).font_semibold().text_color(t).frames([")", "))", ")))", "", ""], 280) };
    case "spotlight":
      return { under: [div().absolute().top(-u(2)).w(u(24)).h(lh + u(4)).rounded_full().bg(alpha(t, 0.2)).loop("left", { from: -u(6), to: Math.max(0, W - u(18)), period: 2600 })] };
    case "needle":
      return { left: div().relative().flex_none().size(u(12)).child(ink("ring", t).absolute().top(0).left(0).size(u(12))).child(ink("needle", t).absolute().top(0).left(0).size(u(12)).spin(2800)) };
    // Research.
    case "page":
      return { left: div().relative().flex_none().w(u(14)).h(u(12)).child(ink("book", t).absolute().top(0).left(0).w(u(14)).h(u(12))).child(div().absolute().top(u(2)).left(u(7)).h(u(8)).rounded_r(u(1)).bg(alpha(t, 0.55)).loop("width", { from: 0, to: u(5), period: 1400 })) };
    case "bookmark":
      return { right: div().relative().flex_none().w(u(8)).h(lh).child(ink("bookmark", t).absolute().left(0).w(u(7)).h(u(11)).loop("top", { from: u(1), to: u(4), period: 2600 })) };
    case "highlight":
      // A marker stroke drawn behind the lower half of the letters.
      return { under: [div().absolute().left(-u(2)).top(u(8)).h(u(8)).rounded(u(2)).bg(alpha(t, 0.24)).loop("width", { from: 0, to: W + u(4), period: 2800 })] };
    case "skim":
      return { over: [bar(t, Math.max(u(10), snap(W * 0.3))).absolute().top(L).loop("left", { from: 0, to: snap(W * 0.7), period: 1800 })] };
    case "riffle":
      return { left: div().relative().flex_none().size(u(12)).child(ink("pages", t).absolute().top(0).left(0).size(u(12))).child(div().absolute().left(u(2.5)).w(u(5)).h(u(1.5)).rounded(u(1)).bg(t).loop("top", { from: u(5), to: u(9), period: 1200 })) };
    // Dev.
    case "type": {
      // The word typed out in its colour behind a caret, then taken back, over and over; its
      // box never changes size, so nothing beside it moves.
      const p = 2600;
      const to = W + u(2);
      return {
        plain: true,
        over: [
          div().absolute().top(0).left(0).h(lh).overflow_hidden().loop("width", { from: 0, to, period: p, easing: "linear" }).child(text(word, t).absolute().top(0).left(0).w(to)),
          div().absolute().top(u(2)).w(u(1.5)).h(lh - u(4)).rounded(u(1)).bg(t).loop("left", { from: 0, to, period: p, easing: "linear" }),
        ],
      };
    }
    case "block":
      return { right: holder(u(8), lh).child(div().w(u(6)).h(u(11)).rounded(u(1)).bg(t).loop("opacity", { from: 0.15, to: 0.85, period: 1100 })) };
    case "build":
      return { over: [bar(alpha(t, 0.18), W, u(2)).absolute().left(0).top(L), bar(t, W, u(2)).absolute().left(0).top(L).loop("width", { from: 0, to: W, period: 2600, easing: "linear" })] };
    case "code":
      return { left: div().flex_none().w(u(12)).h(u(10)).flex().flex_col().justify_between().child(bar(t, u(7)).loop("width", { from: u(3), to: u(7), period: 2100 })).child(div().pl(u(3)).child(bar(t, u(8)))).child(div().pl(u(3)).child(bar(t, u(5)).loop("width", { from: u(5), to: u(1), period: 2100 }))) };
    // QA.
    case "scan":
      return {
        over: [bar(t, u(2), lh + u(4)).absolute().top(-u(2)).loop("left", { from: 0, to: W, period: 2200 })],
        right: holder(u(12), u(12)).child(ink("check", t).w(u(11)).h(u(9)).loop("opacity", { from: 0.2, to: 1, period: 2200, easing: "ease-in" })),
      };
    case "frame":
      return { over: corners(t, W, 4, 2400) };
    case "pulse":
      return { right: div().flex_none().w(u(14)).h(u(10)).overflow_hidden().child(div().h(u(10)).overflow_hidden().loop("width", { from: 0, to: u(14), period: 1600, easing: "linear" }).child(ink("pulse", t).w(u(14)).h(u(10)))) };
    case "tests": {
      const gap = u(2);
      const third = Math.floor(((W - gap * 2) / 3) * zoom()) / zoom();
      const row = (color) => h_flex().w(W).gap(gap).children([0, 1, 2].map(() => bar(color, third, u(2))));
      return { over: [row(alpha(t, 0.18)).absolute().left(0).top(L), div().absolute().left(0).top(L).h(u(2)).overflow_hidden().loop("width", { from: 0, to: W, period: 2400 }).child(row(t))] };
    }
    case "stamp":
      return { right: holder(u(14), u(14)).child(ink("stamp", t).size(u(13)).loop("opacity", { from: 0.3, to: 1, period: 2400 }).loop("width", { from: u(11), to: u(13), period: 2400 }).loop("height", { from: u(11), to: u(13), period: 2400 })) };
    // Design.
    case "sketch":
      return { over: [div().absolute().left(-u(1)).top(L).h(u(4)).overflow_hidden().loop("width", { from: 0, to: W + u(2), period: 2600 }).child(ink("sketch", t).w(W + u(2)).h(u(4)))] };
    case "swatch":
      return { left: div().flex_none().w(u(15)).h(u(9)).child(h_flex().h(u(9)).rounded(u(2.5)).overflow_hidden().loop("width", { from: u(5), to: u(15), period: 2600 }).child(div().flex_none().w(u(5)).h(u(9)).bg(t)).child(div().flex_none().w(u(5)).h(u(9)).bg(alpha(t, 0.6))).child(div().flex_none().w(u(5)).h(u(9)).bg(alpha(t, 0.28)))) };
    case "grid": {
      // Layout lines behind the word, coming up and going faint.
      const step = u(8);
      const lines = [];
      for (let x = 0; x <= W + step; x += step) lines.push(div().absolute().top(-u(3)).left(x - u(4)).w(u(1)).h(lh + u(6)).bg(t));
      for (let y = -u(3); y <= lh + u(3); y += u(7)) lines.push(div().absolute().left(-u(4)).top(y).w(W + u(8)).h(u(1)).bg(t));
      return { under: [div().absolute().top(0).left(0).w(W).h(lh).loop("opacity", { from: 0.08, to: 0.3, period: 3000 }).children(lines)] };
    }
    case "wave": {
      const span = u(12);
      const copies = Math.ceil(W / span) + 2;
      return { over: [div().absolute().left(0).top(L).w(W).h(u(4)).overflow_hidden().child(h_flex().absolute().top(0).loop("left", { from: 0, to: -span, period: 1200, easing: "linear" }).children(Array.from({ length: copies }, () => ink("wave", t).flex_none().w(span).h(u(4)))))] };
    }
    case "ruler": {
      const ticks = [];
      for (let x = 0; x <= W; x += u(5)) ticks.push(div().absolute().top(L + u(1)).left(x).w(u(1)).h(u(3)).bg(alpha(t, 0.45)));
      return { over: [...ticks, bar(t, u(1.5), u(5)).absolute().top(L).loop("left", { from: 0, to: W, period: 2400 })] };
    }
    // Anyone else.
    case "dots":
      return { right: div().flex_none().w(u(16)).h(lh).line_height(`${LH}px`).text_size(SIZE).font_semibold().text_color(c.muted).frames(["", ".", "..", "..."], 600) };
    case "glide":
      return { over: [dot(t, u(4)).absolute().top(L - u(1)).loop("left", { from: 0, to: W - u(4), period: 3200 })] };
    case "fade":
      return { word: (el) => el.loop("opacity", { from: 0.55, to: 1, period: 2600 }) };
    case "march": {
      // Three fixed places, a chevron stepping through them: nothing shifts as it goes.
      const step = (i) => ["", "", ""].map((_, j) => (j === i ? "›" : ""));
      return { right: h_flex().flex_none().h(lh).children([0, 1, 2].map((i) => div().flex_none().w(u(6)).h(lh).line_height(`${LH}px`).text_size(SIZE).font_semibold().text_color(t).frames(step(i), 160))) };
    }
    case "nudge":
      return { right: div().relative().flex_none().w(u(18)).h(u(12)).child(ink("arrow", t).absolute().top(u(1)).w(u(12)).h(u(10)).loop("left", { from: u(1), to: u(4), period: 1800 })) };
    default:
      return {};
  }
}

/**
 * The working word for a role, in the agent's colour (`tone`). `text` replaces the verb (a
 * name, say). Returns one row: the motion's piece, the word, and the motion's other piece.
 */
export function roleWord(c, { role, tone, text: given = null, id = "rw" }) {
  const { fx: name, verb } = indicatorFor(roleOf(role));
  const word = given ?? verb;
  const t = tone ?? roleTone(c, role);
  const W = snap(widthOf(word));
  const m = motion(name, t, W, c, word);
  // The muted word is in flow: the box is as wide as the text really draws, and it reports
  // that width for the motions.
  let box = div()
    .id(`${id}-${name}`)
    .relative()
    .flex_none()
    .flex()
    .h(snap(LH) + u(6))
    .children(m.under ?? [])
    .child(text(word, c.muted).id(`${id}-word`).relative().flex_none().on_size_change((size, cx) => learn(word, size, cx)))
    .when(!m.plain, (el) => el.child(shimmer(word, t, W)))
    .children(m.over ?? []);
  if (m.word) box = m.word(box);
  const side = (piece) => div().flex_none().h(LH).flex().items_center().child(piece);
  return h_flex()
    .id(id)
    .flex_none()
    .gap(u(6))
    .items_start()
    .when(Boolean(m.pad), (el) => el.pl(m.pad).pr(m.pad))
    .when(Boolean(m.left), (el) => el.child(side(m.left)))
    .child(box)
    .when(Boolean(m.right), (el) => el.child(side(m.right)));
}

export { motion };
