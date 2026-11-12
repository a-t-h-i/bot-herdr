// The colours to draw with now: ours (look.js) on the layout's own theme, else the herdr theme
// the user picked, turned into our tokens.

import { settings, theme, themes } from "herdr";
import { palette } from "./look.js";

// A theme's own light/dark decides which way the palette repairs a colour; the app's own setting
// is the fallback for a name themes() doesn't list.
const polarity = new Map();

function darkOf(name, fallback) {
  if (!name) return fallback;
  if (!polarity.has(name)) {
    const found = themes().find((x) => x.name === name);
    polarity.set(name, found ? !found.light : null);
  }
  return polarity.get(name) ?? fallback;
}

export const colors = () => {
  const s = settings();
  return palette({ ...s, dark: darkOf(s.theme, Boolean(s.dark)) }, theme());
};
