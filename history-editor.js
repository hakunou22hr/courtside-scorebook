(() => {
  'use strict';

  const STORAGE_KEY = 'courtside-scorebook-v2';
  const RETURN_KEY = 'courtside-return-to-history';
  const ACTIONS = {
    ftm: 'FT成功', ftx: 'FT失敗', fg2m: '2P成功', fg2x: '2P失敗',
    fg3m: '3P成功', fg3x: '3P失敗', oreb: 'OREB', dreb: 'DREB',
    ast: 'AST', tov: 'TOV', stl: 'STL', blk: 'BLK'
  };
  const EDITABLE = new Set(Object.keys(ACTIONS));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtClock = s => `${String(Math.floor(Number(s||0)/60)).padStart(2,'0')}:${String(Number(s||0)%60).padStart(2,'0')}`;

  function loadState(){
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); return s?.teams && s?.events ? s : null; }
    catch { return null; }
  }
  function saveState(s){ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
  function findPlayer(state, team, playerId, number){
    const list = state.teams?.[team]?.players || [];
    return list.find(p => p.id === playerId) || list.find(p => String(p.number) === String(number));
  }
  function qIndex(ev){ return Math.min(4, Math.max(0, Number(ev.quarter || 1) - 1)); }
  function clampStats(p){
    if (!p?.stats) return;
    Object.keys(p.stats).forEach(k => { if (typeof p.stats[k] === 'number' && p.stats[k] < 0) p.stats[k] = 0; });
    if (Array.isArray(p.quarterPoints)) p.quarterPoints = p.quarterPoints.map(v => Math.max(0, Number(v||0)));
  }
  function applyImpact(state, ev, sign){
    if (!ev?.team || !EDITABLE.has(ev.action)) return;
    const p = findPlayer(state, ev.team, ev.playerId, ev.playerNumber);
    if (!p) return;
    const s = p.stats, qi = qIndex(ev);
    const add = (k,n=1) => { s[k] = Number(s[k]||0) + sign*n; };
    const pts = n => { add('pts',n); p.quarterPoints[qi] = Number(p.quarterPoints[qi]||0) + sign*n; };
    switch(ev.action){
      case 'ftm': add('ftm'); add('fta'); pts(1); break;
      case 'ftx': add('fta'); break;
      case 'fg2m': add('fg2m'); add('fg2a'); pts(2); break;
      case 'fg2x': add('fg2a'); break;
      case 'fg3m': add('fg3m'); add('fg3a'); pts(3); break;
      case 'fg3x': add('fg3a'); break;
      case 'oreb': add('oreb'); break;
      case 'dreb': add('dreb'); break;
      case 'ast': add('ast'); break;
      case 'tov': add('tov'); break;
      case 'stl': add('stl'); break;
      case 'blk': add('blk'); break;
    }
    clampStats(p);
  }
  function actionMeta(action){
    const map = {
      ftm:['フリースロー成功',1], ftx:['フリースロー失敗',0], fg2m:['2P成功',2], fg2x:['2P失敗',0],
      fg3m:['3P成功',3], fg3x:['3P失敗',0], oreb:['オフェンスリバウンド',0], dreb:['ディフェンスリバウンド',0],
      ast:['アシスト',0], tov:['ターンオーバー',0], stl:['スティール',0], blk:['ブロック',0]
    };
    return map[action] || [action,0];
  }
  function recalcEventScores(state){
    let a=0,b=0;
    [...state.events].sort((x,y)=>new Date(x.ts)-new Date(y.ts)).forEach(ev=>{
      const points = Number(ev.points||0);
      if (ev.team === 'A') a += points;
      if (ev.team === 'B') b += points;
      ev.scoreA = a; ev.scoreB = b;
    });
  }

  let root, dialog, editingId = null;
  function ensureUI(){
    const pbp = document.getElementById('pbpList');
    if (!pbp || document.getElementById('historyEditor')) return;
    root = document.createElement('section');
    root.id = 'historyEditor';
    root.className = 'history-editor card';
    root.innerHTML = `
      <div class="history-editor-head"><div><b>履歴から修正</b><small>時刻・チーム・選手・プレーで絞り込み、誤認識を修正できます</small></div><button id="historySortBtn" type="button">新しい順</button></div>
      <div class="history-filters">
        <input id="historySearch" placeholder="例：Q2 04:35 / 4番 / 成田 / ターンオーバー">
        <select id="historyQuarter"><option value="">全Q</option><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option><option value="5">OT</option></select>
        <select id="historyTeam"><option value="">両チーム</option><option value="A">TEAM A</option><option value="B">TEAM B</option></select>
        <select id="historyAction"><option value="">全プレー</option>${Object.entries(ACTIONS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select>
      </div>
      <div id="historyEditList" class="history-edit-list"></div>`;
    pbp.parentNode.insertBefore(root, pbp);

    dialog = document.createElement('dialog');
    dialog.id = 'eventEditDialog';
    dialog.innerHTML = `<form method="dialog" class="modal-card history-dialog">
      <h2>記録を修正</h2>
      <p id="historyOriginal" class="history-original"></p>
      <div class="history-dialog-grid">
        <label>チーム<select id="editEventTeam"><option value="A">TEAM A（白）</option><option value="B">TEAM B（青）</option></select></label>
        <label>選手<select id="editEventPlayer"></select></label>
        <label>プレー<select id="editEventAction">${Object.entries(ACTIONS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
      </div>
      <div class="history-dialog-actions"><button value="cancel">キャンセル</button><button type="button" id="deleteEventBtn" class="danger-outline">この記録を取消</button><button type="button" id="saveEventEdit" class="primary">修正を保存</button></div>
    </form>`;
    document.body.appendChild(dialog);

    const style = document.createElement('style');
    style.textContent = `
      .history-editor{padding:14px;margin:0 0 14px}.history-editor-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.history-editor-head b{font-size:18px}.history-editor-head small{display:block;color:#6f7f91;margin-top:3px}.history-editor-head button,.history-filters input,.history-filters select{border:1px solid #d7e0ea;background:white;border-radius:7px;padding:9px}.history-filters{display:grid;grid-template-columns:minmax(220px,1fr) 100px 130px 180px;gap:8px;margin-top:12px}.history-edit-list{display:grid;gap:6px;margin-top:10px;max-height:48vh;overflow:auto}.history-edit-row{display:grid;grid-template-columns:92px 82px 1fr 86px;gap:8px;align-items:center;border-top:1px solid #e4eaf0;padding:9px 4px}.history-edit-row .event-main{min-width:0}.history-edit-row .event-main b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.history-edit-row .event-main small{color:#6f7f91}.history-edit-row button{padding:8px;border:1px solid #d7e0ea;background:white;border-radius:7px;font-weight:800}.history-edit-row .corrected{color:#d51f32;font-size:10px;font-weight:900}.history-dialog{min-width:min(620px,calc(100vw - 24px))}.history-dialog-grid{display:grid;grid-template-columns:1fr 1.4fr 1.4fr;gap:10px}.history-dialog-grid label{font-size:12px;font-weight:800}.history-dialog-grid select{display:block;width:100%;padding:9px;margin-top:4px}.history-original{background:#f4f7fa;border-radius:7px;padding:10px}.history-dialog-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.history-dialog-actions button{padding:10px 14px;border:1px solid #d7e0ea;border-radius:7px;background:white;font-weight:800}.history-dialog-actions .primary{background:#0d2a4e!important;color:white}.history-dialog-actions .danger-outline{color:#e93f4e!important;border-color:#e93f4e!important}@media(max-width:820px){.history-filters{grid-template-columns:1fr 1fr}.history-edit-row{grid-template-columns:78px 70px 1fr 70px}.history-dialog-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    let newestFirst = true;
    const refresh = () => renderHistory(newestFirst);
    root.querySelector('#historySearch').addEventListener('input', refresh);
    root.querySelector('#historyQuarter').addEventListener('change', refresh);
    root.querySelector('#historyTeam').addEventListener('change', refresh);
    root.querySelector('#historyAction').addEventListener('change', refresh);
    root.querySelector('#historySortBtn').addEventListener('click', e=>{newestFirst=!newestFirst;e.currentTarget.textContent=newestFirst?'新しい順':'古い順';refresh();});
    root.querySelector('#historyEditList').addEventListener('click', e=>{const b=e.target.closest('[data-edit-event]');if(b) openEditor(b.dataset.editEvent);});
    dialog.querySelector('#editEventTeam').addEventListener('change', fillPlayers);
    dialog.querySelector('#saveEventEdit').addEventListener('click', saveEdit);
    dialog.querySelector('#deleteEventBtn').addEventListener('click', deleteEvent);
    refresh();
  }

  function renderHistory(newestFirst=true){
    const state = loadState(); if(!state || !root) return;
    const q = root.querySelector('#historyQuarter').value, team = root.querySelector('#historyTeam').value, action = root.querySelector('#historyAction').value;
    const search = root.querySelector('#historySearch').value.trim().toLowerCase();
    let rows = state.events.filter(ev => EDITABLE.has(ev.action));
    if(q) rows = rows.filter(ev=>String(ev.quarter)===q);
    if(team) rows = rows.filter(ev=>ev.team===team);
    if(action) rows = rows.filter(ev=>ev.action===action);
    if(search) rows = rows.filter(ev=>`${ev.quarter} ${fmtClock(ev.clock)} ${ev.team} ${ev.playerNumber} ${ev.playerName} ${ev.detail} ${ACTIONS[ev.action]||''}`.toLowerCase().includes(search));
    rows.sort((a,b)=>newestFirst?new Date(b.ts)-new Date(a.ts):new Date(a.ts)-new Date(b.ts));
    root.querySelector('#historyEditList').innerHTML = rows.length ? rows.map(ev=>`<div class="history-edit-row"><b>Q${ev.quarter} ${fmtClock(ev.clock)}</b><span>TEAM ${ev.team}</span><span class="event-main"><b>#${esc(ev.playerNumber)} ${esc(ev.playerName)} — ${esc(ev.detail)}</b><small>${ev.corrected?'<span class="corrected">修正済</span> ':''}${new Date(ev.ts).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</small></span><button type="button" data-edit-event="${esc(ev.id)}">修正</button></div>`).join('') : '<div style="padding:14px;color:#6f7f91">該当する得点・スタッツ記録はありません。</div>';
  }

  function openEditor(id){
    const state=loadState(); const ev=state?.events?.find(x=>String(x.id)===String(id)); if(!ev) return;
    editingId = ev.id;
    dialog.querySelector('#historyOriginal').textContent = `元の記録：Q${ev.quarter} ${fmtClock(ev.clock)} / TEAM ${ev.team} / #${ev.playerNumber} ${ev.playerName} / ${ev.detail}`;
    dialog.querySelector('#editEventTeam').value = ev.team;
    fillPlayers();
    dialog.querySelector('#editEventPlayer').value = ev.playerId || '';
    dialog.querySelector('#editEventAction').value = ev.action;
    dialog.showModal();
  }
  function fillPlayers(){
    const state=loadState(); if(!state) return;
    const t=dialog.querySelector('#editEventTeam').value;
    dialog.querySelector('#editEventPlayer').innerHTML=(state.teams[t].players||[]).map(p=>`<option value="${esc(p.id)}">#${esc(p.number)} ${esc(p.name||'名称未入力')}</option>`).join('');
  }
  function saveEdit(){
    const state=loadState(); const ev=state?.events?.find(x=>String(x.id)===String(editingId)); if(!ev) return;
    const before={team:ev.team,playerId:ev.playerId,playerNumber:ev.playerNumber,playerName:ev.playerName,action:ev.action,detail:ev.detail,points:ev.points};
    applyImpact(state, ev, -1);
    const team=dialog.querySelector('#editEventTeam').value, playerId=dialog.querySelector('#editEventPlayer').value, action=dialog.querySelector('#editEventAction').value;
    const p=findPlayer(state,team,playerId,''); if(!p) return;
    const [detail,points]=actionMeta(action);
    ev.team=team; ev.playerId=p.id; ev.playerNumber=p.number; ev.playerName=p.name; ev.action=action; ev.detail=detail; ev.points=points; ev.corrected=true;
    ev.correctionHistory = Array.isArray(ev.correctionHistory)?ev.correctionHistory:[];
    ev.correctionHistory.push({at:new Date().toISOString(),before});
    applyImpact(state, ev, 1); recalcEventScores(state); saveState(state);
    sessionStorage.setItem(RETURN_KEY,'1'); dialog.close(); location.reload();
  }
  function deleteEvent(){
    const state=loadState(); const i=state?.events?.findIndex(x=>String(x.id)===String(editingId)); if(i==null||i<0) return;
    const ev=state.events[i];
    if(!confirm(`Q${ev.quarter} ${fmtClock(ev.clock)} の「#${ev.playerNumber} ${ev.detail}」を取り消しますか？`)) return;
    applyImpact(state,ev,-1); state.events.splice(i,1); recalcEventScores(state); saveState(state);
    sessionStorage.setItem(RETURN_KEY,'1'); dialog.close(); location.reload();
  }

  function boot(){
    ensureUI();
    document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.view==='pbp'||b?.id==='historyShortcut')setTimeout(()=>{ensureUI();renderHistory(true)},0)});
    if(sessionStorage.getItem(RETURN_KEY)==='1'){
      sessionStorage.removeItem(RETURN_KEY);
      setTimeout(()=>document.querySelector('button[data-view="pbp"]')?.click(),30);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();