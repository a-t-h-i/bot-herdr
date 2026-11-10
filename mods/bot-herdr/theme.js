// The colours to draw with now: ours (look.js) on the layout's own theme, else the herdr theme
// the person picked, turned into our tokens.

import { settings, theme } from "herdr";
import { palette } from "./look.js";

export const colors = () => palette(settings(), theme());
