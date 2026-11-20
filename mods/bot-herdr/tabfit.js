// Which page tabs fit the switch's slot, and which go behind its final "More" tab. Pure, so
// `npm test` checks it; switch.js draws the result.

/** The width of tabs `list` side by side, `gap` between each. */
const span = (widths, list, gap) => list.reduce((n, i) => n + widths[i], 0) + gap * Math.max(0, list.length - 1);

/**
 * The tabs (by index) that fit `room`, in order, and the rest for the More tab (`more` px wide,
 * `gap` before it). The open tab is never hidden: it takes the last visible place, and the tab
 * it displaces goes into More.
 */
export function fitTabs(widths, room, openIndex = -1, { gap = 0, more = 0 } = {}) {
  const all = widths.map((_, i) => i);
  if (span(widths, all, gap) <= room) return { shown: all, more: [] };
  const fits = (list) => span(widths, list, gap) + gap + more <= room;
  const shown = [];
  for (const i of all) {
    if (!fits([...shown, i])) break;
    shown.push(i);
  }
  if (openIndex >= 0 && !shown.includes(openIndex)) {
    while (shown.length && !fits([...shown, openIndex])) shown.pop();
    shown.push(openIndex);
  }
  return { shown, more: all.filter((i) => !shown.includes(i)) };
}
