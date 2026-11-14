1. [ORCHESTRATOR] What should the first phase fix first?
   - Handoffs — reports land on the task (an inbox), briefs update mid-session, the board stays small
   - Verification — `bh check` and the QA gate stop passing on empty runs, untracked files and worktrees
   - Visibility — you see who is working on what, child reports grouped, questions on every page
   - Cost — tokens and time per agent and task are recorded and shown

2. [DEV] How should two agents on one task be kept off each other's files?
   - File claims — `bh spawn --files` records what a child may touch, and an overlapping claim is refused
   - Worktree per child — each writing child gets its own checkout; merging back is my step
   - Rule only — keep today's written rule and spend the effort elsewhere

3. [QA] When `bh check` finds no lint, typecheck or test for what changed, what should it do?
   - Run the full suite — falls back to the project's test command (here 188 tests, about 21 s)
   - Fail as unverified — exits non-zero, so nothing passes on an empty run
   - Warn and pass — says plainly that nothing ran, still exits 0

4. [DESIGN] Should the chat show a live list of agents, or keep one working line?
   - Presence strip — one compact row per live agent above the composer: name, status, what it is doing now, elapsed; a click opens its terminal.
     ```mockup
    <style>
    *{box-sizing:border-box}
    html,body{margin:0}
    body{width:1200px;height:825px;overflow:hidden;background:#262624;color:#faf9f5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .top{height:44px;padding:0 16px;display:flex;align-items:center;border-bottom:1px solid #4a4a47}
    .tabs{display:flex;gap:4px}
    .tab{height:29px;padding:0 12px;display:flex;align-items:center;gap:6px;border-radius:8px;font-size:12px;color:#bbb9b2}
    .tab.on{background:#30302e;color:#faf9f5}
    .main{height:781px;display:flex;flex-direction:column;align-items:center}
    .feed{width:660px;flex:1;display:flex;flex-direction:column;gap:22px;padding:16px 0 10px;justify-content:flex-end;overflow:hidden}
    .me{align-self:flex-end;max-width:520px;background:#3a3a37;border:1px solid #51514d;border-radius:12px;padding:12px 16px;font-size:13.5px;line-height:20px}
    .r{width:640px}
    .meta{display:flex;align-items:center;gap:8px;font-size:12px;height:18px}
    .name{font-weight:600}
    .time{color:#abaaa4;font-size:11px}
    .body{font-size:13.5px;line-height:20px;color:#faf9f5}
    .body .muted{color:#bbb9b2}
    .strip{width:660px;background:#30302e;border:1px solid #4a4a47;border-radius:12px;padding:6px 6px 8px;margin-bottom:8px}
    .shead{display:flex;align-items:center;padding:2px 8px 4px;font-size:10.5px;letter-spacing:.04em;color:#abaaa4;text-transform:uppercase}
    .shead .right{margin-left:auto;text-transform:none;letter-spacing:0;color:#bbb9b2}
    .srow{display:flex;align-items:center;gap:8px;height:34px;padding:0 8px;border-radius:8px}
    .srow.you{background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.32)}
    .av{flex:none;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:600;border:1px solid}
    .nm{flex:none;width:88px;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .st{flex:none;width:76px;display:flex;align-items:center;gap:5px;font-size:11px;color:#bbb9b2}
    .dot{width:6px;height:6px;border-radius:50%}
    .act{flex:1;min-width:0;font-size:12px;color:#bbb9b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .age{flex:none;font-size:11px;color:#abaaa4}
    .answer{flex:none;height:28px;padding:0 12px;border-radius:8px;background:#e1987e;color:#141413;font-size:11px;font-weight:600;display:flex;align-items:center}
    .rowa{display:flex;align-items:center;gap:8px}
    .composer{width:660px;height:76px;background:#30302e;border:1px solid #4a4a47;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;justify-content:space-between}
    .ph{font-size:13.5px;color:#abaaa4}
    .tools{display:flex;align-items:center;gap:8px;height:28px}
    .tool{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#bbb9b2}
    .send{margin-left:auto;width:28px;height:28px;border-radius:50%;background:#e1987e;display:flex;align-items:center;justify-content:center;color:#141413;font-size:14px}
    </style>
    <div class="top">
      <div class="tabs">
        <div class="tab on">Chat</div><div class="tab">Terminals</div><div class="tab">Tasks</div><div class="tab">Plans</div><div class="tab">Knowledge</div><div class="tab">Settings</div>
      </div>
    </div>
    <div class="main">
      <div class="feed">
        <div class="me">Check who is working right now, and whether Dev's and QA's reports landed before you called it done.</div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#e1987e">Orchestrator</span><span class="time">14:22</span></div>
          <div class="body">Done. Dev built the strip, Design checked the motion, QA tested the focus order. I read both reports before marking step 2 done: <span class="muted">the working line now lists each agent.</span></div>
        </div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#5b8def">Dev</span><span class="time">14:21</span></div>
          <div class="body">Strip is in <span style="color:#e1987e">src/chat.js:958</span>. Rows read from <span style="color:#e1987e">workers()</span>, so the rotating line is gone.</div>
        </div>
      </div>
      <div class="strip">
        <div class="shead"><span>Working now · 4</span><span class="right">3 working · 1 needs you</span></div>
        <div class="srow">
          <div class="av" style="background:rgba(225,152,126,.16);border-color:rgba(225,152,126,.45);color:#e1987e">O</div>
          <div class="nm" style="color:#e1987e">Orchestrator</div>
          <div class="st"><span class="dot" style="background:#34d399"></span>working</div>
          <div class="act">Waiting on 3 children</div><div class="age">12m</div>
        </div>
        <div class="srow">
          <div class="av" style="background:rgba(91,141,239,.16);border-color:rgba(91,141,239,.45);color:#5b8def">D</div>
          <div class="nm" style="color:#5b8def">Dev</div>
          <div class="st"><span class="dot" style="background:#34d399"></span>working</div>
          <div class="act">Editing src/chat.js — presence rows</div><div class="age">4m</div>
        </div>
        <div class="srow">
          <div class="av" style="background:rgba(214,130,90,.16);border-color:rgba(214,130,90,.45);color:#d6825a">D</div>
          <div class="nm" style="color:#d6825a">Design</div>
          <div class="st"><span class="dot" style="background:#34d399"></span>working</div>
          <div class="act">Checking the row at 1200px</div><div class="age">1m</div>
        </div>
        <div class="srow you">
          <div class="av" style="background:rgba(63,168,119,.16);border-color:rgba(63,168,119,.45);color:#3fa877">Q</div>
          <div class="nm" style="color:#3fa877">QA</div>
          <div class="st"><span class="dot" style="background:#fbbf24"></span>needs you</div>
          <div class="act">Should child reports stay in the feed?</div><div class="answer">Answer</div>
        </div>
      </div>
      <div class="composer">
        <div class="ph">Write a message, run a command, or ask an agent</div>
        <div class="tools"><div class="tool">＋</div><div class="tool">▤</div><div class="send">↑</div></div>
      </div>
    </div>
     ```
   - Name the working line — keep the one line and add the agent's name, its current action and a working count; nothing else moves.
     ```mockup
    <style>
    *{box-sizing:border-box}
    html,body{margin:0}
    body{width:1200px;height:825px;overflow:hidden;background:#262624;color:#faf9f5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .top{height:44px;padding:0 16px;display:flex;align-items:center;border-bottom:1px solid #4a4a47}
    .tabs{display:flex;gap:4px}
    .tab{height:29px;padding:0 12px;display:flex;align-items:center;border-radius:8px;font-size:12px;color:#bbb9b2}
    .tab.on{background:#30302e;color:#faf9f5}
    .main{height:781px;display:flex;flex-direction:column;align-items:center}
    .feed{width:660px;flex:1;display:flex;flex-direction:column;gap:22px;padding:16px 0 12px;justify-content:flex-end;overflow:hidden}
    .me{align-self:flex-end;max-width:520px;background:#3a3a37;border:1px solid #51514d;border-radius:12px;padding:12px 16px;font-size:13.5px;line-height:20px}
    .r{width:640px}
    .meta{display:flex;align-items:center;gap:8px;height:18px;font-size:12px}
    .name{font-weight:600}
    .time{color:#abaaa4;font-size:11px}
    .body{font-size:13.5px;line-height:20px}
    .muted{color:#bbb9b2}
    .line{width:660px;height:28px;display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px}
    .glyph{width:16px;height:16px;flex:none;position:relative}
    .glyph i{position:absolute;left:0;width:16px;height:2px;border-radius:2px;background:rgba(91,141,239,.35)}
    .glyph i:nth-child(1){top:4px}
    .glyph i:nth-child(2){top:9px;width:10px;background:#5b8def}
    .glyph i:nth-child(3){top:14px}
    .who{font-weight:600;color:#5b8def}
    .what{color:#bbb9b2;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .count{margin-left:auto;flex:none;height:28px;padding:0 10px;border:1px solid #4a4a47;border-radius:8px;display:flex;align-items:center;gap:4px;font-size:12px;color:#bbb9b2;background:#30302e}
    .composer{width:660px;height:76px;background:#30302e;border:1px solid #4a4a47;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;justify-content:space-between}
    .ph{font-size:13.5px;color:#abaaa4}
    .tools{display:flex;align-items:center;gap:8px;height:28px}
    .tool{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#bbb9b2}
    .send{margin-left:auto;width:28px;height:28px;border-radius:50%;background:#e1987e;display:flex;align-items:center;justify-content:center;color:#141413;font-size:14px}
    </style>
    <div class="top">
      <div class="tabs">
        <div class="tab on">Chat</div><div class="tab">Terminals</div><div class="tab">Tasks</div><div class="tab">Plans</div><div class="tab">Knowledge</div><div class="tab">Settings</div>
      </div>
    </div>
    <div class="main">
      <div class="feed">
        <div class="me">Check who is working right now, and whether Dev's and QA's reports landed before you called it done.</div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#e1987e">Orchestrator</span><span class="time">14:22</span></div>
          <div class="body">Done. Dev built the strip, Design checked the motion, QA tested the focus order. I read both reports before marking step 2 done: <span class="muted">the working line now names the agent.</span></div>
        </div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#5b8def">Dev</span><span class="time">14:21</span></div>
          <div class="body">Line is updated in <span style="color:#e1987e">src/chat.js:958</span>: it reads <span style="color:#e1987e">workers()[turn]</span>, so the name and what it is doing are on the line.</div>
        </div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#d6825a">Design</span><span class="time">14:20</span></div>
          <div class="body">Name in the agent's hue, activity muted after the dot; the count stays a quiet button.</div>
        </div>
      </div>
      <div class="line">
        <div class="glyph"><i></i><i></i><i></i></div>
        <div class="who">Dev</div>
        <div class="what">· Editing src/chat.js — presence rows</div>
        <div class="count">1 of 3 working <span>›</span></div>
      </div>
      <div class="composer">
        <div class="ph">Write a message, run a command, or ask an agent</div>
        <div class="tools"><div class="tool">＋</div><div class="tool">▤</div><div class="send">↑</div></div>
      </div>
    </div>
     ```
   - Agents rail — a fixed column beside the chat with every agent grouped needs-you, working, idle; the chat column gives up that width.
     ```mockup
    <style>
    *{box-sizing:border-box}
    html,body{margin:0}
    body{width:1200px;height:825px;overflow:hidden;background:#262624;color:#faf9f5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .top{height:44px;padding:0 16px;display:flex;align-items:center;border-bottom:1px solid #4a4a47}
    .tabs{display:flex;gap:4px}
    .tab{height:29px;padding:0 12px;display:flex;align-items:center;border-radius:8px;font-size:12px;color:#bbb9b2}
    .tab.on{background:#30302e;color:#faf9f5}
    .page{height:781px;display:flex;justify-content:center;gap:16px;padding:16px 0}
    .column{width:660px;display:flex;flex-direction:column;min-height:0}
    .feed{flex:1;display:flex;flex-direction:column;gap:22px;justify-content:flex-end;overflow:hidden}
    .me{align-self:flex-end;max-width:500px;background:#3a3a37;border:1px solid #51514d;border-radius:12px;padding:12px 16px;font-size:13.5px;line-height:20px}
    .r{width:640px}
    .meta{display:flex;align-items:center;gap:8px;height:18px;font-size:12px}
    .name{font-weight:600}
    .time{color:#abaaa4;font-size:11px}
    .body{font-size:13.5px;line-height:20px}
    .muted{color:#bbb9b2}
    .line{height:28px;display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#bbb9b2}
    .line .who{color:#5b8def;font-weight:600}
    .composer{height:76px;background:#30302e;border:1px solid #4a4a47;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;justify-content:space-between}
    .ph{font-size:13.5px;color:#abaaa4}
    .tools{display:flex;align-items:center;gap:8px;height:28px}
    .tool{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#bbb9b2}
    .send{margin-left:auto;width:28px;height:28px;border-radius:50%;background:#e1987e;display:flex;align-items:center;justify-content:center;color:#141413;font-size:14px}
    .rail{width:248px;flex:none;background:#30302e;border:1px solid #4a4a47;border-radius:12px;padding:10px 8px;align-self:flex-start}
    .rhead{display:flex;align-items:center;padding:2px 8px 8px;font-size:10.5px;letter-spacing:.04em;color:#abaaa4;text-transform:uppercase}
    .rhead b{margin-left:auto;color:#bbb9b2;font-weight:400;letter-spacing:0;text-transform:none;font-size:11px}
    .group{font-size:10.5px;letter-spacing:.04em;color:#abaaa4;text-transform:uppercase;padding:8px 8px 4px}
    .arow{display:flex;gap:8px;padding:6px 8px;border-radius:8px;align-items:flex-start}
    .arow.you{background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.32);padding:5px 7px}
    .av{flex:none;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;border:1px solid}
    .aw{flex:1;min-width:0}
    .an{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:600}
    .dot{width:6px;height:6px;border-radius:50%;flex:none}
    .aa{font-size:11px;color:#bbb9b2;line-height:15px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .at{font-size:11px;color:#abaaa4}
    .answer{height:26px;padding:0 10px;border-radius:8px;background:#e1987e;color:#141413;font-size:11px;font-weight:600;display:inline-flex;align-items:center;margin-top:6px}
    .q{font-size:11px;color:#fbbf24;line-height:15px;margin-top:2px}
    </style>
    <div class="top">
      <div class="tabs">
        <div class="tab on">Chat</div><div class="tab">Terminals</div><div class="tab">Tasks</div><div class="tab">Plans</div><div class="tab">Knowledge</div><div class="tab">Settings</div>
      </div>
    </div>
    <div class="page">
      <div class="column">
        <div class="feed">
          <div class="me">Check who is working right now, and whether Dev's and QA's reports landed before you called it done.</div>
          <div class="r">
            <div class="meta"><span class="name" style="color:#e1987e">Orchestrator</span><span class="time">14:22</span></div>
            <div class="body">Done. Dev built it, Design checked the motion, QA tested the focus order. I read both reports before marking step 2 done: <span class="muted">the rail lists every agent beside the chat.</span></div>
          </div>
          <div class="r">
            <div class="meta"><span class="name" style="color:#5b8def">Dev</span><span class="time">14:21</span></div>
            <div class="body">Rail is in <span style="color:#e1987e">src/chat.js</span>; rows read from <span style="color:#e1987e">workers()</span> and <span style="color:#e1987e">children()</span>.</div>
          </div>
        </div>
        <div class="line"><span class="who">Dev</span><span>· Editing src/chat.js</span></div>
        <div class="composer">
          <div class="ph">Write a message, run a command, or ask an agent</div>
          <div class="tools"><div class="tool">＋</div><div class="tool">▤</div><div class="send">↑</div></div>
        </div>
      </div>
      <div class="rail">
        <div class="rhead"><span>Agents</span><b>6 live</b></div>
        <div class="group">Needs you</div>
        <div class="arow you">
          <div class="av" style="background:rgba(63,168,119,.16);border-color:rgba(63,168,119,.45);color:#3fa877">Q</div>
          <div class="aw">
            <div class="an" style="color:#3fa877">QA</div>
            <div class="q">Should child reports stay in the feed?</div>
            <div class="answer">Answer</div>
          </div>
        </div>
        <div class="group">Working</div>
        <div class="arow">
          <div class="av" style="background:rgba(225,152,126,.16);border-color:rgba(225,152,126,.45);color:#e1987e">O</div>
          <div class="aw"><div class="an" style="color:#e1987e">Orchestrator<span class="dot" style="background:#34d399"></span></div><div class="aa">Waiting on 3 children · 12m</div></div>
        </div>
        <div class="arow">
          <div class="av" style="background:rgba(91,141,239,.16);border-color:rgba(91,141,239,.45);color:#5b8def">D</div>
          <div class="aw"><div class="an" style="color:#5b8def">Dev<span class="dot" style="background:#34d399"></span></div><div class="aa">Editing src/chat.js · 4m</div></div>
        </div>
        <div class="arow">
          <div class="av" style="background:rgba(214,130,90,.16);border-color:rgba(214,130,90,.45);color:#d6825a">D</div>
          <div class="aw"><div class="an" style="color:#d6825a">Design<span class="dot" style="background:#34d399"></span></div><div class="aa">Checking the row at 1200px · 1m</div></div>
        </div>
        <div class="group">Idle</div>
        <div class="arow">
          <div class="av" style="background:rgba(164,123,214,.16);border-color:rgba(164,123,214,.45);color:#a47bd6">R</div>
          <div class="aw"><div class="an" style="color:#a47bd6">Research<span class="dot" style="background:#abaaa4"></span></div><div class="aa">Waiting for a task</div></div>
        </div>
        <div class="arow">
          <div class="av" style="background:rgba(62,163,181,.16);border-color:rgba(62,163,181,.45);color:#3ea3b5">S</div>
          <div class="aw"><div class="an" style="color:#3ea3b5">Scout<span class="dot" style="background:#abaaa4"></span></div><div class="aa">Waiting for a task</div></div>
        </div>
      </div>
    </div>
     ```

