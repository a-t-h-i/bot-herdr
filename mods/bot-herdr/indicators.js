// The word that says an agent is at work: it shimmers in the agent's colour, beside a small
// motion that acts out its job. Every role has five indicators, each a verb and a motion; one is
// picked at random and after a random 30 to 60 seconds another takes its place. Every word for
// the same role shares the pick, so two places never disagree.
//
// Everything moves natively (herdr's `loop`, `frames` and `spin`, on one shared clock), so a
// working agent costs no script time and nothing runs while the word isn't shown.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { textWidth } from "./look.js";

import { INDICATORS, roleOf, indicatorFor, alpha, typed } from "./working.js";

export { INDICATORS, roleOf, indicatorFor, alpha, typed };

const SIZE = 12.5;
const H = 22; // the word's box: the text sits at the top, lines under it at 18 to 22
const fx = (name) => `mods/bot-herdr/icons/fx/${name}.svg`;
const ink = (name, t) => svg(fx(name)).text_color(t);

/**
 * The word: muted, with a window in the agent's colour sweeping across it. The window and the
 * copy inside it move in opposite directions on the same clock, so the coloured letters stay
 * exactly over the muted ones.
 */
function shimmer(c, word, tone, width, frames = null) {
  const band = 30;
  const period = 2600;
  const text = (color) => {
    const el = div().absolute().top(0).w(width + 12).h(18).whitespace_nowrap().text_size(SIZE).font_semibold().text_color(color);
    return frames ? el.frames(frames, Math.round(2600 / frames.length)) : el.child(word);
  };
  return [
    text(c.muted).left(0),
    div()
      .absolute()
      .top(0)
      .w(band)
      .h(18)
      .overflow_hidden()
      .loop("left", { from: -band, to: width, period, easing: "ease-in-out" })
      .child(text(tone).loop("left", { from: band, to: -width, period, easing: "ease-in-out" })),
  ];
}

const dot = (t, size) => div().flex_none().size(size).rounded_full().bg(t);
/** A box that keeps a moving piece centred, so changing its size grows it from the middle. */
const holder = (w, h) => h_flex().flex_none().w(w).h(h).items_center().justify_center();
const bar = (t, w, h = 1.5) => div().flex_none().w(w).h(h).rounded(1).bg(t);

