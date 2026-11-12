Addendum from the Orchestrator for design-pages (t-20261112-8jkz). I went through every frame of both GIFs; all frames are in .bot-herdr/tasks/t-20261112-8jkz/gif/all/ (planning-light-000..121.png, tasks-toast-light-000..111.png, 40 ms a frame). Add these to your brief; where they conflict with it, these win.

Plans sheet (plandoc.js):
A. Opening (planning-light-025..038): the View plan tab tucks down into the composer's top edge, then the sheet slides in from the right edge while the page behind dims, about 350 ms, easing out. Closing reverses it. Use .transition() with MOTION from look.js as chat.js:770-772 does; check gpui-kit.d.ts for what can be transitioned. If position can't be animated, fade the sheet in with opacity and say so.
B. Hovering a line (planning-light-045, -048): the line gets a c.hover rounded fill, and a comment-plus glyph appears in the sheet's right margin beside it. Clicking opens the comment box under that line, the space opening smoothly (planning-light-056, then -075).
C. After a comment is added (planning-light-121): it shows under its line as an italic note on an accent tint (rounded, full width of the text column), an accent dot marks the line in the left margin, and that line's glyph in the right margin turns accent-outlined.

Tasks page (work.js):
D. Rows: hover is a c.hover rounded fill (tasks-toast-light-014); the selected row is the accent tint with an accent edge (-016).
E. A paused task (tasks-toast-light-080): a "Waiting on" section under the pips with a tinted rounded box holding "Paused" and a Resume actionButton (accent text, play icon). Resume moves out of the action row; an active task keeps Pause in the action row. Resuming removes the box (-091).
F. A task made from a plan (task.plan set): a "Full plan" section with a disclosure row "Read the details of each step" (chevron-right glyph) that opens that plan's sheet (plandoc).
G. With no comments, use this text: "No comments yet. Comment here or in the box below (Markdown and images work there); the Orchestrator takes it into account." then the "Add comment" button (tasks-toast-light-098).
H. Toasts (tasks-toast-light-091..110): the Tasks page's composer must show its toasts rising out of its top edge and sinking back into it, exactly as the chat composer already does (that animation exists; reuse it through the Composer, don't rebuild it). After Pause, Resume, Archive and Delete, say so through it: "Paused <title>", "Resumed <title>", "Archived <title>", "Deleted <title>".

Still left out (no data in bot-herdr): Open in session, the Auto toggle, Approve/Reject in "Waiting on", per-step child-agent timers beyond what stepAgents gives, auto-answer percentages, the scroll-down chevron.
