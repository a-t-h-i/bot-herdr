# design panel — contrast, attach picker, UI review

## Status
OPEN

## Findings

### 1. How the colours are picked (theme path)

`colors()` is one line: `palette(settings(), theme())` — `mods/bot-herdr/theme.js:5`. Every view calls it per render.

- `mods/bot-herdr/look.js:159` `ownTheme()`: `bot-herdr*` (or no theme named) → our `LIGHT`/`DARK`, untouched.
- `mods/bot-herdr/look.js:170-215` `palette()`: for any other theme, every token comes from herdr's `theme()` map.
- herdr names the same keys in every theme (`mods/bot-herdr/gpui-kit.d.ts:22460-22465`): `canvas surface raised popover chrome border input hover selected foreground muted dim accent accent_foreground ansi0..15`.
- Built-in themes: `graphite ink moss` (dark), `paper` (light); `themes/*.json` adds `atom-one-dark` and `win98` — `~/.config/herdr-app/AGENTS.md:319-332`. A theme file without a `colors` block (`atom-one-dark`) gets panel colours **derived** by herdr, so we get a derivation of a derivation.
- Rest of the pipeline: `mods/bot-herdr/chat.js:584` (page bg `c.ground`), reply header `chat.js:805-816`, meta `chat.js:753-758`, link helper `chat.js:940-951` (`c.muted`), comment link `chat.js:204-218` (`c.faint`, 11.5px), timestamp `chat.js:784` (11px `c.faint`), user bubble `chat.js:720-760` (`c.bubble` = theme `selected`, text `c.ink`).

Tokens copied raw with **no contrast repair**: `ink, muted, faint, accent, accentInk, danger/stop, info, success, warning, bubble`. Repaired ones: `edge`, `edgeDark`, `bubbleEdge` (`look.js:190-215` via `line()`/`reach()`). `readable()` runs only in `tint()` (`look.js:126-130`) and for agent **tile** colours (`chat.js:815`); `agentHue()` output is used raw (`chat.js:757`, `look.js:236-254`).

### 2. Measured WCAG ratios (4.5 text / 3 UI)

`text/bg` — graphite / atom-one-dark / win98 / ours dark / ours light.

| element | graphite | aod | win98 | ours dark | ours light |
|---|---|---|---|---|---|
| timestamps, "Comment", "to", counts — `faint` 11–11.5px on `ground` (`chat.js:784,217,756`) | **4.49** | **3.39** | **2.17** | **4.39** | **3.07** |
| `faint` on `fill` (task steps `chat.js:441-449`, pill `chat.js:952`) | **3.63** | **3.39** | **2.96** | **3.83** | **3.23** |
| "Open terminal" `muted` on `ground` (`chat.js:940`) | 8.10 | 7.22 | 5.70 | 7.72 | 4.58 |
| agent hue "design" on `ground` (`chat.js:757`, raw `agentHue`) | 5.84 | 5.28 | **1.60** | 5.20 | **2.77** |
| agent hue "dev" | 5.27 | 4.77 | **1.78** | 4.69 | **3.07** |
| send: `accentInk` on `accent` (`look.js:17/40`) | 8.91 | 7.93 | 16.0 | **3.12** | **3.90** |
| `danger` on `fill` | **4.32** | 4.82 | 5.82 | 4.78 | 6.47 |
| `success` on `fill` | 6.84 | 7.64 | **2.33** | 6.88 | 5.48 |
| `warning` on `fill` | 7.99 | 8.91 | **3.93** | 7.92 | 5.02 |
| your text `ink` on `bubble` | 9.42 | 5.52 | 15.76 | 10.83 | 15.73 |
| bubble vs page (separation, not text) | 1.45 | 1.31 | 1.37 | 1.33 | **1.11** |

Two failures are **ours, not the theme's**: white-on-terracotta send (3.12 dark, 3.90 light) and the light-theme bubble at 1.11 against the page (its border is 1.22). So screenshots taken under a built-in theme reproduce bugs that exist in our own pair too.