/** What each motion adds: `left`/`right` beside the word, `over` inside its box, `word` changes to the word. */
function motion(name, t, W, c) {
  switch (name) {
    // The Orchestrator.
    case "lamp":
      return { word: (el) => el.loop("opacity", { from: 0.62, to: 1, period: 2400 }) };
    case "ripple":
      return { over: [div().absolute().top(-3).left(-6).w(W + 12).h(22).rounded(8).border_1().border_color(t).loop("opacity", { from: 0, to: 0.55, period: 2800 })] };
    case "twinkle":
      return { right: holder(12, 12).child(ink("star", t).w(10).h(10).loop("width", { from: 4, to: 10, period: 2600 }).loop("height", { from: 4, to: 10, period: 2600 }).loop("opacity", { from: 0.35, to: 1, period: 2600 })) };
    case "breathe":
      return { left: holder(12, 12).child(dot(t, 8).loop("width", { from: 4, to: 9, period: 3200 }).loop("height", { from: 4, to: 9, period: 3200 })) };
    case "focus":
      return {
        over: [
          div().absolute().w(6).h(6).border_t(1.5).border_l(1.5).border_color(t).rounded_tl(2).loop("left", { from: -8, to: -3, period: 2400 }).loop("top", { from: -4, to: -1, period: 2400 }),
          div().absolute().w(6).h(6).border_b(1.5).border_r(1.5).border_color(t).rounded_br(2).loop("left", { from: W + 2, to: W - 3, period: 2400 }).loop("top", { from: 16, to: 13, period: 2400 }),
        ],
      };
    // Planning.
    case "route":
      return { over: [div().absolute().left(0).top(19).h(3).overflow_hidden().loop("width", { from: 0, to: W, period: 2400, easing: "linear" }).child(h_flex().w(W).gap(4).children(Array.from({ length: Math.ceil(W / 6) }, () => dot(t, 2))))] };
    case "outline":
      return { left: div().flex_none().w(12).h(10).flex().flex_col().gap(2.5).child(bar(t, 11)).child(div().pl(3).child(bar(t, 8).loop("width", { from: 2, to: 8, period: 2400 }))).child(div().pl(3).child(bar(t, 6).loop("width", { from: 1, to: 6, period: 2400, easing: "ease-in" }))) };
    case "fork":
      return { over: [div().absolute().left(0).top(17).h(6).overflow_hidden().loop("width", { from: 0, to: W, period: 2800 }).child(ink("fork", t).w(W).h(6))] };
    case "brackets":
    case "braces": {
      const [l, r] = name === "brackets" ? ["[", "]"] : ["{", "}"];
      const mark = (s) => div().absolute().top(0).text_size(SIZE).font_medium().text_color(t).child(s);
      return { over: [mark(l).loop("left", { from: -11, to: -6, period: 2200 }), mark(r).loop("left", { from: W + 5, to: W + 1, period: 2200 })] };
    }
    case "stairs":
      return { left: div().flex_none().w(11).h(10).overflow_hidden().child(div().h(10).overflow_hidden().loop("width", { from: 0, to: 11, period: 2400, easing: "linear" }).child(ink("stairs", t).w(11).h(10))) };
    // Scout.
    case "lens":
      return { over: [div().absolute().top(1).child(ink("lens", t).size(15)).loop("left", { from: -2, to: Math.max(0, W - 13), period: 2200 })] };
    case "radar":
      return { left: div().relative().flex_none().size(12).child(ink("ring", t).absolute().top(0).left(0).size(12)).child(ink("sweep", t).absolute().top(0).left(0).size(12).spin(1800)) };
    case "sonar":
      return { left: div().flex_none().w(16).h(16).text_size(11).font_semibold().text_color(t).frames([")", "))", ")))", "", ""], 280) };
    case "spotlight":
      return { over: [div().absolute().top(-2).w(24).h(22).rounded_full().bg(alpha(t, 0.22)).loop("left", { from: -6, to: Math.max(0, W - 18), period: 2600 })] };
    case "needle":
      return { left: div().relative().flex_none().size(12).child(ink("ring", t).absolute().top(0).left(0).size(12)).child(ink("needle", t).absolute().top(0).left(0).size(12).spin(2800)) };
    // Research.
    case "page":
      return { left: div().relative().flex_none().w(14).h(12).child(ink("book", t).absolute().top(0).left(0).w(14).h(12)).child(div().absolute().top(2).left(7).h(8).rounded_r(1).bg(alpha(t, 0.55)).loop("width", { from: 0, to: 5, period: 1400 })) };
    case "bookmark":
      return { right: div().relative().flex_none().w(8).h(16).child(ink("bookmark", t).absolute().left(0).w(7).h(11).loop("top", { from: 1, to: 4, period: 2600 })) };
    case "highlight":
      return { over: [div().absolute().left(-2).top(9).h(9).rounded(2).bg(alpha(t, 0.22)).loop("width", { from: 0, to: W + 4, period: 2800 })] };
    case "skim":
      return { over: [div().absolute().top(19).w(Math.max(10, Math.round(W * 0.3))).h(1.5).rounded(1).bg(t).loop("left", { from: 0, to: Math.round(W * 0.7), period: 1800 })] };
    case "riffle":
      return { left: div().relative().flex_none().size(12).child(ink("pages", t).absolute().top(0).left(0).size(12)).child(div().absolute().left(2.5).w(5).h(1.25).rounded(1).bg(t).loop("top", { from: 5, to: 9, period: 1200 })) };
    // Dev.
    case "type":
      return { frames: typed };
    case "block":
      return { right: div().flex_none().w(9).h(16).text_size(13).text_color(alpha(t, 0.8)).frames(["▋", " "], 525) };
    case "build":
      return { over: [div().absolute().left(0).top(19).w(W).h(2).rounded(1).bg(alpha(t, 0.18)), div().absolute().left(0).top(19).h(2).rounded(1).bg(t).loop("width", { from: 0, to: W, period: 2600, easing: "linear" })] };
    case "code":
      return { left: div().flex_none().w(12).h(10).flex().flex_col().gap(2.5).child(bar(t, 7).loop("width", { from: 3, to: 7, period: 2100 })).child(div().pl(3).child(bar(t, 8))).child(div().pl(3).child(bar(t, 5).loop("width", { from: 5, to: 1, period: 2100 }))) };
    // QA.
    case "scan":
      return {
        over: [div().absolute().top(-2).w(2).h(20).rounded(1).bg(t).loop("left", { from: 0, to: W, period: 2200 })],
        right: holder(12, 12).child(ink("check", t).w(11).h(9).loop("opacity", { from: 0.2, to: 1, period: 2200, easing: "ease-in" })),
      };
    case "frame":
      return {
        over: [
          div().absolute().w(6).h(6).border_t(1.5).border_l(1.5).border_color(t).rounded_tl(2).loop("left", { from: -8, to: -4, period: 2400 }).loop("top", { from: -4, to: -2, period: 2400 }),
          div().absolute().w(6).h(6).border_b(1.5).border_r(1.5).border_color(t).rounded_br(2).loop("left", { from: W + 2, to: W - 2, period: 2400 }).loop("top", { from: 16, to: 14, period: 2400 }),
        ],
      };
    case "pulse":
      return { right: div().flex_none().w(14).h(10).overflow_hidden().child(div().h(10).overflow_hidden().loop("width", { from: 0, to: 14, period: 1600, easing: "linear" }).child(ink("pulse", t).w(14).h(10))) };
    case "tests": {
      const third = Math.floor((W - 4) / 3);
      const track = h_flex().absolute().left(0).top(19).w(W).gap(2).children([0, 1, 2].map(() => bar(alpha(t, 0.18), third, 2)));
      const fill = div().absolute().left(0).top(19).h(2).overflow_hidden().loop("width", { from: 0, to: W, period: 2400 }).child(h_flex().w(W).gap(2).children([0, 1, 2].map(() => bar(t, third, 2))));
      return { over: [track, fill] };
    }
    case "stamp":
      return { right: holder(14, 14).child(ink("stamp", t).size(13).loop("opacity", { from: 0.3, to: 1, period: 2400 }).loop("width", { from: 11, to: 13, period: 2400 }).loop("height", { from: 11, to: 13, period: 2400 })) };
    // Design.
    case "sketch":
      return { over: [div().absolute().left(-1).top(18).h(4).overflow_hidden().loop("width", { from: 0, to: W + 2, period: 2600 }).child(ink("sketch", t).w(W + 2).h(4))] };
    case "swatch":
      return { left: div().flex_none().w(15).h(9).child(h_flex().h(9).rounded(2.5).overflow_hidden().loop("width", { from: 5, to: 15, period: 2600 }).child(div().flex_none().w(5).h(9).bg(t)).child(div().flex_none().w(5).h(9).bg(alpha(t, 0.6))).child(div().flex_none().w(5).h(9).bg(alpha(t, 0.28)))) };
    case "grid": {
      const lines = [];
      for (let x = 0; x <= W + 10; x += 8) lines.push(div().absolute().top(-3).left(x - 5).w(1).h(24).bg(t));
      for (const y of [-3, 4, 11, 18]) lines.push(div().absolute().left(-5).top(y).w(W + 10).h(1).bg(t));
      return { over: [div().absolute().top(0).left(0).w(W).h(18).loop("opacity", { from: 0.06, to: 0.24, period: 3000 }).children(lines)] };
    }
    case "wave": {
      const copies = Math.ceil(W / 12) + 2;
      return { over: [div().absolute().left(0).top(18).w(W).h(4).overflow_hidden().child(h_flex().absolute().top(0).loop("left", { from: 0, to: -12, period: 1200, easing: "linear" }).children(Array.from({ length: copies }, () => ink("wave", t).flex_none().w(12).h(4))))] };
    }
    case "ruler": {
      const ticks = [];
      for (let x = 0; x <= W; x += 5) ticks.push(div().absolute().top(19).left(x).w(1).h(3).bg(alpha(t, 0.45)));
      return { over: [...ticks, div().absolute().top(18).w(1.5).h(5).rounded(1).bg(t).loop("left", { from: 0, to: W, period: 2400 })] };
    }
    // Anyone else.
    case "dots":
      return { right: div().flex_none().w(16).h(18).text_size(SIZE).font_semibold().text_color(c.muted).frames(["", ".", "..", "..."], 350) };
    case "glide":
      return { over: [dot(t, 4).absolute().top(19).loop("left", { from: 0, to: W - 4, period: 2000 })] };
    case "fade":
      return { word: (el) => el.loop("opacity", { from: 0.4, to: 1, period: 1600 }) };
    case "march":
      return { right: div().flex_none().w(18).h(18).text_size(12).font_semibold().text_color(t).frames(["›  ", " › ", "  ›"], 220) };
    case "nudge":
      return { right: div().relative().flex_none().w(18).h(12).child(ink("arrow", t).absolute().top(1).w(12).h(10).loop("left", { from: 1, to: 5, period: 1100 })) };
    default:
      return {};
  }
}

/**
 * The working word for a role, in the agent's colour (`tone`). `text` replaces the verb (a
 * name, say). Returns one row: the motion's piece, the word, and the motion's other piece.
 */
export function roleWord(c, { role, tone, text = null, id = "rw" }) {
  const { fx: name, verb } = indicatorFor(roleOf(role));
  const word = text ?? verb;
  const t = tone ?? c.accent;
  const W = Math.ceil(textWidth(word, SIZE) * 1.07) + 2;
  const m = motion(name, t, W, c);
  const frames = m.frames ? m.frames(word) : null;
  let box = div().id(`${id}-${name}`).relative().flex_none().w(W).h(H).children(shimmer(c, word, t, W, frames)).children(m.over ?? []);
  if (m.word) box = m.word(box);
  return h_flex()
    .id(id)
    .flex_none()
    .gap(5)
    .items_start()
    .when(Boolean(m.left), (el) => el.child(div().flex_none().h(18).flex().items_center().child(m.left)))
    .when(Boolean(m.over?.length) && ["brackets", "braces"].includes(name), (el) => el.pl(8).pr(8))
    .child(box)
    .when(Boolean(m.right), (el) => el.child(div().flex_none().h(18).flex().items_center().child(m.right)));
}

export { motion };
