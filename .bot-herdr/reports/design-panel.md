## Status
OPEN

## Questions

1. Should the chat show a live list of agents, or keep one working line?
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

2. How should a child agent's report appear in the feed?
   - Tag, keep flat — child replies stay where they happened, tagged "child of X" and "report", with a Team only / Everything filter.
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
    .filter{width:660px;display:flex;align-items:center;gap:8px;padding:12px 0 4px}
    .filter .label{font-size:11px;color:#abaaa4}
    .seg{margin-left:auto;display:flex;padding:2px;gap:2px;background:#222220;border-radius:10px}
    .seg div{height:24px;padding:0 10px;display:flex;align-items:center;border-radius:8px;font-size:11px;color:#bbb9b2}
    .seg .on{background:#30302e;color:#faf9f5}
    .feed{width:660px;flex:1;display:flex;flex-direction:column;gap:22px;padding:8px 0 12px;justify-content:flex-end;overflow:hidden}
    .me{align-self:flex-end;max-width:520px;background:#3a3a37;border:1px solid #51514d;border-radius:12px;padding:12px 16px;font-size:13.5px;line-height:20px}
    .r{width:640px}
    .meta{display:flex;align-items:center;gap:8px;height:18px;font-size:12px}
    .name{font-weight:600}
    .time{color:#abaaa4;font-size:11px}
    .body{font-size:13.5px;line-height:20px}
    .muted{color:#bbb9b2}
    .tag{display:flex;align-items:center;gap:6px;height:18px;margin-bottom:3px;font-size:10.5px;color:#abaaa4}
    .pill{height:16px;padding:0 6px;border-radius:8px;background:#222220;border:1px solid #4a4a47;display:flex;align-items:center;gap:4px;color:#bbb9b2;font-size:10px}
    .pill i{width:5px;height:5px;border-radius:50%;background:#abaaa4}
    .line{width:660px;height:28px;display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#bbb9b2}
    .line .who{color:#5b8def;font-weight:600}
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
      <div class="filter"><span class="label">Feed</span><div class="seg"><div>Team only</div><div class="on">Everything</div></div></div>
      <div class="feed">
        <div class="me">Add a presence strip so I can see who is working.</div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#e1987e">Orchestrator</span><span class="time">14:22</span></div>
          <div class="body">Done. Dev built it, Design checked the motion, QA tested the focus order. I read both reports first; step 2 is done.</div>
        </div>
        <div class="r">
          <div class="tag"><span class="pill"><i></i>report</span><span>child of Orchestrator</span></div>
          <div class="meta"><span class="name" style="color:#5b8def">Dev</span><span class="time">14:21</span></div>
          <div class="body">Strip is in <span style="color:#e1987e">src/chat.js:958</span>. Rows read from <span style="color:#e1987e">workers()</span>; the rotating line is gone.</div>
        </div>
        <div class="r">
          <div class="tag"><span class="pill"><i></i>report</span><span>child of Orchestrator</span></div>
          <div class="meta"><span class="name" style="color:#d6825a">Design</span><span class="time">14:20</span></div>
          <div class="body">Rows are 34px, name in the agent's hue, activity truncated. Two fixes, both in.</div>
        </div>
        <div class="r">
          <div class="tag"><span class="pill"><i></i>report</span><span>child of Orchestrator</span></div>
          <div class="meta"><span class="name" style="color:#3fa877">QA</span><span class="time">14:19</span></div>
          <div class="body">Focus order checked; rows are reachable and cost nothing when idle.</div>
        </div>
      </div>
      <div class="line"><span class="who">Dev</span><span>· Editing src/chat.js</span></div>
      <div class="composer">
        <div class="ph">Write a message, run a command, or ask an agent</div>
        <div class="tools"><div class="tool">＋</div><div class="tool">▤</div><div class="send">↑</div></div>
      </div>
    </div>
     ```
   - Group under the turn — each team reply collects the child reports that answered it, indented and compact, opened one by one.
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
    .group{margin-left:16px;border-left:2px solid #4a4a47;padding-left:12px;display:flex;flex-direction:column;gap:10px}
    .ghead{display:flex;align-items:center;gap:8px;height:22px;font-size:11px;color:#bbb9b2}
    .ghead b{font-weight:600;color:#faf9f5}
    .ghead .chev{color:#abaaa4}
    .rep{display:flex;align-items:center;gap:8px;height:34px}
    .rep .av{flex:none;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:600;border:1px solid}
    .rep .rn{flex:none;width:70px;font-size:12px;font-weight:600}
    .rep .rs{flex:1;min-width:0;font-size:12px;color:#bbb9b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rep .rt{flex:none;font-size:11px;color:#abaaa4}
    .rep .open{flex:none;height:24px;padding:0 8px;border:1px solid #4a4a47;border-radius:8px;display:flex;align-items:center;font-size:11px;color:#bbb9b2}
    .line{width:660px;height:28px;display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#bbb9b2}
    .line .who{color:#5b8def;font-weight:600}
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
        <div class="me">Add a presence strip so I can see who is working.</div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#e1987e">Orchestrator</span><span class="time">14:22</span></div>
          <div class="body">Done. Dev built it, Design checked the motion, QA tested the focus order. I read both reports first; step 2 is done.</div>
        </div>
        <div class="group">
          <div class="ghead"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="#abaaa4" stroke-width="1.5" stroke-linecap="round"/></svg><b>3 reports</b><span>this turn · Dev, Design, QA · 2m</span></div>
          <div class="rep">
            <div class="av" style="background:rgba(91,141,239,.16);border-color:rgba(91,141,239,.45);color:#5b8def">D</div>
            <div class="rn" style="color:#5b8def">Dev</div>
            <div class="rs">Strip is in src/chat.js:958; rows read from workers()</div>
            <div class="rt">14:21</div><div class="open">Open</div>
          </div>
          <div class="rep">
            <div class="av" style="background:rgba(214,130,90,.16);border-color:rgba(214,130,90,.45);color:#d6825a">D</div>
            <div class="rn" style="color:#d6825a">Design</div>
            <div class="rs">Rows are 34px, name in the agent's hue; two fixes</div>
            <div class="rt">14:20</div><div class="open">Open</div>
          </div>
          <div class="rep">
            <div class="av" style="background:rgba(63,168,119,.16);border-color:rgba(63,168,119,.45);color:#3fa877">Q</div>
            <div class="rn" style="color:#3fa877">QA</div>
            <div class="rs">Focus order checked; rows reachable, idle costs nothing</div>
            <div class="rt">14:19</div><div class="open">Open</div>
          </div>
        </div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#e1987e">Orchestrator</span><span class="time">14:18</span></div>
          <div class="body muted">Starting QA on the focus order while Dev finishes.</div>
        </div>
      </div>
      <div class="line"><span class="who">Dev</span><span>· Editing src/chat.js</span></div>
      <div class="composer">
        <div class="ph">Write a message, run a command, or ask an agent</div>
        <div class="tools"><div class="tool">＋</div><div class="tool">▤</div><div class="send">↑</div></div>
      </div>
    </div>
     ```
   - Team replies only — the feed shows the team's replies; each turn's child reports sit behind one "N child reports" row.
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
    .expander{width:640px;margin-left:16px;border:1px solid #4a4a47;background:#222220;border-radius:10px;height:40px;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:12px;color:#bbb9b2}
    .expander b{font-weight:600;color:#faf9f5}
    .avs{display:flex;gap:3px;margin-left:auto}
    .av{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:600;border:1px solid}
    .chev{color:#abaaa4}
    .line{width:660px;height:28px;display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#bbb9b2}
    .line .who{color:#5b8def;font-weight:600}
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
        <div class="me">Add a presence strip so I can see who is working.</div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#e1987e">Orchestrator</span><span class="time">14:22</span></div>
          <div class="body">Done. Dev built it, Design checked the motion, QA tested the focus order. I read both reports first; step 2 is done.</div>
        </div>
        <div class="expander">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3" fill="none" stroke="#abaaa4" stroke-width="1.5" stroke-linecap="round"/></svg><b>3 child reports</b><span>Dev, Design, QA</span>
          <div class="avs">
            <div class="av" style="background:rgba(91,141,239,.16);border-color:rgba(91,141,239,.45);color:#5b8def">D</div>
            <div class="av" style="background:rgba(214,130,90,.16);border-color:rgba(214,130,90,.45);color:#d6825a">D</div>
            <div class="av" style="background:rgba(63,168,119,.16);border-color:rgba(63,168,119,.45);color:#3fa877">Q</div>
          </div>
        </div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#e1987e">Orchestrator</span><span class="time">14:18</span></div>
          <div class="body muted">Starting QA on the focus order while Dev finishes. Reports stay folded unless you ask for them.</div>
        </div>
        <div class="r">
          <div class="meta"><span class="name" style="color:#e1987e">Orchestrator</span><span class="time">14:12</span></div>
          <div class="body muted">Task t-20261113-gq2: 3 steps, Dev and QA on it.</div>
        </div>
      </div>
      <div class="line"><span class="who">Dev</span><span>· Editing src/chat.js</span></div>
      <div class="composer">
        <div class="ph">Write a message, run a command, or ask an agent</div>
        <div class="tools"><div class="tool">＋</div><div class="tool">▤</div><div class="send">↑</div></div>
      </div>
    </div>
     ```

## Notes

**What the mod shows today (read this round, with anchors)**
- The working line names no one: `working()` draws only the role's verb and motion (mods/bot-herdr/chat.js:953-1001), one agent at a time, rotated every 4s (mods/bot-herdr/working.js:122). With two Devs, or a Dev and a Design child, the user cannot tell who is where.
- The activity text exists and is never drawn: `poll()` reads each headless agent's current tool call into `this.doing` (chat.js:337-351) and `workers()` returns it (chat.js:540-548); no element renders it.
- Parentage exists and is used only for @-mentions: `children()` returns live child terminals with `parent` and `parentName` (mods/bot-herdr/composer.js:527-537), consumed only in `mentionContext()` (composer.js:582).
- A child's turn is indistinguishable from a team reply: every headless agent's last message is written to the chat reply file (mods/bot-herdr/engine/lib/agent.mjs:304-307) and drawn as an ordinary reply (chat.js:822-859).
- Replies can be lost: `poll()` loops over live agents only (chat.js:302-337), and each turn replaces one reply file per address (engine/lib/agent.mjs:51-53,307). Two turns between polls (2.5s, chat.js:35), or an agent killed or exited before the next poll, leaves nothing in the feed — the "report never arrived" feeling. Needs an engine change (append per turn or keep a per-turn log) plus a UI that reads the whole replies folder.
- A pending question is invisible off the pages with a composer: `OpenQuestions` is polled per page (chat.js:505; mods/bot-herdr/work.js:458); the page switch can draw a tab count (mods/bot-herdr/switch.js:59) but `PAGES` items pass none (switch.js:230). On Terminals, where users watch agents, there is no signal at all.
- The Tasks page hides the evidence: board posts exist (`bh board post/read`, engine/lib/tasks.mjs:145-152) and every brief tells agents to use them (engine/lib/team.mjs:90); reports land in `.bot-herdr/tasks/<id>/reports/<name>.md` (tasks.mjs:201). `taskBody()` draws actions, title, facts, progress, steps, full plan and comments only (work.js:932-948) — no board, no report links.
- "Resume" claims what it did not do: work.js:972-976 toasts `Resumed <title>` after only `sendFromChat(...)`; the status changes only when the Orchestrator acts. The chat widget's Pause swallows failures (`catch {}`, chat.js:385-395).
- Plans: an open question says "Waiting for your answer in the chat" (work.js:1599) although the plan box below answers it; seat pills are static (work.js:1693-1729); "Reading the code…" is a local timer (work.js:1519-1525), not a signal.
- Accessibility: reply actions are hover-only (`opacity(show ? 1 : 0)`, chat.js:822-859,234-247) but stay in the tab order, so keyboard focus lands on invisible buttons.
- Cost: nothing captures usage — runner.mjs parses none, the activity file is `{line, at}` (engine/lib/agent.mjs:228), sessions hold `{harness, session, root, updated}`. A spend number would be invented. Elapsed time is available now (waits.at, activity timestamps, task `workedMs`). Cost needs an engine change first (DEV/orchestrator), then per-agent and per-task spend in the strip and task facts.
- Not missing: the question card answers in one go, the task page already shows each step's owner and time, and plan questions/answers with mockups render well.

**Candidates, in the order I would build them**
1. Presence strip (question 1) — rows from `workers()` + `children()`, activity from `doing`, elapsed from the wait; needs-you row is the question entry point; fixed height so the bottom-anchored feed (chat.js:585-607) does not jump.
2. Child voice (question 2) — parentage from `children()`; always-available fallback is "is this address the lead?".
3. Question visibility — one layout-level `OpenQuestions` (or its stamp in shared state), a count on the Chat/Plans tabs (switch.js:59 already draws `count`) and a line in the strip. Keep the single answer path (`bh answer`).
4. Reply scan (engine + UI) — read the replies folder instead of only live agents; one entry per turn. Without it, 1-3 still show a feed that can lie about what agents said.
5. Task evidence — a Board section (kind, from, age; open comments first) and per-step report links opened in `viewer.js`; no new backend.
6. Delivery state on your own message — "sent 14:02 · working 4m · replied 14:09" or "no status yet" from `waits`/`outcome` (chat.js:292-300; mods/bot-herdr/feed.js:119). Never say "delivered" without evidence.
7. Plan rail states and copy — working / waiting / done per seat (panel members run as `<seat>-panel`), replace the fake "Reading the code…", say "Answer below".
8. Copy/state fixes — "Asked the Orchestrator to resume" plus a pending mark until the status changes; surface a failed Pause.
9. Keyboard — keep reply actions visible (quiet tone) or reveal them on focus, not hover only.
10. Cost — engine captures per-turn usage first; then spend beside elapsed time, per agent and per task, with a daily total.

**Constraints and risks**
- The chat feed is bottom-anchored with measured heights and clamped scroll (chat.js:585-607); a strip whose height changes with the agent count reflows it on every poll. Give it a fixed max height and fold it when nobody works.
- Exact parentage needs the engine or the roster name: `children()` only knows live children, so a child that exited before its reply was read loses its parent. Tag by lead/non-lead if the parent is unknown; never guess silently.
- Board/report UI must reuse `openFile` (viewer.js) and the project paths already resolved in `Work`; do not add another file reader.
- Questions can be answered on several pages; one `OpenQuestions` path only (page composers must keep `hooks.answered` wired).
- No new design tokens: chat column 660, 28px controls, 34px presence row, radii 12/10/8, agent hues from `look.js agentHue`; keep the ONE `actionButton` (28px) rule.
- Motion stays native and stops when idle; the strip must not add polling loops beyond the existing 2.5s/5s timers.

**Done for my seat**
- The chat answers "who is working, on what, since when, and who needs me" without opening Terminals.
- Every reply an agent writes reaches the feed once, even if the agent exits right after.
- Children are visibly internal and filterable; the team's summary and a child's report never read the same.
- A pending question is visible on every page (tab count plus a strip row or notice).
- The task page links the raw evidence (board posts, per-step reports) under the steps.
- No action claims a state it did not set; every action is reachable and visible from the keyboard.
