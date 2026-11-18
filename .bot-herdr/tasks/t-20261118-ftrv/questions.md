1. [ORCHESTRATOR] Where does the user set up their own agent?
   - Settings card (Recommended) — an "Add agent" button on the Settings agents list, same card as the built-in roles
   - Files in the project — one markdown file per agent under .bot-herdr/agents/, edited by hand
   - Both — Settings for global agents, project files for project-only ones

2. [DEV] What does a custom agent consist of?
   - Name, harness, model, effort, instructions (Recommended) — what the built-in cards already have, plus a one-line "what it does"
   - Same, plus a file-access switch — choose whether it may edit files (gets its own worktree) or only reads
   - Same, plus based on a built-in role — starts from Dev, Design, QA, Research or Scout's role prompt and adds its own instructions

3. [ORCHESTRATOR] How do custom agents get work?
   - Both ways (Recommended) — the user can @mention them in chat, and the Orchestrator may delegate to them by their "what it does"
   - Only by @mention — the Orchestrator never hands them work on its own
   - Only through the Orchestrator — they aren't chat targets

4. [ORCHESTRATOR] Do they apply to every project or just one?
   - Every project (Recommended) — kept with the rest of the team settings
   - Per project — each project has its own set
