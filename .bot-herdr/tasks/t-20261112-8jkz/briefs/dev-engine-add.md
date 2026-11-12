Addendum from the Orchestrator: step 6 of t-20261112-8jkz, in files you already own plus lib/tasks.mjs and lib/plans.mjs. Do it after steps 2 and 3; same report. The person wants to delete a stopped task and discard a plan.

1. `bh task delete <id>`: add `deleteTask(root, id)` to lib/tasks.mjs and a `delete` sub-command beside `archive` at bh.mjs:195.
   - Status `active`: refuse, exit 1, `<id> is active: pause or finish it first.`
   - Task with a worktree (task.git?.mode === "worktree" and task.git.path exists): run `git worktree remove <path>` (no --force) from root first. If git refuses, delete nothing, exit 1, and print git's reason plus `Commit or discard its changes, then delete it again.`
   - Then remove .bot-herdr/tasks/<id>/ recursively. Never delete a branch.
   - Reply `Deleted <id>.`, plus ` Its branch <branch> is kept.` when task.git?.branch is set. --json: { deleted: "<id>", branch: "<branch>" | null }.
2. `bh plan delete <id>`: add `deletePlan(root, id)` to lib/plans.mjs and a `delete` sub-command beside `archive` at bh.mjs:270.
   - Removes .bot-herdr/plans/<id>/ recursively, and the open question files in <app home>/data/bot-herdr/questions/ whose record has `plan: "<id>"` (the .json and its <qid>-*.html/.png files). Answered ones under answered/ stay.
   - A plan that became a task can be deleted; its task stays.
   - Reply `Discarded <id>.`; --json: { deleted: "<id>", questions: <number of open question sets removed> }.
3. Add both to the UsageError strings (bh.mjs:200 and :276) and to `bh help`, next to archive.
4. Tests: an active task is refused and kept; a paused task and a done task are deleted; a refused worktree removal leaves the task folder; plan delete removes the plan folder and only that plan's open questions (BH_APP_HOME at a temp folder).

Contract (Design builds the buttons on this, don't change it): the two commands, their arguments, exit codes and --json shapes exactly as above.
