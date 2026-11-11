# design visual — every surface in mods/bot-herdr

## Status
OPEN

## How this was measured

Counted from the source, not from screenshots: `text_size()`, `gap()`, `px/py/p()`, `h()`,
`rounded()`, `svg().size()`, `shadow_*`, `transition()/spring()/loop()`, `hover()/active()/
focus()`, `tab_index()/accessibility_label()/tooltip()`. Anchors are `path:line` in
`mods/bot-herdr`. The contrast failures are **not** repeated here — they are in
`.bot-herdr/reports/design-panel.md` §2 and are step 1 of the plan; everything below is form, not
ink.

## 1. What the design system is today

Two real sources and a lot of local decisions.

- `look.js:3-45` — `LIGHT` / `DARK`: 26 colour tokens each. Warm paper ground `#faf9f5`, white
  fill, hairline edge, one terracotta accent, a bubble a step off the ground.
- `look.js:54-73` — `SIZE`: 20 numbers, of which only five are shape (`radius 12`, `control 10`,
  `nested 8`, `line 21`, `row 30`); the rest are composer geometry.
- `look.js:75-81` — `MOTION`: 6 policies, used at 8 call sites, **all of them in composer.js**.
- `themes/bot-herdr-light.json`, `…-dark.json` — the herdr chrome: `canvas faf9f5 / 262624`,
  `chrome f5f4ee / 1f1e1d`, `surface`, `selected`, `border`. The sidebar, top bar, tabs and status
  bar are herdr's own mods (`layouts/bot-herdr.json:31-…`) and we style them only through these
  two files.

So the *vocabulary* exists. What is missing is a rule saying which value to use where: the code
reaches past `SIZE` for almost every size.

## 2. Drift, counted

| axis | calls | distinct values in use | tokens that exist |
|---|---|---|---|
| `text_size` | 178 | **14** — 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 15.5, 16, 17, 19 | none |
| `gap` | 160 | **13** — 0,1,2,2.5,3,4,5,6,8,10,12,14,16 | none |
| `px` | 60 | **12** — 5,6,7,8,9,10,11,12,13,14,16,24 | `textX 16` |
| `py` | 10 | **10** — 1,2,5,6,8,9,20,24,40,48 | — |
| `h` | 159 | **26** — 1,2,3,4,5,6,8,9,10,11,12,14,16,18,20,22,24,26,28,30,32,34,40,52,70,72 | `row 30`, `chip 28`, `iconButton 32` |
| `rounded` | 113 | **10** — 1,2,2.5,4,5,6,8,10,12, full | 3 (`12/10/8`) |
| icon size | 46 icons | **7** — 10,11,12,13,14,15,16 (4 icons unsized) | none |
| shadow | 8 | **2** (`shadow_sm` ×5, `shadow_md` ×3) | — |
| duration | 25 | **10** — 110,160,170,180,190,200,220,240,260,420 | `MOTION` (5 of these) |
| loop period | 45 | **11** — 1200…3200 (2400 ×20, 2600 ×9) | — |
| spring response | 5 | **3** — 360, 420, 440 | — |
| pressed state | 58 `on_click` | **0** `.active()` | method exists (`gpui-kit.d.ts:1270`) |
| focus state | — | **0** `.focus()`; **0** `tab_index`; **0** `accessibility_label` | all exist (`d.ts:1276,1062,981`) |
| tooltip | 58 | **2** (`composer.js:1451`, `work.js:950`) | `tooltip()` (`d.ts:947`) |

Two consequences worth stating plainly:

**The half-pixel ladder is invisible.** 11 / 11.5 / 12 / 12.5 / 13 are five sizes inside 2px, and
they are used 135 times between them. At zoom 1 and in herdr's terminal font (`viewer.js:55`
uses `settings().font_family` — the UI is set in the user's terminal face), 11.5 and 12 will often
round to the same glyph height, so the difference costs legibility discipline and buys nothing.

**Body copy is not one size.** 14/21 in replies and your bubble (`chat.js:709-758`, `chat.js:800`),
13.5/21 in plan lines (`work.js:1040`), 13.5/20 in knowledge cards (`work.js:1152`), 13/19 in task
steps (`work.js:692`), 12.5 in the settings card description (`settings.js:512`). Four body sizes
for four pages.

**Headings are not a scale.** 19 (work page title `work.js:440`, settings `settings.js:464`), 17
(chat empty `chat.js:696`, task title `work.js:636`, plan intro `work.js:836`), 16 (work empty
`work.js:480`, plan doc `work.js:999`, knowledge editor `work.js:1076`), 15 (agent card name
`settings.js:507`), 14 (lightbox title `lightbox.js:112`).

**The 4px grid is broken on purpose.** 5, 7, 9, 11, 13 are all in use — e.g. a reply's action chip
is `h(22).px(7)` (`chat.js:874-886`), the kbd cap `px(5).py(1).rounded(5)`
(`composer.js:1136`), the suggestion tag `px(5)` (`composer.js:1736`).

## 3. Surface by surface

### 3.1 Chat feed and reply headers — `chat.js:496-521`, `764-810`

- Column `min(660, width−48)`, `pt(16)`, `gap(14)`, bottom-anchored, translated for pixel scroll.
  At 1200px window that leaves 270px of empty ground each side while the reply's text measure is
  ~560px ≈ 85 characters — over the 60–75 comfortable range.
- Reply header carries four items permanently: name 12.5/600 in the agent's hue, clock 11 faint,
  spacer, and an "Open terminal" chip 11.5 in `h(22).px(7)` (`chat.js:778-791`). The "Comment"
  link sits alone under the body at 11.5 (`chat.js:196-218`) with a 12px icon. Three type sizes and
  two icon sizes in one message header.
- A reply body is `max_h(460)` with `overflow_y_scroll` (`chat.js:785-800`) **inside** the scrolling
  feed: the wheel over a long reply scrolls the reply, not the conversation. Same for the tasks
  widget (`chat.js:412-421`).
- Your message: `max_w(82%)`, `px(13).py(9)`, radius 12, bubble + bubbleEdge border, then a meta row
  at 11 with a "to" prefix and names in `agentHue` (`chat.js:709-758`).
- Working line 12.5 with absolute top 4→14 and 260/220ms transitions (`chat.js:896-920`), the
  "1 of 3" counter at 11.5 in `h(18).px(6).rounded(6)` (`chat.js:938-947`), and the "Jump to latest"
  pill 11.5 in `h(24).px(10).rounded_full` (`chat.js:951-975`). Three more heights for one small
  row of chips.
- `note` rows 12.5 muted (`chat.js:858-867`); `commentRow` shares the look from `work.js:70-97`.

### 3.2 Composer — `composer.js:893-971`, `1133-1227`

- The most finished surface in the app: radius 12 + `shadow_md` + 1px edge + the `rim` highlight
  line (`composer.js:898-930`). It is also the only place with a bevel.
- Tools row `h(46)`, `px(10).gap(6)`: attach 32 circle, space chip `h(28).px(8).rounded(8)`,
  hints 11.5, stop 32 circle, send 32 circle — **circle send and stop next to a rounded-rect chip**,
  and the send carries `border_b(1)` in `accentLip` while the stop does not.
- The kbd caps are 11 in `px(5).py(1).rounded(5)` with `bg(kbd)` (`composer.js:1136`) — the only
  5px radius in the app and the only `kbd` token use.
- The slim folded bar `h(40).px(14)` with 13.5 text (`composer.js:950-972`) — a fifth control
  height for a control that is *the same box*.
- Suggest pane: row 30, `px(8)`, nested radius, label 13 medium, hint 12.5, tag 10.5 in `px(5)`
  (`composer.js:1693-1737`). Attach pane 260 wide, three rows 30, icon 16 (`composer.js:1291-1299`).
- Panes are joined to the box with 12px fillet SVGs (`composer.js:1358-1376`) and animate
  `height`/`width`/`opacity` with `MOTION` — the one place with real motion design.

### 3.3 Attach pane — `composer.js:1290-1300`

Two 30px rows and a hint; consistent with the suggest pane. Empty state = nothing but the hint "Or
drop files on the composer". No preview of what was attached while the pane is open; after the fix
of step 4 it should also show the failure state here, not only as a toast.

### 3.4 Question cards (ask pane) — `composer.js:1375-1653`

- Head 24 high: name 12.5 semibold in the agent's hue, title 12.5 muted, "‹ Back" 12, "1 of 2" 12,
  "Dismiss" 12, minimise 22 with a 12 chevron. Five items, three type sizes.
- The question itself is **15.5/22** — the largest type inside the composer and a size used
  exactly once in the codebase (`composer.js:1632`).
- Option rows: hand-computed height `max(34, 15+18+descRows*19)` with `pt(7).gap(10)` and a 20px
  numbered glyph in `alpha(tone,0.14)` + `alpha(tone,0.38)` border (`composer.js:1595-1640`).
  The height is arithmetic on wrapped-line estimates (`rowsFor`), so long meanings clip rather than
  grow — `overflow_hidden` is not there, but the row's own `h` is fixed.
- "Recommended" 11 accent, multi-select box 16 `rounded(4)`, mockup grid tiles `rounded(10)` with a
  22px expand button at `top:6 right:6` (`composer.js:1510-1530`).
- The dim behind an open ask is `bg(ground).opacity(0.6)` (`chat.js:648-658`) — not the (unused)
  `scrim` token.

### 3.5 Sidebar, top bar, page switch, status bar

herdr chrome; our lever is the two theme files plus `layouts/bot-herdr.json` (268 / 46 / 69 sidebar,
42 top bar, 452 switch, 28 status, 8/8/10 on Terminals). The switch is our component
(`switch.js:40-77`): segmented 30 high, `p(2).gap(2)`, item 26 `px(11).rounded(8)` 12.5 medium,
active `bg(fill)+shadow_sm` — but it paints on `t.chrome`/`t.border` (`switch.js:47-56`, already
flagged in the panel report) while everything inside it comes from `palette()`.