Fixes that keep theme character (computed with the existing `readable()`): light `faint` on ground `#918f8a → #6c6a66`; graphite `faint` on fill `#80838a → #94979c`; light hues `design #d6825a → #9c6145`, `dev #5b8def → #4669ad`, `qa #3fa877 → #327c59`, `research #a47bd6 → #795c9c`; send `accent` darkened 18% (`#c96442 → #a55236`, 5.44).

Inline code chips are **not ours**: `TextView.markdown(id, markdown)` (`gpui-kit.d.ts:20709`) takes no theme hook, so chips and links inside replies follow herdr's own markdown colours whatever `palette()` says. On a theme whose `surface` equals `background` (atom-one-dark) the chip has nothing to sit on. Making chips consistent means rendering code spans ourselves, or accepting herdr's.

### 3. "Attach document…" never opens a picker

- Paperclip → pane: `composer.js:1151`, pane body `composer.js:1255-1265`, item `composer.js:1262` → `pickFiles` `composer.js:521-544`.
- Windows branch: `exec("powershell", ["-NoProfile","-Command","Add-Type -AssemblyName System.Windows.Forms; $d = New-Object …OpenFileDialog; … if ($d.ShowDialog() -eq 'OK') { $d.FileNames -join … }"])` — `composer.js:528-531`.
- Attach **folder** works because it calls herdr's native `pickFolder` (`gpui-kit.d.ts:22229`, `composer.js:546-552`). There is no `pickFiles` in herdr's API, so documents are the one hand-rolled dialog.
- The failure is silent by construction: `if (r.code === 0) this.addFiles(…); return;` (`composer.js:534-537`) — a non-zero PowerShell exit returns with no toast, no fallback. The toast only appears when `exec` *throws* (`composer.js:539-542`). Cancel (`code 0`, empty stdout) and error are indistinguishable to the person.
- The script itself is fine: the same spawn (pipes, `windowsHide`) opens a dialog — `.bot-herdr/tmp/pick.mjs` left a window up until killed. So the fault is in the mod's `exec` path or in the dialog opening behind the herdr window, not in the PowerShell.
- Fragile bits vs the working clipboard code (`engine/lib/media.mjs:129` uses `-NonInteractive -STA`): no `-STA`, no `-NonInteractive`, and a `;`/`$`/backtick/quoted string passed through `-Command`.

### 4. UI review — improve / remove / layout

Facts: sidebar 268px, topbar 42px with a 452px switch, pages stack, status 28px (`layouts/bot-herdr.json`); chat column max 660 (`look.js:62`), messages max 82% (`chat.js:723`).

**Improve.** Reply header carries four items on every message, two of them 11.5px links that fail AA (`chat.js:805-816`). Move "Open terminal"/"Comment" into one row that appears on hover/focus (keep them permanent only where the agent stopped without replying, `chat.js:871`). The switch draws with `t.chrome`/`t.border` (`switch.js:47-56`) while everything else uses `palette()` — two greys in one bar.

**Remove.** `edgeDark` and `scrim` tokens are unused (`look.js:33,195,216`); the "A row's or chip's colour" comment at `look.js:92` is orphaned above `luminance`. The "to" prefix on every message meta (`chat.js:755`) is noise.

**Layout** — the page switch in the top bar duplicates the sidebar's spaces/agents navigation, and at ≥1200px the 660px column leaves two large dead gutters. Worth deciding (question 2).

## Questions

