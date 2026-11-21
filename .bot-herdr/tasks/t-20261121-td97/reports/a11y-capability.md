# gpui-kit accessibility capability report

Checked against `mods/bot-herdr/gpui-kit.d.ts` and the app's own `herdr.d.ts`.

| Capability | Exposed | Used for |
| --- | --- | --- |
| role(name) | yes | Give every custom list, tab and dialog a role. |
| accessibility_label(text) | yes | Label every icon-only control. |
| aria_selected(bool) | yes | Report the chosen tab, option or chip. |
| aria_level(n) | yes | Headings announce their level. |
| set_position(i, n) | yes | Say 'tab 2 of 5' on tab lists. |
| aria_active_descendant() | yes | Mark the highlighted option of a combobox. |
| tab_index / track_focus | yes | Every list, panel and dialog owns a focus handle. |
| Live region (aria_live / announce) | no | Polite 'Dev needs you: plan question' announcements. |
| OS reduced motion | no | Honour the system's motion setting. |
| Mouse back button | no | Return to the previous view with the mouse's back button. |

MouseButton is `"left" | "right" | "middle"`.

## Upstream requests (herdr-app / gpui-kit)

- **Live region (aria_live / announce)**: Polite 'Dev needs you: plan question' announcements.
- **OS reduced motion**: Honour the system's motion setting.
- **Mouse back button**: Return to the previous view with the mouse's back button.

## What the mod does without them

- Status changes are drawn in a `role("status")`-labelled region; the window title and the Home tab badge carry the same state.
- A persisted **Reduce motion** toggle in Settings › General freezes every animation when the OS cannot say.
- `Esc` and breadcrumb clicks go back; a hardware back button is not available to a mod.