Same component, three copies, three numbers: `switch.js:59-73` (`px 11`), `work.js:451-472` tabs
(`px 11`), `work.js:765-798` segmented (`px 10`). They differ only in the count that rides inside.

### 3.6 Tasks — `work.js:401-720`

- Page 1140 max, `py(20)`, `gap(14)`, header row = tabs (or a 19px title) + the project path 12 faint
  + a 28px refresh button.
- List 340 wide, `gap(2)`, rows `px(10).py(8).rounded(10)` with a transparent 1px border that turns
  `edge` when selected (`work.js:563-567`) — selection is a border + fill, unlike the switch's
  borderless fill. Two selection idioms.
- Row: title 13 medium, age 11.5, facts 12, pips 6×6 `rounded(2)` (`work.js:607-612`), `${done}/${n}`
  11.5. The 1px divider between list and detail is a raw `w(1).bg(edge)` column
  (`work.js:530`) rather than a border.
- Detail: title 17/24, facts 12, then eyebrow rows "STEPS" 12 semibold and "YOUR COMMENTS" 12
  (`work.js:668,709`) while list groups use 11.5 uppercase (`work.js:521-525`) and knowledge/settings
  eyebrows nothing at all.
- Step rows `px(8).py(6).rounded(8)`, title 13/19, meta 11.5, comment count 11.5 accent; marks are
  14px boxes `rounded(4)`; live step has a 12×2 accent segment looping `left` 2400ms
  (`work.js:696-697`) — the same animation is hand-copied in the chat widget (`chat.js:452-453`).
- Comment inputs are 32 high `rounded(10)` and reuse `commentRow` — good, one component.

### 3.7 Plans — `work.js:800-1050`

- Main pane `min(780, …)`; document card `p(16).rounded(12)` on `fill`; title 16; the "click a line"
  hint 11.5.
