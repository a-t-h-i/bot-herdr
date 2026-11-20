# Questions for the user (research panel)

1. Which harnesses should skill auto-discovery cover?
   - Claude, Codex, OpenCode — keep discovery as-is (paths verified with `bh tools`)
   - Claude, Codex, OpenCode, Gemini, Qwen, Antigravity — add discovery for every headless harness (paths from docs; OpenCode v2 loads skills by `@skill-id` instead of ACP)

2. What should the new Metrics tab show?
   - Agents and their totals: time, tokens, cost, tasks, steps — per agent (recommended)
   - Also team activity over time: tasks by agent, per-model cost breakdown, utilisation trends
   - Focus on token efficiency: per-agent cache-read share and context re-read estimates
   ```mockup
   <style>
     .metrics { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; color: #1a1a1a; }
     .metrics h1 { font-size: 1.1rem; margin: 8px 0 12px; }
     table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
     th, td { border-bottom: 1px solid #ddd; padding: 6px 10px; text-align: left; }
     th { background: #f4f4f4; font-weight: 600; }
     td.num { text-align: right; }
     tfoot td { font-weight: 700; border-top: 2px solid #000; }
   </style>
   <div class="metrics">
     <h1>Metrics — agents by time, tokens, cache read, cost, tasks, steps</h1>
     <table>
       <thead><tr><th>Agent</th><th>Harness</th><th>Model</th><th>Time</th><th>Tokens</th><th>Cache read</th><th>Cost</th><th>Tasks</th><th>Steps</th></tr></thead>
       <tbody>
         <tr><td>Orchestrator</td><td>opencode</td><td>opencode-go/gemini-4-argon</td><td>14.2 h</td><td class="num">842,310</td><td class="num">620,000</td><td class="num">$21.48</td><td class="num">41</td><td class="num">87</td></tr>
         <tr><td>Design</td><td>opencode</td><td>opencode-go/deepseek-v4.1-flash</td><td>3.1 h</td><td class="num">118,402</td><td class="num">0</td><td class="num">$0.87</td><td class="num">3</td><td class="num">9</td></tr>
         <tr><td>Dev</td><td>opencode</td><td>opencode-go/deepseek-v4.1-flash</td><td>9.8 h</td><td class="num">2,105,102</td><td class="num">1,702,301</td><td class="num">$12.30</td><td class="num">28</td><td class="num">66</td></tr>
         <tr><td>QA</td><td>opencode</td><td>opencode-go/deepseek-v4.1-flash</td><td>6.5 h</td><td class="num">983,101</td><td class="num">512,004</td><td class="num">$7.42</td><td class="num">19</td><td class="num">52</td></tr>
         <tr><td>Research</td><td>opencode</td><td>Research model</td><td>5.3 h</td><td class="num">310,702</td><td class="num">0</td><td class="num">$0.00</td><td class="num">0</td><td class="num">0</td></tr>
         <tr><td>Scout</td><td>opencode</td><td>Scout model</td><td>4.1 h</td><td class="num">88,305</td><td class="num">0</td><td class="num">$0.00</td><td class="num">0</td><td class="num">0</td></tr>
       </tbody>
       <tfoot><tr><td colspan="3">Totals</td><td>43.5 h</td><td class="num">4,247,822</td><td class="num">2,834,309</td><td class="num">$42.27</td><td class="num">91</td><td class="num">214</td></tr></tfoot>
     </table>
   </div>
   ```
