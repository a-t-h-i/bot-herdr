1. [ORCHESTRATOR] Your tree has uncommitted edits in agent.mjs, runner.mjs, settings.js, README.md and test/headless.test.mjs (full access as root via IS_SANDBOX, and a Settings rework). This task edits the same files. What should I do with them?
   - Commit them first — I commit them now as their own commit ("Let full access run as root via IS_SANDBOX"), then the task builds on top
   - Build on them uncommitted — the team works in your tree with them in place, and they end up in this task's commit
   - Leave them out — the team works from the last commit; merging back may clash with your edits and I will stop and ask if it does