- Document lines: 13.5/**21** in a 748px measure ≈ **105–115 characters** — the widest text in the
  app, and the page people read most carefully. `work.js:1026-1046`.
- Rail 52 wide: round number 15 + "round" 10.5, five 36px seat squares in hard-coded hues
  `work.js:942` that duplicate `agentHue` (`look.js:235-253`) — role colour now has two sources.
- Conversation: your idea in the same bubble as chat (14/21, `work.js:886-898`), each answer set
  under a 2px `edge` left rule, option chips `h(24).px(8).rounded(8)` at 12 (`work.js:917-921`).
- The chat composer is reused at the foot, inside a `border_t` strip (`work.js:829`) — its 12px
  radius and `shadow_md` now sit inside a card, which is the only place a raised control is nested
  in a border.

### 3.8 Knowledge — `work.js:1051-1160`

- Search field 32 `rounded(10)`; agent chips 28 `rounded_full` with an 8px hue dot
  (`work.js:1088-1094`) — the only pill-shaped filter in the app (`Settings` chips are
  `rounded(8)` at the same 28 height).
- Cards: `p(12).rounded(12)`, `bg(alpha(hue,0.1))`, `border alpha(hue,0.28)`, `shadow_sm`, hover to
  0.14/0.38 (`work.js:1120-1136`). The only tinted cards and the only hover that moves *both*
  background and border — every other hover moves one.
- Column gap 12 (`work.js:1097`) where every other page uses `GAP 14`.
- Body 13.5/20. Header row 11.5 medium in the hue + section 11 faint.
- **Loading is a lie**: with `knowAll` still null the page renders `cards = []` and says "No notes
  match." (`work.js:1102`) — while Tasks and Plans say "Loading…" (`work.js:475-484`).

### 3.9 Settings — `settings.js:406-892`

- Page 1140 max, `py(24)`, `gap(14)`; heading 19 + 13 muted (two-line intro runs to ~430px, fine).
- Cards three-up at min 280 with `PAD 14`; name 15 semibold, status 11.5 accent/danger, role copy
  12.5 `min_h(34)`, then five labelled fields with `gap(5)`, labels 11.5 medium `h(18)`.
- Fields 32 high `rounded(10)` on `bg(ground)` **inside** a `fill` card — the field is darker than
  its card, i.e. inverted from every other page where inputs sit on the page and panels are lighter.
  It is the one place a control is recessed.
- Select 32 with a 14 chevron; model field 32 with a 24px arrow square `rounded(6)`; slider 26 high
  with a 4px track `rounded(2)` and a 16 knob (`settings.js:618-660`); toggle 36×20 `rounded(10)`
  with a 16 knob (`settings.js:819-833`); chips 28 `rounded(8)`; primary button `h(32).px(14)`
  `rounded(10)` with `border_b` accentLip; icon button **26** (`settings.js:853`) where the same
  component is 28 in work (`work.js:1198`) and 32 in the composer (`composer.js:1210`).
- Card footer prints the argv 11.5 faint — a wall of machine text at the eye level of a caption.

### 3.10 Terminals page

herdr's panes: `layouts/bot-herdr.json` (padding 8, gap 8, pane radius 10, 1px `border`, 30px pane
header, 368 panel). Nothing of ours to restyle beyond the theme; its 8/8/10 already agrees with our
scale, so the refresh must not move those numbers.

### 3.11 Empty, loading and error states

Three treatments for the same moment:

- Chat empty (`chat.js:690-700`): 17/600 title + two 13 muted lines, 6 gap, no action, no max width.
- Work empty/loading (`work.js:475-484`): 16/600 + 13 muted in a 460 max, `py(48)`; loading reuses
  it with an **empty** description → a bare "Loading…".
- Settings loading: inline in a heading, 13 muted, "Loading… (it needs node on your PATH)."
- Knowledge loading: the empty message (see 3.8).
- Errors: `this.problem` as one 12.5 `danger` line under the page header
  (`work.js:444`, `settings.js:451`) — no icon, no retry, unlike toasts which have both.

### 3.12 Toasts, lightbox, picker, viewer

- Toast (`toast.js:48-86`): fill panel, 16 icon, 13.5/19, action `h(28).rounded(8)`; in-chat toast
  (`composer.js:1066-1163`) springs 420/360/440 with damping .82/.66/.7 and 200ms fades.
- Lightbox (`lightbox.js:78-188`): HEAD 52 / FOOT 56, 30px round buttons, title 14, note 12, hint
  11.5, choose `h(32).rounded(10)`. Uses `${tone}24` / `${tone}61` hex-suffix alpha
  (`lightbox.js:113`) where the rest of the app uses `alpha()` (`working.js:104`).
- Pick (`pick.js:47-75`): rows 30 `px(8).rounded(8)`, heading 11, note 11.5, 14 check — the closest
  thing to a menu that is not built from `menuItem()` (`composer.js:1739`).
- Viewer (`viewer.js`): herdr's `Editor` — type follows editor settings, so it is the one surface
  whose type we cannot control; note it rather than fight it.

## 4. What is unpolished, in order of cost

1. **Nothing answers a press and nothing shows focus.** 58 clickable elements, zero `.active()`,
   zero `.focus()`, zero `tab_index`. A keyboard user can reach the composer and the lightbox and
   nothing else; a mouse user gets no acknowledgement on the send button beyond `opacity(.92)`.
2. **No type scale.** 14 sizes, 135 uses inside a 2px band; body copy 12.5→14 by page; five heading
   sizes; a 15.5 that exists once.
3. **No spacing scale.** 5/7/9/11/13 alongside 4/8/12/16; 26 control heights; the same "small chip"
   is 18, 22, 24, 26, 28 and 30 depending on the file.
4. **Radii mean nothing.** 1,2,2.5,4,5,6,8,10,12 in use; a chip is 8 here (`work.js:1161`) and a
   link is 6 there (`chat.js:925`); pips are 2 and marks 4.
5. **Elevation means three things.** Some panels border-only, some border + `shadow_sm`, the
   composer + toast `shadow_md`; nothing says which.
6. **Three hover idioms and no transitions on any of them** — instant colour changes in a UI whose
   panes glide.
7. **Long measures**: 14px in 560 (≈85 chars), 13.5px in 748 (≈110 chars). The plan document is the
   worst offender and the most-read page.
8. **Nested scroll traps**: reply body 460, task widget, plan main — all scroll inside a scroll.
9. **Two sources for role colour** (`look.js:236`, `work.js:942`) and two alpha systems
   (`alpha()` vs hex suffix).
10. **Loading looks like empty.** Knowledge claims "no notes" while loading; Tasks shows a bare
    "Loading…"; no skeletons anywhere; the only spinner is the send button (`composer.js:1218`).

## Questions

1. Which direction should the refreshed look take?

   - Keep the paper, tighten it — one type scale, one spacing step set, three radii, one elevation
     rule, actions on hover; the warm ground, hairlines and single terracotta accent stay exactly as
     they are, so the refresh is invisible in style and visible in consistency.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--edge:#e3e0d7;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--well:#ebe9e2;--hover:#f4f3ef;--accent:#c96442;--bubble:#efede5;--bubbleEdge:#dcd8cc;--kbd:#efeeea}
     *{box-sizing:border-box}
     body{margin:0;background:#dedbd2;color:var(--ink);font:13px/1.45 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
     .app{width:1200px;height:720px;margin:16px auto;display:flex;background:var(--ground);border:1px solid var(--edge);border-radius:12px;overflow:hidden}
     .side{width:268px;border-right:1px solid var(--edge);display:flex;flex-direction:column;flex:none}
     .brand{height:46px;display:flex;align-items:center;padding:0 16px;font-size:13.5px;font-weight:600;letter-spacing:-.01em}
     .sect{padding:8px 16px 4px;font-size:11px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase}
     .item{height:30px;margin:0 8px;padding:0 8px;border-radius:8px;display:flex;align-items:center;gap:8px;color:var(--muted);cursor:pointer;font-size:13px}
     .item:hover{background:var(--hover);color:var(--ink)}
     .item.on{background:var(--well);color:var(--ink)}
     .dot{width:6px;height:6px;border-radius:99px;background:#3fa877;flex:none}
     .foot{margin-top:auto;height:69px;border-top:1px solid var(--edge);padding:10px 16px;font-size:11.5px;color:var(--faint)}
     .work{flex:1;display:flex;flex-direction:column;min-width:0}
     .top{height:42px;display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid var(--edge);background:#f5f4ee;flex:none}
     .seg{display:flex;gap:2px;padding:2px;background:var(--well);border-radius:10px;height:30px;align-items:center}
     .seg div{height:26px;padding:0 11px;display:flex;align-items:center;border-radius:8px;color:var(--muted);font-size:12.5px;font-weight:500;cursor:pointer;transition:color .12s}
     .seg div:hover{color:var(--ink)}
     .seg .on{background:var(--fill);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
     .tabs{margin-left:auto;font-size:12px;color:var(--faint);padding-right:12px}
     .chat{flex:1;position:relative;overflow:hidden}
     .feed{width:660px;margin:0 auto;padding:16px 0;display:flex;flex-direction:column;gap:14px}
     .head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
     .name{font-size:12.5px;font-weight:600;color:#9c6145}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .acts{display:flex;gap:4px;opacity:0;transition:opacity .12s}
     .reply:hover .acts,.reply:focus-within .acts{opacity:1}
     .act{height:22px;padding:0 7px;display:flex;align-items:center;border-radius:6px;font-size:11.5px;color:var(--muted);background:none;border:0;font-family:inherit;cursor:pointer;transition:background .12s,color .12s}
     .act:hover{background:var(--hover);color:var(--ink)}
     .act:active{background:var(--well)}
     .body{font-size:14px;line-height:21px;max-width:560px}
     .mine{align-self:flex-end;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
     .bub{max-width:540px;background:var(--bubble);border:1px solid var(--bubbleEdge);border-radius:12px;padding:9px 13px;font-size:14px;line-height:21px}
     .meta{font-size:11px;color:var(--faint)}
     .meta b{font-weight:600;color:#9c6145}
     .comment{font-size:11.5px;color:var(--faint);background:none;border:0;padding:2px 4px;border-radius:6px;font-family:inherit;cursor:pointer;margin-top:4px}
     .comment:hover{color:var(--ink);background:var(--hover)}
     .composer{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center}
     .box{width:660px;background:var(--fill);border:1px solid var(--edge);border-radius:12px;box-shadow:0 6px 20px rgba(20,20,19,.07),0 1px 2px rgba(20,20,19,.06);padding:14px 16px 12px;position:relative}
     .box:before{content:"";position:absolute;top:0;left:12px;right:12px;height:1px;background:#fff}
     .ph{color:var(--faint);font-size:14px}
     .tools{display:flex;align-items:center;gap:6px;margin-top:12px}
     .ib{width:32px;height:32px;border-radius:99px;display:flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer;border:0;background:none;transition:background .12s,color .12s}
     .ib:hover{background:var(--well);color:var(--ink)}
     .ib:active{background:var(--hover)}
     .space{height:28px;padding:0 8px;display:flex;align-items:center;gap:6px;border-radius:8px;font-size:12.5px;color:var(--muted);cursor:pointer;border:0;background:none;font-family:inherit}
     .space:hover{background:var(--hover);color:var(--ink)}
     .kbd{height:16px;padding:0 5px;border-radius:5px;background:var(--kbd);font-size:11px;color:var(--muted);display:inline-flex;align-items:center}
     .hints{margin-left:auto;font-size:11.5px;color:var(--muted);display:flex;gap:4px;align-items:center}
     .send{width:32px;height:32px;border-radius:99px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;border:0;border-bottom:1px solid #a9512f;cursor:pointer;font-size:15px}
     .send:hover{filter:brightness(1.04)}
     .send:active{transform:translateY(1px)}
     .status{height:28px;border-top:1px solid var(--edge);display:flex;align-items:center;padding:0 12px;font-size:11px;color:var(--faint);background:var(--fill);flex:none}
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
             <div class="reply">
               <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span>
                 <span class="acts"><button class="act">Open terminal</button><button class="act">Comment</button></span></div>
               <div class="body">The refresh is a token pass: one type scale (11 / 12.5 / 14 / 16 / 19), one spacing set (4 · 8 · 12 · 16), three radii (8 / 10 / 12) and one elevation rule. Nothing about the paper changes.</div>
             </div>
             <div class="reply">
               <div class="head"><span class="name">Orchestrator</span><span class="time">09:43</span><span class="grow"></span>
                 <span class="acts"><button class="act">Open terminal</button><button class="act">Comment</button></span></div>
               <div class="body">Current reply: the actions are permanent and the header carries three sizes. Here they appear on hover, so the message reads first.</div>
               <button class="comment">Comment</button>
             </div>
             <div class="mine">
               <div class="bub">Keep the paper and fix the numbers.</div>
               <div class="meta">to <b>Orchestrator</b> · 09:47</div>
             </div>
           </div>
           <div class="composer"><div class="box">
             <div class="ph">Write a message, run a command, or ask an agent</div>
             <div class="tools">
               <button class="ib">⌇</button>
               <button class="space">▢ bot-herdr <span style="color:var(--faint)">main</span> ⌄</button>
               <span class="hints"><span class="kbd">Shift</span><span class="kbd">↵</span> new line</span>
               <button class="send">↑</button>
             </div>
           </div></div>
         </div>
         <div class="status">bot-herdr · main · 2 agents working</div>
       </div>
     </div>
     ```
   - Surfaces first — the page ground drops one step, and the conversation, cards and composer become
     white raised panels; most hairlines go, sections are separated by surface and one soft shadow.
     ```mockup
     <style>
     :root{--ground:#f2f0e9;--fill:#fff;--edge:#e6e2d8;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--well:#ebe9e2;--hover:#f4f3ef;--accent:#c96442;--bubble:#f6f4ee;--kbd:#efeeea}
     *{box-sizing:border-box}
     body{margin:0;background:#dedbd2;color:var(--ink);font:13px/1.45 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
     .app{width:1200px;height:720px;margin:16px auto;display:flex;background:var(--ground);border:1px solid var(--edge);border-radius:12px;overflow:hidden}
     .side{width:268px;display:flex;flex-direction:column;flex:none;padding:8px 0}
     .brand{height:38px;display:flex;align-items:center;padding:0 16px;font-size:13.5px;font-weight:600;letter-spacing:-.01em}
     .sect{padding:12px 16px 4px;font-size:11px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase}
     .item{height:30px;margin:0 10px;padding:0 8px;border-radius:8px;display:flex;align-items:center;gap:8px;color:var(--muted);cursor:pointer;font-size:13px;transition:background .12s,color .12s}
     .item:hover{background:#fff;color:var(--ink)}
     .item.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(20,20,19,.06)}
     .dot{width:6px;height:6px;border-radius:99px;background:#3fa877;flex:none}
     .foot{margin-top:auto;padding:12px 16px 4px;font-size:11.5px;color:var(--faint)}
     .work{flex:1;display:flex;flex-direction:column;min-width:0;padding:10px 10px 8px 0}
     .top{height:42px;display:flex;align-items:center;gap:8px;padding:0 10px;background:#fff;border:1px solid var(--edge);border-radius:12px;box-shadow:0 1px 2px rgba(20,20,19,.05);flex:none}
     .seg{display:flex;gap:2px;padding:2px;background:var(--ground);border-radius:10px;height:30px;align-items:center}
     .seg div{height:26px;padding:0 11px;display:flex;align-items:center;border-radius:8px;color:var(--muted);font-size:12.5px;font-weight:500;cursor:pointer;transition:background .12s,color .12s}
     .seg div:hover{color:var(--ink)}
     .seg .on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
     .tabs{margin-left:auto;font-size:12px;color:var(--faint);padding-right:6px}
     .chat{flex:1;min-height:0;display:flex;justify-content:center;padding:10px 0 0}
     .panel{width:700px;background:#fff;border:1px solid var(--edge);border-radius:12px;box-shadow:0 1px 2px rgba(20,20,19,.05);display:flex;flex-direction:column;min-height:0;overflow:hidden}
     .feed{flex:1;padding:18px 20px;display:flex;flex-direction:column;gap:16px;overflow:hidden}
     .head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
     .name{font-size:12.5px;font-weight:600;color:#9c6145}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .acts{display:flex;gap:4px;opacity:0;transition:opacity .12s}
     .reply:hover .acts{opacity:1}
     .act{height:22px;padding:0 7px;display:flex;align-items:center;border-radius:6px;font-size:11.5px;color:var(--muted);background:none;border:0;font-family:inherit;cursor:pointer;transition:background .12s,color .12s}
     .act:hover{background:var(--hover);color:var(--ink)}
     .body{font-size:14px;line-height:21px;max-width:560px}
     .mine{align-self:flex-end;max-width:520px;background:var(--bubble);border-radius:12px;padding:9px 13px;font-size:14px;line-height:21px}
     .meta{align-self:flex-end;font-size:11px;color:var(--faint);margin-top:4px}
     .meta b{font-weight:600;color:#9c6145}
     .composer{padding:0 20px 20px}
     .box{background:#fff;border:1px solid var(--edge);border-radius:12px;box-shadow:0 8px 24px rgba(20,20,19,.10),0 1px 2px rgba(20,20,19,.06);padding:14px 16px 12px;position:relative}
     .box:before{content:"";position:absolute;top:0;left:12px;right:12px;height:1px;background:#fff}
     .ph{color:var(--faint);font-size:14px}
     .tools{display:flex;align-items:center;gap:6px;margin-top:12px}
     .ib{width:32px;height:32px;border-radius:99px;display:flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer;border:0;background:none;transition:background .12s,color .12s}
     .ib:hover{background:var(--well);color:var(--ink)}
     .space{height:28px;padding:0 8px;display:flex;align-items:center;gap:6px;border-radius:8px;font-size:12.5px;color:var(--muted);cursor:pointer;border:0;background:none;font-family:inherit}
     .space:hover{background:var(--hover);color:var(--ink)}
     .kbd{height:16px;padding:0 5px;border-radius:5px;background:var(--kbd);font-size:11px;color:var(--muted);display:inline-flex;align-items:center}
     .hints{margin-left:auto;font-size:11.5px;color:var(--muted);display:flex;gap:4px;align-items:center}
     .send{width:32px;height:32px;border-radius:99px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;border:0;border-bottom:1px solid #a9512f;cursor:pointer;font-size:15px}
     .send:active{transform:translateY(1px)}
     .status{height:28px;display:flex;align-items:center;padding:0 12px;font-size:11px;color:var(--faint)}
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
         <div class="chat"><div class="panel">
           <div class="feed">
             <div class="reply">
               <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span><span class="acts"><button class="act">Open terminal</button><button class="act">Comment</button></span></div>
               <div class="body">One surface holds the conversation; the sidebar and the page recede a step, so what you read is the only thing raised. The composer sits on that surface as a second, softer elevation.</div>
             </div>
             <div class="reply">
               <div class="head"><span class="name">Orchestrator</span><span class="time">09:43</span><span class="grow"></span><span class="acts"><button class="act">Open terminal</button><button class="act">Comment</button></span></div>
               <div class="body">Cards, plan document and settings panels all take the same surface, so a page is never a stack of hairline boxes.</div>
             </div>
             <div class="mine">Elevation does the separating, then.</div>
             <div class="meta">to <b>Orchestrator</b> · 09:47</div>
           </div>
           <div class="composer"><div class="box">
             <div class="ph">Write a message, run a command, or ask an agent</div>
             <div class="tools">
               <button class="ib">⌇</button>
               <button class="space">▢ bot-herdr <span style="color:var(--faint)">main</span> ⌄</button>
               <span class="hints"><span class="kbd">Shift</span><span class="kbd">↵</span> new line</span>
               <button class="send">↑</button>
             </div>
           </div></div>
         </div></div>
         <div class="status">bot-herdr · main · 2 agents working</div>
       </div>
     </div>
     ```
   - Quieter editorial — a 720 column, 15px body at 24 line height, generous rhythm, plain rules
     between messages and plain-text actions; the reply is read like a document and the workspace
     chrome steps back.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--edge:#e3e0d7;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--well:#ebe9e2;--hover:#f4f3ef;--accent:#c96442;--bubble:#f3f1ea;--kbd:#efeeea}
     *{box-sizing:border-box}
     body{margin:0;background:#dedbd2;color:var(--ink);font:13px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
     .app{width:1200px;height:720px;margin:16px auto;display:flex;background:var(--ground);border:1px solid var(--edge);border-radius:12px;overflow:hidden}
     .side{width:232px;display:flex;flex-direction:column;flex:none;padding-top:4px}
     .brand{height:44px;display:flex;align-items:center;padding:0 20px;font-size:13px;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
     .sect{padding:10px 20px 4px;font-size:10.5px;color:var(--faint);letter-spacing:.08em;text-transform:uppercase}
     .item{height:30px;padding:0 20px;display:flex;align-items:center;gap:8px;color:var(--muted);cursor:pointer;font-size:13px;transition:color .12s}
     .item:hover{color:var(--ink)}
     .item.on{color:var(--ink);font-weight:500}
     .dot{width:5px;height:5px;border-radius:99px;background:#3fa877;flex:none}
     .foot{margin-top:auto;padding:12px 20px 16px;font-size:11px;color:var(--faint)}
     .work{flex:1;display:flex;flex-direction:column;min-width:0}
     .top{height:44px;display:flex;align-items:center;gap:20px;padding:0 24px;border-bottom:1px solid var(--edge);flex:none}
     .seg{display:flex;gap:18px;align-items:center}
     .seg div{padding:12px 0;color:var(--muted);font-size:13px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .12s}
     .seg div:hover{color:var(--ink)}
     .seg .on{color:var(--ink);font-weight:500;border-bottom-color:var(--accent)}
     .tabs{margin-left:auto;font-size:12px;color:var(--faint)}
     .chat{flex:1;position:relative;overflow:hidden}
     .feed{width:720px;margin:0 auto;padding:24px 0 0;display:flex;flex-direction:column}
     .reply{padding:0 0 24px;border-bottom:1px solid var(--edge);margin-bottom:24px}
     .head{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}
     .name{font-size:12.5px;font-weight:600;color:#9c6145;letter-spacing:.01em}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .acts{display:flex;gap:12px;opacity:0;transition:opacity .12s}
     .reply:hover .acts{opacity:1}
     .act{font-size:12px;color:var(--muted);background:none;border:0;padding:0;font-family:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:transparent;text-underline-offset:3px;transition:color .12s,text-decoration-color .12s}
     .act:hover{color:var(--ink);text-decoration-color:currentColor}
     .body{font-size:15px;line-height:24px;max-width:640px}
     .mine{margin-left:auto;max-width:600px;background:var(--bubble);border-left:2px solid var(--accent);border-radius:0 8px 8px 0;padding:10px 16px;font-size:15px;line-height:24px;margin-bottom:24px}
     .meta{font-size:11px;color:var(--faint);margin-top:6px}
     .meta b{font-weight:600;color:#9c6145}
     .composer{position:absolute;left:0;right:0;bottom:16px;display:flex;justify-content:center}
     .box{width:720px;background:var(--fill);border:1px solid var(--edge);border-radius:10px;box-shadow:0 6px 20px rgba(20,20,19,.06);padding:14px 16px 12px}
     .ph{color:var(--faint);font-size:15px}
     .tools{display:flex;align-items:center;gap:8px;margin-top:14px}
     .ib{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer;border:0;background:none;transition:background .12s,color .12s}
     .ib:hover{background:var(--hover);color:var(--ink)}
     .space{height:28px;padding:0 6px;display:flex;align-items:center;gap:6px;border-radius:8px;font-size:12.5px;color:var(--muted);cursor:pointer;border:0;background:none;font-family:inherit}
     .space:hover{background:var(--hover);color:var(--ink)}
     .kbd{height:16px;padding:0 5px;border-radius:4px;background:var(--kbd);font-size:11px;color:var(--muted);display:inline-flex;align-items:center}
     .hints{margin-left:auto;font-size:11.5px;color:var(--muted);display:flex;gap:4px;align-items:center}
     .send{width:30px;height:30px;border-radius:8px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;border:0;cursor:pointer;font-size:14px}
     .send:active{transform:translateY(1px)}
     .status{display:none}
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
             <div class="reply">
               <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span><span class="acts"><button class="act">Open terminal</button><button class="act">Comment</button></span></div>
               <div class="body">Messages are separated by a rule instead of a gap, the body is 15 at 24, and the actions are words rather than chips. The same measure and rhythm carry into the plan document and the knowledge cards, which is where the reading happens.</div>
             </div>
             <div class="reply">
               <div class="head"><span class="name">Orchestrator</span><span class="time">09:43</span><span class="grow"></span><span class="acts"><button class="act">Open terminal</button><button class="act">Comment</button></span></div>
               <div class="body">The page switch becomes a tab row on a hairline, so the bar is one line lower and the chrome stops drawing boxes.</div>
             </div>
             <div class="mine">Roughly 70 characters a line, then.<div class="meta">to <b>Orchestrator</b> · 09:47</div></div>
           </div>
           <div class="composer"><div class="box">
             <div class="ph">Write a message, run a command, or ask an agent</div>
             <div class="tools">
               <button class="ib">⌇</button>
               <button class="space">▢ bot-herdr <span style="color:var(--faint)">main</span></button>
               <span class="hints"><span class="kbd">Shift</span><span class="kbd">↵</span> new line</span>
               <button class="send">↑</button>
             </div>
           </div></div>
         </div>
       </div>
     </div>
     ```

2. How dense should the pages be, and on what type scale?

   - Five steps, standard — 11 / 12.5 / 14 / 16 / 19, spacing 4·8·12·16, rows 30–32, 32px targets;
     the fewest changes and the smallest risk with a terminal font.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--edge:#e3e0d7;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--well:#ebe9e2;--hover:#f4f3ef;--accent:#c96442;--bubble:#efede5;--bubbleEdge:#dcd8cc}
     *{box-sizing:border-box}
     body{margin:0;background:#dedbd2;color:var(--ink);font:13px/1.45 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
     .sheet{width:1200px;min-height:720px;margin:16px auto;background:var(--ground);border:1px solid var(--edge);border-radius:12px;padding:24px 0 32px}
     .wrap{width:900px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
     .cap{font-size:11px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase}
     .scale{display:flex;align-items:baseline;gap:16px;background:var(--fill);border:1px solid var(--edge);border-radius:12px;padding:12px 16px}
     .scale span{display:flex;flex-direction:column;gap:2px}
     .scale b{font-weight:600;letter-spacing:-.01em}
     .scale i{font-style:normal;font-size:10.5px;color:var(--faint)}
     .card{background:var(--fill);border:1px solid var(--edge);border-radius:12px;padding:16px}
     .head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
     .name{font-size:12.5px;font-weight:600;color:#9c6145}
     .time{font-size:11px;color:var(--faint)}
     .grow{flex:1}
     .act{height:22px;padding:0 7px;display:flex;align-items:center;border-radius:6px;font-size:11.5px;color:var(--muted);background:none;border:0;font-family:inherit;cursor:pointer;transition:background .12s,color .12s}
     .act:hover{background:var(--hover);color:var(--ink)}
     .body{font-size:14px;line-height:21px;max-width:660px}
     .mine{margin-top:12px;margin-left:auto;max-width:520px;background:var(--bubble);border:1px solid var(--bubbleEdge);border-radius:12px;padding:9px 13px;font-size:14px;line-height:21px}
     .meta{font-size:11px;color:var(--faint);margin-top:4px;text-align:right}
     .meta b{font-weight:600;color:#9c6145}
     .row{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:10px;border:1px solid transparent;cursor:pointer;transition:background .12s}
     .row:hover{background:var(--hover)}
     .row.on{background:var(--fill);border-color:var(--edge)}
     .mark{width:16px;height:16px;border-radius:4px;border:1px solid var(--accent);flex:none;margin-top:2px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;background:var(--accent)}
     .rtitle{font-size:13px;font-weight:500}
     .rfacts{font-size:12px;color:var(--muted);margin-top:2px}
     .age{font-size:11.5px;color:var(--faint);margin-left:auto}
     .pips{display:flex;gap:2px;margin-top:6px}
     .pips i{width:6px;height:6px;border-radius:2px;background:var(--accent)}
     .pips i.o{background:var(--edge)}
     .field{height:32px;padding:0 10px;display:flex;align-items:center;border-radius:10px;border:1px solid var(--edge);background:var(--fill);color:var(--ink);font-size:13px;transition:border-color .12s}
     .field:hover{border-color:var(--accent)}
     .field:focus{outline:2px solid var(--accent);outline-offset:1px}
     .label{font-size:11.5px;font-weight:500;color:var(--muted);margin-bottom:5px}
     .two{display:flex;gap:14px}
     .two>div{flex:1}
     .btn{height:32px;padding:0 14px;border-radius:10px;background:var(--accent);color:#fff;border:0;border-bottom:1px solid #a9512f;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer}
     .btn:active{transform:translateY(1px)}
     .chip{height:28px;padding:0 10px;display:inline-flex;align-items:center;border-radius:8px;border:1px solid var(--edge);font-size:12.5px;color:var(--muted);cursor:pointer;transition:background .12s,color .12s}
     .chip:hover{background:var(--hover);color:var(--ink)}
     </style>
     <div class="sheet"><div class="wrap">
       <div class="cap">Type scale — five steps</div>
       <div class="scale">
         <span><b style="font-size:19px">Title</b><i>19</i></span>
         <span><b style="font-size:16px">Section</b><i>16</i></span>
         <span><b style="font-size:14px">Body text runs here at fourteen</b><i>14 / 21</i></span>
         <span><b style="font-size:12.5px">Secondary and labels</b><i>12.5</i></span>
         <span><b style="font-size:11px">Caption and meta</b><i>11</i></span>
       </div>
       <div class="cap">Chat — reply, your message</div>
       <div class="card">
         <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span><button class="act">Open terminal</button><button class="act">Comment</button></div>
         <div class="body">Every size here is on the scale: the name and the time, the reply at 14/21, the chip label at 12.5. Nothing below 11 is used for reading.</div>
         <div class="mine">And the bubble keeps 9/13 padding.<div class="meta">to <b>Orchestrator</b> · 09:47</div></div>
       </div>
       <div class="cap">Task row and settings field</div>
       <div class="two">
         <div class="card" style="padding:12px">
           <div class="row on" style="padding:8px 10px">
             <span class="mark">✓</span>
             <span style="flex:1"><div class="rtitle">Polish the visual refresh</div><div class="rfacts">active · ui track · main</div><div class="pips"><i></i><i></i><i class="o"></i><i class="o"></i></div></span>
             <span class="age">2h</span>
           </div>
           <div class="row"><span class="mark" style="background:none;border-color:var(--edge)"></span><span style="flex:1"><div class="rtitle">Attach picker</div><div class="rfacts">paused · blocked</div></span><span class="age">1d</span></div>
         </div>
         <div class="card" style="padding:14px">
           <div class="label">Model</div>
           <div class="field">Claude Opus 4.5</div>
           <div style="display:flex;gap:6px;margin-top:12px;align-items:center"><button class="btn">Save changes</button><button class="chip">Cancel</button></div>
         </div>
       </div>
     </div></div>
     ```
   - Compact — 10.5 / 12 / 13.5 / 16 / 18, spacing 2·4·8·12, rows 26–28, 28px targets; more rows on
     screen, which the task list and the agent grid want, at the cost of a tighter feed.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--edge:#e3e0d7;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--well:#ebe9e2;--hover:#f4f3ef;--accent:#c96442;--bubble:#efede5;--bubbleEdge:#dcd8cc}
     *{box-sizing:border-box}
     body{margin:0;background:#dedbd2;color:var(--ink);font:12.5px/1.4 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
     .sheet{width:1200px;min-height:720px;margin:16px auto;background:var(--ground);border:1px solid var(--edge);border-radius:12px;padding:18px 0 24px}
     .wrap{width:900px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
     .cap{font-size:10.5px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase}
     .scale{display:flex;align-items:baseline;gap:14px;background:var(--fill);border:1px solid var(--edge);border-radius:10px;padding:8px 12px}
     .scale span{display:flex;flex-direction:column;gap:1px}
     .scale b{font-weight:600;letter-spacing:-.01em}
     .scale i{font-style:normal;font-size:10px;color:var(--faint)}
     .card{background:var(--fill);border:1px solid var(--edge);border-radius:10px;padding:12px}
     .head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
     .name{font-size:12px;font-weight:600;color:#9c6145}
     .time{font-size:10.5px;color:var(--faint)}
     .grow{flex:1}
     .act{height:20px;padding:0 6px;display:flex;align-items:center;border-radius:5px;font-size:11px;color:var(--muted);background:none;border:0;font-family:inherit;cursor:pointer;transition:background .12s,color .12s}
     .act:hover{background:var(--hover);color:var(--ink)}
     .body{font-size:13.5px;line-height:19px;max-width:660px}
     .mine{margin-top:8px;margin-left:auto;max-width:520px;background:var(--bubble);border:1px solid var(--bubbleEdge);border-radius:10px;padding:7px 11px;font-size:13.5px;line-height:19px}
     .meta{font-size:10.5px;color:var(--faint);margin-top:2px;text-align:right}
     .meta b{font-weight:600;color:#9c6145}
     .row{display:flex;align-items:flex-start;gap:8px;padding:5px 8px;border-radius:8px;border:1px solid transparent;cursor:pointer;transition:background .12s}
     .row:hover{background:var(--hover)}
     .row.on{background:var(--fill);border-color:var(--edge)}
     .mark{width:14px;height:14px;border-radius:4px;border:1px solid var(--accent);flex:none;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff;background:var(--accent)}
     .rtitle{font-size:12.5px;font-weight:500}
     .rfacts{font-size:11px;color:var(--muted)}
     .age{font-size:11px;color:var(--faint);margin-left:auto}
     .pips{display:flex;gap:2px;margin-top:4px}
     .pips i{width:5px;height:5px;border-radius:2px;background:var(--accent)}
     .pips i.o{background:var(--edge)}
     .field{height:28px;padding:0 8px;display:flex;align-items:center;border-radius:8px;border:1px solid var(--edge);background:var(--fill);color:var(--ink);font-size:12.5px;transition:border-color .12s}
     .field:hover{border-color:var(--accent)}
     .field:focus{outline:2px solid var(--accent);outline-offset:1px}
     .label{font-size:11px;font-weight:500;color:var(--muted);margin-bottom:3px}
     .two{display:flex;gap:12px}
     .two>div{flex:1}
     .btn{height:28px;padding:0 12px;border-radius:8px;background:var(--accent);color:#fff;border:0;border-bottom:1px solid #a9512f;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer}
     .btn:active{transform:translateY(1px)}
     .chip{height:26px;padding:0 8px;display:inline-flex;align-items:center;border-radius:6px;border:1px solid var(--edge);font-size:12px;color:var(--muted);cursor:pointer;transition:background .12s,color .12s}
     .chip:hover{background:var(--hover);color:var(--ink)}
     </style>
     <div class="sheet"><div class="wrap">
       <div class="cap">Type scale — compact</div>
       <div class="scale">
         <span><b style="font-size:18px">Title</b><i>18</i></span>
         <span><b style="font-size:16px">Section</b><i>16</i></span>
         <span><b style="font-size:13.5px">Body text runs here at thirteen and a half</b><i>13.5 / 19</i></span>
         <span><b style="font-size:12px">Secondary and labels</b><i>12</i></span>
         <span><b style="font-size:10.5px">Caption and meta</b><i>10.5</i></span>
       </div>
       <div class="cap">Chat — reply, your message</div>
       <div class="card">
         <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span><button class="act">Open terminal</button><button class="act">Comment</button></div>
         <div class="body">Denser: two more messages fit above the composer, and the reply is 13.5 at 19. The feed reads as a log rather than as a page.</div>
         <div class="mine">Six messages instead of four on one screen.<div class="meta">to <b>Orchestrator</b> · 09:47</div></div>
       </div>
       <div class="cap">Task row and settings field</div>
       <div class="two">
         <div class="card" style="padding:10px">
           <div class="row on"><span class="mark">✓</span><span style="flex:1"><div class="rtitle">Polish the visual refresh</div><div class="rfacts">active · ui track · main</div><div class="pips"><i></i><i></i><i class="o"></i><i class="o"></i></div></span><span class="age">2h</span></div>
           <div class="row"><span class="mark" style="background:none;border-color:var(--edge)"></span><span style="flex:1"><div class="rtitle">Attach picker</div><div class="rfacts">paused · blocked</div></span><span class="age">1d</span></div>
           <div class="row"><span class="mark" style="background:none;border-color:var(--edge)"></span><span style="flex:1"><div class="rtitle">Knowledge notes</div><div class="rfacts">backlog</div></span><span class="age">3d</span></div>
         </div>
         <div class="card" style="padding:12px">
           <div class="label">Model</div>
           <div class="field">Claude Opus 4.5</div>
           <div style="display:flex;gap:6px;margin-top:10px;align-items:center"><button class="btn">Save changes</button><button class="chip">Cancel</button></div>
         </div>
       </div>
     </div></div>
     ```
   - Roomier — 12 / 13.5 / 15 / 17 / 20, spacing 6·10·16·24, rows 34–36, 36px targets, a 720 column;
     the most comfortable reading, fewer rows per page and a feed that scrolls more.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--edge:#e3e0d7;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--well:#ebe9e2;--hover:#f4f3ef;--accent:#c96442;--bubble:#efede5;--bubbleEdge:#dcd8cc}
     *{box-sizing:border-box}
     body{margin:0;background:#dedbd2;color:var(--ink);font:13.5px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
     .sheet{width:1200px;min-height:760px;margin:16px auto;background:var(--ground);border:1px solid var(--edge);border-radius:12px;padding:28px 0 36px}
     .wrap{width:960px;margin:0 auto;display:flex;flex-direction:column;gap:24px}
     .cap{font-size:12px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase}
     .scale{display:flex;align-items:baseline;gap:24px;background:var(--fill);border:1px solid var(--edge);border-radius:12px;padding:16px 20px}
     .scale span{display:flex;flex-direction:column;gap:2px}
     .scale b{font-weight:600;letter-spacing:-.015em}
     .scale i{font-style:normal;font-size:11px;color:var(--faint)}
     .card{background:var(--fill);border:1px solid var(--edge);border-radius:12px;padding:20px}
     .head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
     .name{font-size:13.5px;font-weight:600;color:#9c6145}
     .time{font-size:12px;color:var(--faint)}
     .grow{flex:1}
     .act{height:24px;padding:0 8px;display:flex;align-items:center;border-radius:8px;font-size:12.5px;color:var(--muted);background:none;border:0;font-family:inherit;cursor:pointer;transition:background .12s,color .12s}
     .act:hover{background:var(--hover);color:var(--ink)}
     .body{font-size:15px;line-height:24px;max-width:700px}
     .mine{margin-top:16px;margin-left:auto;max-width:580px;background:var(--bubble);border:1px solid var(--bubbleEdge);border-radius:12px;padding:11px 15px;font-size:15px;line-height:24px}
     .meta{font-size:12px;color:var(--faint);margin-top:6px;text-align:right}
     .meta b{font-weight:600;color:#9c6145}
     .row{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-radius:10px;border:1px solid transparent;cursor:pointer;transition:background .12s}
     .row:hover{background:var(--hover)}
     .row.on{background:var(--fill);border-color:var(--edge)}
     .mark{width:18px;height:18px;border-radius:6px;border:1px solid var(--accent);flex:none;margin-top:2px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;background:var(--accent)}
     .rtitle{font-size:13.5px;font-weight:500}
     .rfacts{font-size:12px;color:var(--muted);margin-top:3px}
     .age{font-size:12px;color:var(--faint);margin-left:auto}
     .pips{display:flex;gap:3px;margin-top:8px}
     .pips i{width:7px;height:7px;border-radius:2px;background:var(--accent)}
     .pips i.o{background:var(--edge)}
     .field{height:36px;padding:0 12px;display:flex;align-items:center;border-radius:10px;border:1px solid var(--edge);background:var(--fill);color:var(--ink);font-size:13.5px;transition:border-color .12s}
     .field:hover{border-color:var(--accent)}
     .field:focus{outline:2px solid var(--accent);outline-offset:1px}
     .label{font-size:12px;font-weight:500;color:var(--muted);margin-bottom:6px}
     .two{display:flex;gap:24px}
     .two>div{flex:1}
     .btn{height:36px;padding:0 16px;border-radius:10px;background:var(--accent);color:#fff;border:0;border-bottom:1px solid #a9512f;font-family:inherit;font-size:13.5px;font-weight:500;cursor:pointer}
     .btn:active{transform:translateY(1px)}
     .chip{height:30px;padding:0 12px;display:inline-flex;align-items:center;border-radius:8px;border:1px solid var(--edge);font-size:12.5px;color:var(--muted);cursor:pointer;transition:background .12s,color .12s}
     .chip:hover{background:var(--hover);color:var(--ink)}
     </style>
     <div class="sheet"><div class="wrap">
       <div class="cap">Type scale — roomier</div>
       <div class="scale">
         <span><b style="font-size:20px">Title</b><i>20</i></span>
         <span><b style="font-size:17px">Section</b><i>17</i></span>
         <span><b style="font-size:15px">Body text runs here at fifteen pixels</b><i>15 / 24</i></span>
         <span><b style="font-size:13.5px">Secondary and labels</b><i>13.5</i></span>
         <span><b style="font-size:12px">Caption and meta</b><i>12</i></span>
       </div>
       <div class="cap">Chat — reply, your message</div>
       <div class="card">
         <div class="head"><span class="name">Design</span><span class="time">09:41</span><span class="grow"></span><button class="act">Open terminal</button><button class="act">Comment</button></div>
         <div class="body">Fifteen at twenty-four, a 700px measure and sixteen between messages: one long reply fills the height, and reading it does not feel like reading a log.</div>
         <div class="mine">Three messages fill the screen instead of four.<div class="meta">to <b>Orchestrator</b> · 09:47</div></div>
       </div>
       <div class="cap">Task row and settings field</div>
       <div class="two">
         <div class="card" style="padding:14px">
           <div class="row on" style="padding:10px 12px"><span class="mark">✓</span><span style="flex:1"><div class="rtitle">Polish the visual refresh</div><div class="rfacts">active · ui track · main</div><div class="pips"><i></i><i></i><i class="o"></i><i class="o"></i></div></span><span class="age">2h</span></div>
           <div class="row" style="padding:10px 12px"><span class="mark" style="background:none;border-color:var(--edge)"></span><span style="flex:1"><div class="rtitle">Attach picker</div><div class="rfacts">paused · blocked</div></span><span class="age">1d</span></div>
         </div>
         <div class="card" style="padding:16px">
           <div class="label">Model</div>
           <div class="field">Claude Opus 4.5</div>
           <div style="display:flex;gap:8px;margin-top:16px;align-items:center"><button class="btn">Save changes</button><button class="chip">Cancel</button></div>
         </div>
       </div>
     </div></div>
     ```

3. How much should the interface move and answer?

   - Instant — hover and press change colour with no transition, panes and toasts keep their short
     open (120–190ms), the feed never moves; the calmest, and the cheapest to make consistent.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--edge:#e3e0d7;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--well:#ebe9e2;--hover:#f4f3ef;--accent:#c96442;--kbd:#efeeea}
     *{box-sizing:border-box}
     body{margin:0;background:#dedbd2;color:var(--ink);font:13px/1.45 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
     .sheet{width:1200px;height:720px;margin:16px auto;background:var(--ground);border:1px solid var(--edge);border-radius:12px;display:flex;flex-direction:column;overflow:hidden}
     .cap{font-size:11px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase;padding:16px 0 8px}
     .col{width:720px;margin:0 auto;flex:1;display:flex;flex-direction:column;min-height:0}
     .demo{background:var(--fill);border:1px solid var(--edge);border-radius:12px;padding:14px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
     .note{font-size:12px;color:var(--muted);margin-left:auto}
     .chip{height:28px;padding:0 10px;display:inline-flex;align-items:center;border-radius:8px;border:1px solid var(--edge);font-size:12.5px;color:var(--muted);cursor:pointer;background:none;font-family:inherit}
     .chip:hover{background:var(--hover);color:var(--ink);border-color:var(--faint)}
     .chip:active{background:var(--well)}
     .chip:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
     .btnr{height:28px;padding:0 12px;border-radius:10px;background:var(--accent);color:#fff;border:0;border-bottom:1px solid #a9512f;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer}
     .btnr:hover{background:#b85a3c}
     .btnr:active{background:#a9512f}
     .btnr:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
     .ib{width:32px;height:32px;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer;border:0;background:none;font-size:15px}
     .ib:hover{background:var(--well);color:var(--ink)}
     .ib:active{background:var(--hover)}
     .field{height:32px;padding:0 10px;display:flex;align-items:center;border-radius:10px;border:1px solid var(--edge);font-size:13px;background:var(--fill);flex:1}
     .field:hover{border-color:var(--accent)}
     .field:focus{outline:2px solid var(--accent);outline-offset:1px}
     .feed{flex:1;padding:16px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden}
     .msg{display:flex;gap:8px;align-items:flex-start;border-radius:10px;padding:8px}
     .msg:hover{background:var(--hover)}
     .av{width:22px;height:22px;border-radius:99px;background:#eadfd9;color:#9c6145;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none}
     .tx{font-size:14px;line-height:21px}
     .composer{display:flex;justify-content:center;padding-bottom:16px}
     .box{width:720px;background:var(--fill);border:1px solid var(--edge);border-radius:12px;box-shadow:0 6px 20px rgba(20,20,19,.07);padding:14px 16px 12px;position:relative}
     .pane{position:absolute;left:12px;right:12px;bottom:100%;background:var(--fill);border:1px solid var(--edge);border-bottom:0;border-radius:12px 12px 0 0;padding:8px;display:flex;flex-direction:column;gap:1px;margin-bottom:-1px}
     .prow{height:30px;padding:0 8px;display:flex;align-items:center;gap:8px;border-radius:8px;font-size:13px;cursor:pointer;color:var(--ink)}
     .prow:hover{background:var(--hover)}
     .prow span{font-size:12.5px;color:var(--muted)}
     .tag{margin-left:auto;font-size:10.5px;font-weight:500;color:var(--accent);padding:0 5px}
     .ph{color:var(--faint);font-size:14px}
     .tools{display:flex;align-items:center;gap:6px;margin-top:12px}
     .space{height:28px;padding:0 8px;display:flex;align-items:center;gap:6px;border-radius:8px;font-size:12.5px;color:var(--muted);cursor:pointer;border:0;background:none;font-family:inherit}
     .space:hover{background:var(--hover);color:var(--ink)}
     .send{margin-left:auto;width:32px;height:32px;border-radius:99px;background:var(--accent);color:#fff;border:0;border-bottom:1px solid #a9512f;cursor:pointer;font-size:15px}
     .send:hover{background:#b85a3c}
     .send:active{background:#a9512f}
     </style>
     <div class="sheet">
       <div class="col">
         <div class="cap">Hover, press and focus — no transition, colour changes at once</div>
         <div class="demo">
           <button class="chip">Focus me with Tab</button>
           <button class="btnr">Send</button>
           <button class="ib">⌇</button>
           <input class="field" value="A field with a ring on focus">
           <span class="note">try hover, press and Tab</span>
         </div>
         <div class="cap">Suggestion pane — opens at 190ms, then holds still</div>
         <div class="feed">
           <div class="msg"><span class="av">D</span><span class="tx"><b style="color:#9c6145">Design</b> <span style="color:var(--faint);font-size:11px">09:41</span><br>The pane grows from the box's edge once, and nothing else in the app moves. A reply never animates in; a row never slides.</span></div>
           <div class="msg"><span class="av">O</span><span class="tx"><b style="color:#9c6145">Orchestrator</b> <span style="color:var(--faint);font-size:11px">09:43</span><br>Feedback is colour: the hover tone, the pressed tone, the focus ring.</span></div>
         </div>
         <div class="composer"><div class="box">
           <div class="pane">
             <div class="prow">▢ bot-herdr <span>main</span><span class="tag">space</span></div>
             <div class="prow">✦ Orchestrator <span>the lead</span><span class="tag">@</span></div>
             <div class="prow">✦ Design <span>ui, a11y</span><span class="tag">@</span></div>
           </div>
           <div class="ph">Write a message, run a command, or ask an agent</div>
           <div class="tools"><button class="ib">⌇</button><button class="space">▢ bot-herdr ⌄</button><button class="send">↑</button></div>
         </div></div>
       </div>
     </div>
     ```
   - Every touch answers — 120ms colour on hover, a 90ms 1px sink on press, a 2px accent focus
     ring on everything reachable, panes at 190ms; the feed still never moves.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--edge:#e3e0d7;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--well:#ebe9e2;--hover:#f4f3ef;--accent:#c96442;--kbd:#efeeea}
     *{box-sizing:border-box}
     body{margin:0;background:#dedbd2;color:var(--ink);font:13px/1.45 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
     .sheet{width:1200px;height:720px;margin:16px auto;background:var(--ground);border:1px solid var(--edge);border-radius:12px;display:flex;flex-direction:column;overflow:hidden}
     .cap{font-size:11px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase;padding:16px 0 8px}
     .col{width:720px;margin:0 auto;flex:1;display:flex;flex-direction:column;min-height:0}
     .demo{background:var(--fill);border:1px solid var(--edge);border-radius:12px;padding:14px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
     .note{font-size:12px;color:var(--muted);margin-left:auto}
     .chip{height:28px;padding:0 10px;display:inline-flex;align-items:center;border-radius:8px;border:1px solid var(--edge);font-size:12.5px;color:var(--muted);cursor:pointer;background:none;font-family:inherit;transition:background .12s,color .12s,border-color .12s,transform .09s}
     .chip:hover{background:var(--hover);color:var(--ink);border-color:var(--faint)}
     .chip:active{background:var(--well);transform:translateY(1px)}
     .chip:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
     .btnr{height:28px;padding:0 12px;border-radius:10px;background:var(--accent);color:#fff;border:0;border-bottom:1px solid #a9512f;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer;transition:background .12s,transform .09s}
     .btnr:hover{background:#b85a3c}
     .btnr:active{background:#a9512f;transform:translateY(1px)}
     .btnr:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
     .ib{width:32px;height:32px;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer;border:0;background:none;font-size:15px;transition:background .12s,color .12s,transform .09s}
     .ib:hover{background:var(--well);color:var(--ink)}
     .ib:active{background:var(--hover);transform:scale(.96)}
     .field{height:32px;padding:0 10px;display:flex;align-items:center;border-radius:10px;border:1px solid var(--edge);font-size:13px;background:var(--fill);flex:1;transition:border-color .12s}
     .field:hover{border-color:var(--accent)}
     .field:focus{outline:2px solid var(--accent);outline-offset:1px}
     .feed{flex:1;padding:16px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden}
     .msg{display:flex;gap:8px;align-items:flex-start;border-radius:10px;padding:8px;transition:background .12s}
     .msg:hover{background:var(--hover)}
     .av{width:22px;height:22px;border-radius:99px;background:#eadfd9;color:#9c6145;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none}
     .tx{font-size:14px;line-height:21px}
     .composer{display:flex;justify-content:center;padding-bottom:16px}
     .box{width:720px;background:var(--fill);border:1px solid var(--edge);border-radius:12px;box-shadow:0 6px 20px rgba(20,20,19,.07);padding:14px 16px 12px;position:relative}
     @keyframes open{from{transform:scaleY(.86);opacity:0}to{transform:scaleY(1);opacity:1}}
     .pane{position:absolute;left:12px;right:12px;bottom:100%;background:var(--fill);border:1px solid var(--edge);border-bottom:0;border-radius:12px 12px 0 0;padding:8px;display:flex;flex-direction:column;gap:1px;margin-bottom:-1px;transform-origin:bottom center;animation:open .19s cubic-bezier(.2,.8,.2,1) both}
     .prow{height:30px;padding:0 8px;display:flex;align-items:center;gap:8px;border-radius:8px;font-size:13px;cursor:pointer;color:var(--ink);transition:background .12s}
     .prow:hover{background:var(--hover)}
     .prow span{font-size:12.5px;color:var(--muted)}
     .tag{margin-left:auto;font-size:10.5px;font-weight:500;color:var(--accent);padding:0 5px}
     .ph{color:var(--faint);font-size:14px}
     .tools{display:flex;align-items:center;gap:6px;margin-top:12px}
     .space{height:28px;padding:0 8px;display:flex;align-items:center;gap:6px;border-radius:8px;font-size:12.5px;color:var(--muted);cursor:pointer;border:0;background:none;font-family:inherit;transition:background .12s,color .12s,transform .09s}
     .space:hover{background:var(--hover);color:var(--ink)}
     .space:active{transform:translateY(1px)}
     .send{margin-left:auto;width:32px;height:32px;border-radius:99px;background:var(--accent);color:#fff;border:0;border-bottom:1px solid #a9512f;cursor:pointer;font-size:15px;transition:background .12s,transform .09s}
     .send:hover{background:#b85a3c}
     .send:active{background:#a9512f;transform:translateY(1px)}
     .send:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
     </style>
     <div class="sheet">
       <div class="col">
         <div class="cap">Hover 120ms · press 90ms with a 1px sink · 2px ring on focus</div>
         <div class="demo">
           <button class="chip">Focus me with Tab</button>
           <button class="btnr">Send</button>
           <button class="ib">⌇</button>
           <input class="field" value="A field with a ring on focus">
           <span class="note">try hover, press and Tab</span>
         </div>
         <div class="cap">Suggestion pane — opens at 190ms from the box's edge</div>
         <div class="feed">
           <div class="msg"><span class="av">D</span><span class="tx"><b style="color:#9c6145">Design</b> <span style="color:var(--faint);font-size:11px">09:41</span><br>Every control acknowledges the pointer and the keyboard; the conversation itself stays still, so reading is never interrupted by something moving underneath.</span></div>
           <div class="msg"><span class="av">O</span><span class="tx"><b style="color:#9c6145">Orchestrator</b> <span style="color:var(--faint);font-size:11px">09:43</span><br>Rows, chips and buttons share one hover and one press, so the hand learns the app once.</span></div>
         </div>
         <div class="composer"><div class="box">
           <div class="pane">
             <div class="prow">▢ bot-herdr <span>main</span><span class="tag">space</span></div>
             <div class="prow">✦ Orchestrator <span>the lead</span><span class="tag">@</span></div>
             <div class="prow">✦ Design <span>ui, a11y</span><span class="tag">@</span></div>
           </div>
           <div class="ph">Write a message, run a command, or ask an agent</div>
           <div class="tools"><button class="ib">⌇</button><button class="space">▢ bot-herdr ⌄</button><button class="send">↑</button></div>
         </div></div>
       </div>
     </div>
     ```
   - Alive — the above plus messages arriving with a 240ms fade-and-rise, rows staggering 22ms when a
     page or pane opens, and the working line keeping its slide; the most expressive and the most
     likely to feel busy in a long feed.
     ```mockup
     <style>
     :root{--ground:#faf9f5;--fill:#fff;--edge:#e3e0d7;--ink:#141413;--muted:#73726c;--faint:#6c6a66;--well:#ebe9e2;--hover:#f4f3ef;--accent:#c96442;--kbd:#efeeea}
     *{box-sizing:border-box}
     body{margin:0;background:#dedbd2;color:var(--ink);font:13px/1.45 ui-sans-serif,system-ui,"Segoe UI",sans-serif}
     @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
     .sheet{width:1200px;height:720px;margin:16px auto;background:var(--ground);border:1px solid var(--edge);border-radius:12px;display:flex;flex-direction:column;overflow:hidden}
     .cap{font-size:11px;color:var(--faint);letter-spacing:.06em;text-transform:uppercase;padding:16px 0 8px}
     .col{width:720px;margin:0 auto;flex:1;display:flex;flex-direction:column;min-height:0}
     .demo{background:var(--fill);border:1px solid var(--edge);border-radius:12px;padding:14px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
     .note{font-size:12px;color:var(--muted);margin-left:auto}
     .chip{height:28px;padding:0 10px;display:inline-flex;align-items:center;border-radius:8px;border:1px solid var(--edge);font-size:12.5px;color:var(--muted);cursor:pointer;background:none;font-family:inherit;transition:background .12s,color .12s,border-color .12s,transform .09s}
     .chip:hover{background:var(--hover);color:var(--ink);border-color:var(--faint)}
     .chip:active{background:var(--well);transform:translateY(1px)}
     .chip:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
     .btnr{height:28px;padding:0 12px;border-radius:10px;background:var(--accent);color:#fff;border:0;border-bottom:1px solid #a9512f;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer;transition:background .12s,transform .09s}
     .btnr:hover{background:#b85a3c}
     .btnr:active{background:#a9512f;transform:translateY(1px)}
     .btnr:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
     .ib{width:32px;height:32px;border-radius:99px;display:inline-flex;align-items:center;justify-content:center;color:var(--muted);cursor:pointer;border:0;background:none;font-size:15px;transition:background .12s,color .12s,transform .09s}
     .ib:hover{background:var(--well);color:var(--ink)}
     .ib:active{background:var(--hover);transform:scale(.96)}
     .field{height:32px;padding:0 10px;display:flex;align-items:center;border-radius:10px;border:1px solid var(--edge);font-size:13px;background:var(--fill);flex:1;transition:border-color .12s}
     .field:hover{border-color:var(--accent)}
     .field:focus{outline:2px solid var(--accent);outline-offset:1px}
     .feed{flex:1;padding:16px 0;display:flex;flex-direction:column;gap:14px;overflow:hidden}
     @keyframes arrive{0%{opacity:0;transform:translateY(6px)}12%{opacity:1;transform:none}88%{opacity:1;transform:none}100%{opacity:0;transform:translateY(6px)}}
     .msg{display:flex;gap:8px;align-items:flex-start;border-radius:10px;padding:8px;transition:background .12s;animation:arrive 6s ease-out both}
     .msg:nth-child(1){animation-delay:0s}
     .msg:nth-child(2){animation-delay:.3s}
     .msg:nth-child(3){animation-delay:.6s}
     .msg:hover{background:var(--hover)}
     .av{width:22px;height:22px;border-radius:99px;background:#eadfd9;color:#9c6145;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none}
     .tx{font-size:14px;line-height:21px}
     .typing{display:flex;gap:8px;align-items:center;padding:8px;color:var(--muted);font-size:12.5px}
     .typing i{width:5px;height:5px;border-radius:99px;background:var(--accent);display:inline-block;animation:pulse 1.6s ease-in-out infinite}
     .typing i:nth-child(2){animation-delay:.2s}
     .typing i:nth-child(3){animation-delay:.4s}
     @keyframes pulse{0%,100%{opacity:.25;transform:scale(.9)}50%{opacity:.95;transform:scale(1)}}
     .composer{display:flex;justify-content:center;padding-bottom:16px}
     .box{width:720px;background:var(--fill);border:1px solid var(--edge);border-radius:12px;box-shadow:0 6px 20px rgba(20,20,19,.07);padding:14px 16px 12px;position:relative}
     @keyframes open{from{transform:scaleY(.86);opacity:0}to{transform:scaleY(1);opacity:1}}
     .pane{position:absolute;left:12px;right:12px;bottom:100%;background:var(--fill);border:1px solid var(--edge);border-bottom:0;border-radius:12px 12px 0 0;padding:8px;display:flex;flex-direction:column;gap:1px;margin-bottom:-1px;transform-origin:bottom center;animation:open .19s cubic-bezier(.2,.8,.2,1) both}
     .prow{height:30px;padding:0 8px;display:flex;align-items:center;gap:8px;border-radius:8px;font-size:13px;cursor:pointer;color:var(--ink);transition:background .12s;animation:open .24s ease-out both}
     .prow:nth-child(2){animation-delay:.02s}
     .prow:nth-child(3){animation-delay:.04s}
     .prow:hover{background:var(--hover)}
     .prow span{font-size:12.5px;color:var(--muted)}
     .tag{margin-left:auto;font-size:10.5px;font-weight:500;color:var(--accent);padding:0 5px}
     .ph{color:var(--faint);font-size:14px}
     .tools{display:flex;align-items:center;gap:6px;margin-top:12px}
     .space{height:28px;padding:0 8px;display:flex;align-items:center;gap:6px;border-radius:8px;font-size:12.5px;color:var(--muted);cursor:pointer;border:0;background:none;font-family:inherit;transition:background .12s,color .12s,transform .09s}
     .space:hover{background:var(--hover);color:var(--ink)}
     .space:active{transform:translateY(1px)}
     .send{margin-left:auto;width:32px;height:32px;border-radius:99px;background:var(--accent);color:#fff;border:0;border-bottom:1px solid #a9512f;cursor:pointer;font-size:15px;transition:background .12s,transform .09s}
     .send:hover{background:#b85a3c}
     .send:active{background:#a9512f;transform:translateY(1px)}
     .send:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
     </style>
     <div class="sheet">
       <div class="col">
         <div class="cap">Hover 120ms · press 90ms · focus ring · rows stagger 22ms</div>
         <div class="demo">
           <button class="chip">Focus me with Tab</button>
           <button class="btnr">Send</button>
           <button class="ib">⌇</button>
           <input class="field" value="A field with a ring on focus">
           <span class="note">the feed replays every 6s</span>
         </div>
         <div class="cap">A reply arrives — 240ms fade and rise, then the working line moves on</div>
         <div class="feed">
           <div class="msg"><span class="av">O</span><span class="tx"><b style="color:#9c6145">Orchestrator</b> <span style="color:var(--faint);font-size:11px">09:43</span><br>Messages land rather than appear, and the pane's rows follow each other by 22ms, so an opening reads as one gesture.</span></div>
           <div class="msg"><span class="av">D</span><span class="tx"><b style="color:#9c6145">Design</b> <span style="color:var(--faint);font-size:11px">09:44</span><br>The working line still slides between agents, and its verb still fades in. Reduced motion drops every one of these and keeps the state change.</span></div>
           <div class="msg"><span class="av">Q</span><span class="tx"><b style="color:#9c6145">QA</b> <span style="color:var(--faint);font-size:11px">09:45</span><br>Contrast test is in; twelve pairs fixed.</span></div>
           <div class="typing"><span>Design is writing</span><i></i><i></i><i></i></div>
         </div>
         <div class="composer"><div class="box">
           <div class="pane">
             <div class="prow">▢ bot-herdr <span>main</span><span class="tag">space</span></div>
             <div class="prow">✦ Orchestrator <span>the lead</span><span class="tag">@</span></div>
             <div class="prow">✦ Design <span>ui, a11y</span><span class="tag">@</span></div>
           </div>
           <div class="ph">Write a message, run a command, or ask an agent</div>
           <div class="tools"><button class="ib">⌇</button><button class="space">▢ bot-herdr ⌄</button><button class="send">↑</button></div>
         </div></div>
       </div>
     </div>
     ```

## Notes

- **What "done" means for me** (step 7), once the three answers are in:
  1. One `TYPE` scale in `look.js` next to `SIZE`, every `text_size` call drawn from it — the
     distinct count drops from 14 to the chosen five (or four/three if an option says so).
  2. One spacing set (`S 4/8/12/16` or the chosen one) replacing the 13 `gap`, 12 `px` and 10 `py`
     values; every control height from a named set, not a literal.
  3. Radii only from `SIZE.radius/control/nested` (a fourth token if a chosen direction needs one);
     pips and marks get a token instead of 2 and 4.
  4. One hover style, one press style, one focus ring — applied by the shared helpers, including
     the copies in `chat.js`, `work.js`, `settings.js`, `switch.js`, `pick.js`, `lightbox.js`.
  5. One loading treatment and one empty treatment, used by Chat, Tasks, Plans, Knowledge and
     Settings; Knowledge stops saying "No notes match." while it loads (`work.js:1102`).
  6. Reading measures corrected: chat body ≤ 75 characters, the plan document no wider than its
     card minus padding (`work.js:1026-1046`), and the nested `max_h(460)` reply scroll
     (`chat.js:793-807`) gone or bounded by the feed instead.
  7. `MOTION` gains the durations the rest of the app uses, so `transition()` literals (10 distinct
     today) come from one place; every animation in the feed honours reduced motion.
- **Focus is not a taste call.** Even under "Instant", a visible focus ring and `tab_index` on the
  58 clickable elements are required; the mockups show it on every option. `gpui-kit.d.ts:1276`
  gives `.focus()`; `tab_index` (`:1062`) and `accessibility_label` (`:981`) exist too. Whether
  `.focus()` fires on keyboard focus or only on a clicked focus handle needs one check in the app
  before I promise a ring everywhere.
- **Half-pixel sizes are a real risk.** The UI is drawn in the user's terminal font
  (`viewer.js:55`), so 11.5/12.5 may rasterise to the same height on some faces. Any option is
  fine; the *set* must be reducible to whole pixels if a face demands it. I would keep the
  0.5 steps only for the two sizes where they earn their keep.
- **Step 1 (contrast) is independent.** Nothing here may change a foreground/background pair;
  re-running the contrast test after step 7 must show the same or better ratios. Raising `faint`
  for AA (panel §2) makes it visually heavier — so if the type scale shrinks the smallest size, do
  it *after* the contrast pass, not before.
- **Do not move the layout numbers** that belong to herdr's chrome: sidebar 268 / brand 46 /
  footer 69 / top bar 42 / status 28 and the Terminals padding 8, gap 8, radius 10
  (`layouts/bot-herdr.json`) unless the person asks for a layout change — that was question 2 of
  the panel round.
- Anchors worth opening first when implementing: `look.js:54-81` (add `TYPE`, spacing, motion),
  `chat.js:196-218` and `chat.js:778-791` (header/link helpers), `chat.js:874-886` (the chip link),
  `composer.js:1136` (kbd), `composer.js:1210` (icon button), `work.js:451-472` and
  `work.js:765-798` (two segmented copies), `work.js:942` (second seat hues — should call
  `agentHue`), `settings.js:543-557` (the inverted field), `settings.js:853` (26px icon button),
  `lightbox.js:113` (hex-suffix alpha).
- I did not see this running: no herdr build in this sandbox, so every judgement above is from the
  source and the layout file. The mockups are static HTML at 1200px in the current warm palette and
  system sans (the real face is the user's terminal font), and they are the only picture of the
  proposals I can offer.

## Style
spacing, radius, hover and press effects, motion
