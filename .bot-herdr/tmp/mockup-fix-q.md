Interactive HTML can't run inside herdr itself. Mods have no web view: they can show images, plus HTML as plain text with no CSS and no scripts. So a mockup you can click through has to open in a real browser, and this machine doesn't have one.

Installing Chromium covers both cases. Agents' mockups show up as pictures in the chat and question cards (it draws them headless), and "Open in browser" opens the interactive page, if herdr's display can show a Chromium window.

1. [ORCHESTRATOR] How should I fix mockups?
   - Install Chromium (Recommended) — `pacman -S chromium` (about 100 MB). Pictures in the chat, and interactive in a browser window. No code changes.
   - Pictures only, no browser — Add npm packages (satori and resvg) to draw stills. Flexbox CSS only, nothing interactive.
   - Text fallback only — Show the mockup's HTML as code when it can't be drawn.