1. How far should the contrast fix go?

   - Repair failing text only — raise `faint` (and the send button) to 4.5:1, leave agent hues, chips and the bubble as they are; theme keeps its character.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--edge:#e3e0d7;
     --accent:#c96442;--accentInk:#a55236;--bubble:#efede5;--bubbleEdge:#d6d2c6;--chip:#eceae4;--chipInk:#6c6a66}
     *{box-sizing:border-box}
     body{margin:0;background:var(--ground);color:var(--ink);font:14px/1.5 "Geist",system-ui,sans-serif}
     .page{width:1200px;margin:0 auto;padding:28px 0}
     .col{width:660px;margin:0 auto;display:flex;flex-direction:column;gap:22px}
     .reply{display:flex;flex-direction:column;gap:6px}
     .head{display:flex;align-items:center;gap:8px}
     .name{font-size:12.5px;font-weight:600;color:#d6825a}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .link{font-size:11.5px;color:var(--muted);padding:0 7px;height:22px;display:flex;align-items:center;border-radius:6px;cursor:pointer;background:none;border:0;font-family:inherit}
     .link:hover{background:#f4f3ef;color:var(--ink)}
     .body{font-size:14px;line-height:21px;max-width:560px}
     .chip{font-family:ui-monospace,monospace;font-size:13px;background:var(--chip);color:var(--chipInk);padding:1px 5px;border-radius:5px}
     .comment{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--faint);width:max-content;cursor:pointer;background:none;border:0;padding:2px 4px;border-radius:6px;font-family:inherit}
     .comment:hover{color:var(--ink);background:#f4f3ef}
     .mine{align-self:flex-end;max-width:540px;background:var(--bubble);border:1px solid var(--bubbleEdge);border-radius:12px;padding:9px 13px}
     .meta{display:flex;gap:4px;align-items:center;font-size:11px;color:var(--faint);margin-top:4px}
     .meta b{font-weight:600;color:#d6825a}
     .file{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 6px;border-radius:6px;background:#f4f3ef;color:var(--muted);font-size:11.5px;margin-top:6px}
     .send{width:32px;height:32px;border-radius:10px;background:var(--accentInk);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px}
     .bar{display:flex;align-items:center;gap:8px;border:1px solid var(--edge);background:var(--fill);border-radius:12px;padding:10px 12px;color:var(--muted);font-size:14px}
     </style>
     <div class="page"><div class="col">
       <div class="reply">
         <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span>
           <button class="link">Open terminal</button></div>
         <div class="body">The composer keeps its curve; the chip <span class="chip">c.fill</span> is still herdr's and the hue above is untouched.</div>
         <button class="comment">Comment</button>
       </div>
       <div style="align-self:flex-end;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
         <div class="mine">Tighten the header and make the timestamps legible.</div>
         <div class="meta">to <b>Orchestrator</b> · 09:47</div>
         <div class="file">design-review.md</div>
       </div>
       <div class="bar"><span style="flex:1">Write a message, run a command, or ask an agent</span><span class="send">↑</span></div>
     </div></div>
     ```
   - Enforce AA everywhere, keep the theme — `faint` repaired, agent hues shifted toward the ink when they fail, code chips drawn by us, send button darkened; every token passes 4.5:1 on any theme.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--edge:#e3e0d7;
     --accent:#a55236;--bubble:#e9e6dc;--bubbleEdge:#c9c4b5;--chip:#ebe9e2;--chipInk:#141413}
     *{box-sizing:border-box}
     body{margin:0;background:var(--ground);color:var(--ink);font:14px/1.5 "Geist",system-ui,sans-serif}
     .page{width:1200px;margin:0 auto;padding:28px 0}
     .col{width:660px;margin:0 auto;display:flex;flex-direction:column;gap:22px}
     .reply{display:flex;flex-direction:column;gap:6px}
     .head{display:flex;align-items:center;gap:8px}
     .name{font-size:12.5px;font-weight:600;color:#9c6145}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .link{font-size:11.5px;color:var(--muted);padding:0 7px;height:22px;display:flex;align-items:center;border-radius:6px;cursor:pointer;background:none;border:0;font-family:inherit}
     .link:hover{background:#f4f3ef;color:var(--ink)}
     .body{font-size:14px;line-height:21px;max-width:560px}
     .chip{font-family:ui-monospace,monospace;font-size:13px;background:var(--chip);color:var(--chipInk);padding:1px 5px;border-radius:5px}
     .comment{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--faint);width:max-content;cursor:pointer;background:none;border:0;padding:2px 4px;border-radius:6px;font-family:inherit}
     .comment:hover{color:var(--ink);background:#f4f3ef}
     .mine{align-self:flex-end;max-width:540px;background:var(--bubble);border:1px solid var(--bubbleEdge);border-radius:12px;padding:9px 13px}
     .meta{display:flex;gap:4px;align-items:center;font-size:11px;color:var(--faint);margin-top:4px}
     .meta b{font-weight:600;color:#9c6145}
     .file{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 6px;border-radius:6px;background:#f4f3ef;color:var(--muted);font-size:11.5px;margin-top:6px}
     .send{width:32px;height:32px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px}
     .bar{display:flex;align-items:center;gap:8px;border:1px solid var(--edge);background:var(--fill);border-radius:12px;padding:10px 12px;color:var(--muted);font-size:14px}
     </style>
     <div class="page"><div class="col">
       <div class="reply">
         <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span>
           <button class="link">Open terminal</button></div>
         <div class="body">The composer keeps its curve; the chip <span class="chip">c.fill</span> is now ours and the hue above deepened to pass.</div>
         <button class="comment">Comment</button>
       </div>
       <div style="align-self:flex-end;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
         <div class="mine">Tighten the header and make the timestamps legible.</div>
         <div class="meta">to <b>Orchestrator</b> · 09:47</div>
         <div class="file">design-review.md</div>
       </div>
       <div class="bar"><span style="flex:1">Write a message, run a command, or ask an agent</span><span class="send">↑</span></div>
     </div></div>
     ```
   - Always our palette — drop the theme following from `c84411a`; the app looks the same in Graphite, Ink, Moss, Paper and Win98, and only the terminals change.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--edge:#e3e0d7;
     --accent:#a55236;--bubble:#e9e6dc;--bubbleEdge:#c9c4b5;--chip:#ebe9e2;--chipInk:#141413}
     *{box-sizing:border-box}
     body{margin:0;background:var(--ground);color:var(--ink);font:14px/1.5 "Geist",system-ui,sans-serif}
     .page{width:1200px;margin:0 auto;padding:28px 0}
     .note{width:660px;margin:0 auto 18px;font-size:12px;color:var(--faint);border-left:2px solid var(--edge);padding-left:10px}
     .col{width:660px;margin:0 auto;display:flex;flex-direction:column;gap:22px}
     .reply{display:flex;flex-direction:column;gap:6px}
     .head{display:flex;align-items:center;gap:8px}
     .name{font-size:12.5px;font-weight:600;color:#9c6145}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .link{font-size:11.5px;color:var(--muted);padding:0 7px;height:22px;display:flex;align-items:center;border-radius:6px;cursor:pointer;background:none;border:0;font-family:inherit}
     .link:hover{background:#f4f3ef;color:var(--ink)}
     .body{font-size:14px;line-height:21px;max-width:560px}
     .chip{font-family:ui-monospace,monospace;font-size:13px;background:var(--chip);color:var(--chipInk);padding:1px 5px;border-radius:5px}
     .comment{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--faint);width:max-content;cursor:pointer;background:none;border:0;padding:2px 4px;border-radius:6px;font-family:inherit}
     .comment:hover{color:var(--ink);background:#f4f3ef}
     .mine{align-self:flex-end;max-width:540px;background:var(--bubble);border:1px solid var(--bubbleEdge);border-radius:12px;padding:9px 13px}
     .meta{display:flex;gap:4px;align-items:center;font-size:11px;color:var(--faint);margin-top:4px}
     .meta b{font-weight:600;color:#9c6145}
     .file{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 6px;border-radius:6px;background:#f4f3ef;color:var(--muted);font-size:11.5px;margin-top:6px}
     .send{width:32px;height:32px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px}
     .bar{display:flex;align-items:center;gap:8px;border:1px solid var(--edge);background:var(--fill);border-radius:12px;padding:10px 12px;color:var(--muted);font-size:14px}
     </style>
     <div class="page">
     <div class="note">Same view under Graphite, Ink, Moss, Paper or Win98 — only the terminals take the theme.</div>
     <div class="col">
       <div class="reply">
         <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span>
           <button class="link">Open terminal</button></div>
         <div class="body">The composer keeps its curve; the chip <span class="chip">c.fill</span> and the hue above are always the Claude pair.</div>
         <button class="comment">Comment</button>
       </div>
       <div style="align-self:flex-end;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
         <div class="mine">Tighten the header and make the timestamps legible.</div>
         <div class="meta">to <b>Orchestrator</b> · 09:47</div>
         <div class="file">design-review.md</div>
       </div>
       <div class="bar"><span style="flex:1">Write a message, run a command, or ask an agent</span><span class="send">↑</span></div>
     </div></div>
     ```

2. Which layout should the app settle on?

   - Keep as is, tidy the details — 268px sidebar, the switch in the top bar, a 660px chat column; only the hover actions and tokens change.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--edge:#e3e0d7;--well:#ebe9e2;--accent:#c96442;--hover:#f4f3ef;--bubble:#efede5}
     *{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font:13px/1.45 "Geist",system-ui,sans-serif}
     .app{width:1200px;height:720px;margin:0 auto;display:flex;border:1px solid var(--edge);border-radius:12px;overflow:hidden;background:var(--ground)}
     .side{width:268px;border-right:1px solid var(--edge);display:flex;flex-direction:column;background:var(--ground)}
     .brand{height:46px;display:flex;align-items:center;padding:0 16px;font-weight:600;font-size:13.5px}
     .sect{padding:8px 16px 4px;font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.06em}
     .item{height:30px;margin:0 8px;padding:0 8px;border-radius:8px;display:flex;align-items:center;gap:8px;color:var(--muted);cursor:pointer}
     .item:hover{background:var(--hover);color:var(--ink)}
     .item.on{background:var(--well);color:var(--ink)}
     .dot{width:6px;height:6px;border-radius:99px;background:#3fa877}
     .foot{margin-top:auto;height:69px;border-top:1px solid var(--edge);padding:10px 16px;font-size:11.5px;color:var(--faint)}
     .work{flex:1;display:flex;flex-direction:column;min-width:0}
     .top{height:42px;display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid var(--edge);background:var(--fill)}
     .seg{display:flex;gap:2px;padding:2px;background:var(--well);border-radius:10px;height:30px;align-items:center}
     .seg div{height:26px;padding:0 11px;display:flex;align-items:center;border-radius:8px;color:var(--muted);font-size:12.5px;font-weight:500;cursor:pointer}
     .seg div:hover{color:var(--ink)}
     .seg .on{background:var(--fill);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
     .tabs{flex:1;display:flex;gap:6px;font-size:12px;color:var(--faint);padding-left:10px}
     .chat{flex:1;position:relative;display:flex;justify-content:center}
     .feed{width:660px;padding:18px 0;display:flex;flex-direction:column;gap:18px}
     .head{display:flex;align-items:center;gap:8px}
     .name{font-size:12.5px;font-weight:600;color:#d6825a}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .link{font-size:11.5px;color:var(--muted);height:22px;padding:0 7px;display:flex;align-items:center;border-radius:6px;background:none;border:0;cursor:pointer;font-family:inherit}
     .link:hover{background:var(--hover);color:var(--ink)}
     .body{font-size:14px;line-height:21px;max-width:560px;margin-top:4px}
     .mine{align-self:flex-end;max-width:540px;background:var(--bubble);border:1px solid #dcd8cc;border-radius:12px;padding:9px 13px;font-size:14px;line-height:21px}
     .meta{display:flex;gap:4px;justify-content:flex-end;font-size:11px;color:var(--faint);margin-top:4px}
     .meta b{font-weight:600;color:#d6825a}
     .composer{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center}
     .box{width:660px;border:1px solid var(--edge);background:var(--fill);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;color:var(--faint)}
     .box .r{margin-left:auto;width:32px;height:32px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center}
     .status{height:28px;border-top:1px solid var(--edge);display:flex;align-items:center;padding:0 12px;font-size:11px;color:var(--faint);background:var(--fill)}
     </style>
     <div class="app">
       <div class="side">
         <div class="brand">bot-herdr</div>
         <div class="sect">Spaces</div>
         <div class="item on">bot-herdr</div>
         <div class="item">scratch</div>
         <div class="sect">Agents</div>
         <div class="item"><span class="dot"></span>Orchestrator</div>
         <div class="item"><span class="dot"></span>Design</div>
         <div class="item"><span class="dot"></span>Dev</div>
         <div class="foot">3 running · 1 waiting</div>
       </div>
       <div class="work">
         <div class="top"><div class="seg"><div class="on">Chat</div><div>Terminals</div><div>Tasks</div><div>Plans</div><div>Knowledge</div><div>Settings</div></div><div class="tabs">Claude · Codex · Fixtures</div></div>
         <div class="chat">
           <div class="feed">
             <div>
               <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span><button class="link">Open terminal</button></div>
               <div class="body">The composer keeps its curve and the column stays 660px; the rest of the work goes into the tokens and the hover row.</div>
             </div>
             <div class="mine">Then keep the sidebar as it is and fix the greys.</div>
             <div class="meta">to <b>Orchestrator</b> · 09:47</div>
           </div>
           <div class="composer"><div class="box"><span>Write a message, run a command, or ask an agent</span><span class="r">↑</span></div></div>
         </div>
         <div class="status">bot-herdr · main · 2 agents working</div>
       </div>
     </div>
     ```
   - Pages move into the sidebar — the switch becomes a nav list above Spaces, the top bar keeps only herdr's tabs; one navigation, not two.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--edge:#e3e0d7;--well:#ebe9e2;--accent:#c96442;--hover:#f4f3ef;--bubble:#efede5}
     *{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font:13px/1.45 "Geist",system-ui,sans-serif}
     .app{width:1200px;height:720px;margin:0 auto;display:flex;border:1px solid var(--edge);border-radius:12px;overflow:hidden;background:var(--ground)}
     .side{width:268px;border-right:1px solid var(--edge);display:flex;flex-direction:column}
     .brand{height:46px;display:flex;align-items:center;padding:0 16px;font-weight:600;font-size:13.5px}
     .nav{padding:6px 8px 10px;border-bottom:1px solid var(--edge)}
     .nav a{display:flex;align-items:center;gap:9px;height:30px;padding:0 8px;border-radius:8px;color:var(--muted);text-decoration:none;font-size:12.5px;font-weight:500}
     .nav a:hover{background:var(--hover);color:var(--ink)}
     .nav a.on{background:var(--well);color:var(--ink)}
     .nav i{width:14px;height:14px;border:1.5px solid currentColor;border-radius:4px;display:inline-block;opacity:.7}
     .sect{padding:10px 16px 4px;font-size:11px;color:var(--faint);text-transform:uppercase;letter-spacing:.06em}
     .item{height:30px;margin:0 8px;padding:0 8px;border-radius:8px;display:flex;align-items:center;gap:8px;color:var(--muted);cursor:pointer}
     .item:hover{background:var(--hover);color:var(--ink)}
     .item.on{background:var(--well);color:var(--ink)}
     .dot{width:6px;height:6px;border-radius:99px;background:#3fa877}
     .foot{margin-top:auto;height:69px;border-top:1px solid var(--edge);padding:10px 16px;font-size:11.5px;color:var(--faint)}
     .work{flex:1;display:flex;flex-direction:column;min-width:0}
     .top{height:42px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--edge);background:var(--fill);font-size:12px;color:var(--faint)}
     .tab{padding:0 10px;height:26px;display:flex;align-items:center;border-radius:7px;color:var(--muted)}
     .tab.on{background:var(--well);color:var(--ink)}
     .chat{flex:1;position:relative;display:flex;justify-content:center}
     .feed{width:720px;padding:18px 0;display:flex;flex-direction:column;gap:18px}
     .head{display:flex;align-items:center;gap:8px}
     .name{font-size:12.5px;font-weight:600;color:#d6825a}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .link{font-size:11.5px;color:var(--muted);height:22px;padding:0 7px;display:flex;align-items:center;border-radius:6px;background:none;border:0;cursor:pointer;font-family:inherit}
     .link:hover{background:var(--hover);color:var(--ink)}
     .body{font-size:14px;line-height:21px;max-width:600px;margin-top:4px}
     .mine{align-self:flex-end;max-width:560px;background:var(--bubble);border:1px solid #dcd8cc;border-radius:12px;padding:9px 13px;font-size:14px;line-height:21px}
     .meta{display:flex;gap:4px;justify-content:flex-end;font-size:11px;color:var(--faint);margin-top:4px}
     .meta b{font-weight:600;color:#d6825a}
     .composer{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center}
     .box{width:720px;border:1px solid var(--edge);background:var(--fill);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;color:var(--faint)}
     .box .r{margin-left:auto;width:32px;height:32px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center}
     .status{height:28px;border-top:1px solid var(--edge);display:flex;align-items:center;padding:0 12px;font-size:11px;color:var(--faint);background:var(--fill)}
     </style>
     <div class="app">
       <div class="side">
         <div class="brand">bot-herdr</div>
         <nav class="nav">
           <a class="on" href="#"><i></i>Chat</a>
           <a href="#"><i></i>Terminals</a>
           <a href="#"><i></i>Tasks</a>
           <a href="#"><i></i>Plans</a>
           <a href="#"><i></i>Knowledge</a>
           <a href="#"><i></i>Settings</a>
         </nav>
         <div class="sect">Spaces</div>
         <div class="item on">bot-herdr</div>
         <div class="item">scratch</div>
         <div class="sect">Agents</div>
         <div class="item"><span class="dot"></span>Orchestrator</div>
         <div class="item"><span class="dot"></span>Design</div>
         <div class="foot">3 running · 1 waiting</div>
       </div>
       <div class="work">
         <div class="top"><span class="tab on">Claude</span><span class="tab">Codex</span><span class="tab">Fixtures</span></div>
         <div class="chat">
           <div class="feed">
             <div>
               <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span><button class="link">Open terminal</button></div>
               <div class="body">One navigation: pages on the left with the spaces, herdr's own tabs alone in the bar, and the column gets 60px more.</div>
             </div>
             <div class="mine">That reads better — the bar was doing two jobs.</div>
             <div class="meta">to <b>Orchestrator</b> · 09:47</div>
           </div>
           <div class="composer"><div class="box"><span>Write a message, run a command, or ask an agent</span><span class="r">↑</span></div></div>
         </div>
         <div class="status">bot-herdr · main · 2 agents working</div>
       </div>
     </div>
     ```
   - Collapse the sidebar to an icon rail — 56px of icons for pages, spaces and agents as pop-overs; the chat column grows to 860px.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--edge:#e3e0d7;--well:#ebe9e2;--accent:#c96442;--hover:#f4f3ef;--bubble:#efede5}
     *{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font:13px/1.45 "Geist",system-ui,sans-serif}
     .app{width:1200px;height:720px;margin:0 auto;display:flex;border:1px solid var(--edge);border-radius:12px;overflow:hidden;background:var(--ground)}
     .rail{width:56px;border-right:1px solid var(--edge);display:flex;flex-direction:column;align-items:center;padding:10px 0;gap:6px}
     .rail .b{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer;font-size:13px;font-weight:600}
     .rail .b:hover{background:var(--hover);color:var(--ink)}
     .rail .b.on{background:var(--well);color:var(--ink)}
     .rail .sep{width:24px;height:1px;background:var(--edge);margin:6px 0}
     .rail .sp{width:34px;height:34px;border-radius:9px;background:var(--well);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted)}
     .work{flex:1;display:flex;flex-direction:column;min-width:0}
     .top{height:42px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--edge);background:var(--fill);font-size:12px;color:var(--faint)}
     .tab{padding:0 10px;height:26px;display:flex;align-items:center;border-radius:7px;color:var(--muted)}
     .tab.on{background:var(--well);color:var(--ink)}
     .chat{flex:1;position:relative;display:flex;justify-content:center}
     .feed{width:860px;padding:18px 0;display:flex;flex-direction:column;gap:18px}
     .head{display:flex;align-items:center;gap:8px}
     .name{font-size:12.5px;font-weight:600;color:#d6825a}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .link{font-size:11.5px;color:var(--muted);height:22px;padding:0 7px;display:flex;align-items:center;border-radius:6px;background:none;border:0;cursor:pointer;font-family:inherit}
     .link:hover{background:var(--hover);color:var(--ink)}
     .body{font-size:14px;line-height:21px;max-width:720px;margin-top:4px}
     .mine{align-self:flex-end;max-width:600px;background:var(--bubble);border:1px solid #dcd8cc;border-radius:12px;padding:9px 13px;font-size:14px;line-height:21px}
     .meta{display:flex;gap:4px;justify-content:flex-end;font-size:11px;color:var(--faint);margin-top:4px}
     .meta b{font-weight:600;color:#d6825a}
     .composer{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center}
     .box{width:860px;border:1px solid var(--edge);background:var(--fill);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;color:var(--faint)}
     .box .r{margin-left:auto;width:32px;height:32px;border-radius:10px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center}
     .status{height:28px;border-top:1px solid var(--edge);display:flex;align-items:center;padding:0 12px;font-size:11px;color:var(--faint);background:var(--fill)}
     </style>
     <div class="app">
       <div class="rail">
         <div class="b on" title="Chat">Ch</div>
         <div class="b" title="Terminals">Te</div>
         <div class="b" title="Tasks">Ta</div>
         <div class="b" title="Plans">Pl</div>
         <div class="b" title="Knowledge">Kn</div>
         <div class="b" title="Settings">Se</div>
         <div class="sep"></div>
         <div class="sp" title="bot-herdr">bh</div>
         <div class="sp" title="scratch">sc</div>
       </div>
       <div class="work">
         <div class="top"><span class="tab on">Claude</span><span class="tab">Codex</span><span class="tab">Fixtures</span><span class="grow"></span><span>bot-herdr</span></div>
         <div class="chat">
           <div class="feed">
             <div>
               <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span><button class="link">Open terminal</button></div>
               <div class="body">The rail gives the conversation the room it needs: 860px, two thirds of the window, and the pages stay one click away.</div>
             </div>
             <div class="mine">Long replies stop feeling cramped in the middle of a wide screen.</div>
             <div class="meta">to <b>Orchestrator</b> · 09:47</div>
           </div>
           <div class="composer"><div class="box"><span>Write a message, run a command, or ask an agent</span><span class="r">↑</span></div></div>
         </div>
         <div class="status">bot-herdr · main · 2 agents working</div>
       </div>
     </div>
     ```

## Notes

- **What "done" means for me**: every text token in `palette()` (and the two own-theme tokens `accentInk`/`bubble`) proves ≥4.5:1 against the surfaces it is drawn on — a test like `test/themes.test.mjs` that loops graphite/atom-one-dark/win98/our pair and asserts the pairs; and `pickFiles` either opens a dialog or says why in a toast.
- Inline code chips cannot be fixed while `TextView.markdown` owns them (`gpui-kit.d.ts:20709`); if chips must match, replies need their own span renderer — that is a separate, larger change.
- `theme()` for a theme file without `colors` (atom-one-dark) is a herdr derivation we cannot see from here; the floor must be enforced on the values `theme()` returns, not on the file.
- The attach fix is technical, not a taste call: `-STA -NonInteractive`, a temp `.ps1` passed with `-File`, exit code and `stderr` surfaced in a toast, and a typed-path fallback in the attach pane if no dialog can be shown. If the person would rather never depend on an OS dialog, that becomes a third question (in-app file list).
- `switch.js:47-56` draws with raw `t.chrome`/`t.border`; whatever answer question 1 gets, that bar should use the same token source as the rest.
- Dead weight found: `edgeDark`, `scrim` (`look.js:33,195,216`), the orphan comment at `look.js:92`.
