(() => {
  'use strict';

  const STATE_KEY='courtside-scorebook-v2';
  const STAFF_FOUL_KEY='courtside-staff-fouls-v1';
  const RED='#d51f32';
  const BLACK='#111111';
  let bypassTimeout=false;
  let rosterSignature='';
  let sheetSignature='';
  let observer=null;
  let scheduled=false;

  function loadState(){
    try{
      const s=JSON.parse(localStorage.getItem(STATE_KEY));
      return s&&s.game&&s.teams?s:null;
    }catch{return null;}
  }

  function loadStaffFouls(){
    try{
      const rows=JSON.parse(localStorage.getItem(STAFF_FOUL_KEY));
      return Array.isArray(rows)?rows:[];
    }catch{return []}
  }

  function saveStaffFouls(rows){
    localStorage.setItem(STAFF_FOUL_KEY,JSON.stringify(rows));
  }

  function inkForQuarter(q){
    return Number(q)%2===0?BLACK:RED;
  }

  function refreshPfWarnings(){
    const state=loadState();
    if(!state) return;
    const sig=JSON.stringify(['A','B'].flatMap(t=>(state.teams?.[t]?.players||[]).map(p=>[t,p.id,p.stats?.pts,p.stats?.pf,p.stats?.oreb,p.stats?.dreb])));
    if(sig===rosterSignature && document.querySelectorAll('.pf-hot').length) return;
    rosterSignature=sig;

    document.querySelectorAll('.player-row[data-select-team][data-select-player]').forEach(row=>{
      const team=row.dataset.selectTeam;
      const player=(state.teams?.[team]?.players||[]).find(p=>String(p.id)===String(row.dataset.selectPlayer));
      const meta=row.querySelector('.meta');
      if(!player||!meta) return;
      const pts=Number(player.stats?.pts||0);
      const pf=Number(player.stats?.pf||0);
      const reb=Number(player.stats?.oreb||0)+Number(player.stats?.dreb||0);
      meta.innerHTML=`PTS ${pts}　<span class="${pf>=4?'pf-hot':''}">PF ${pf}</span>　REB ${reb}`;
    });
  }

  const style=document.createElement('style');
  style.textContent=`
    .pf-hot{color:${RED}!important;font-weight:900!important}
    #timeoutTeamDialog::backdrop,#staffFoulDialog::backdrop{background:rgba(8,22,40,.48)}
    #timeoutTeamDialog,#staffFoulDialog{border:0;border-radius:16px;padding:0;box-shadow:0 18px 60px rgba(0,0,0,.28);max-width:min(92vw,520px);width:520px}
    .timeout-choice-card,.staff-foul-card{padding:22px;background:#fff;color:#11243b;font-family:Arial,'Noto Sans JP',sans-serif}
    .timeout-choice-card h2,.staff-foul-card h2{margin:0 0 6px;font-size:22px}
    .timeout-choice-card p,.staff-foul-card p{margin:0 0 18px;color:#65778b;font-weight:700}
    .timeout-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .timeout-choice-grid button{border:0;border-radius:10px;padding:16px 10px;font-size:16px;font-weight:900;cursor:pointer}
    .timeout-choice-a{background:#17365f;color:#fff}
    .timeout-choice-b{background:#27233f;color:#fff}
    .timeout-choice-cancel{margin-top:12px;width:100%;background:#eef3f7!important;color:#23364a!important;padding:12px!important}
    .timeout-choice-grid small{display:block;font-size:11px;font-weight:700;opacity:.8;margin-top:4px}
    #staffFoulBtn{width:100%;margin-top:9px;border:1px solid ${RED};border-radius:7px;padding:11px;background:#fff;color:${RED};font-weight:900;cursor:pointer}
    #staffFoulBtn small{font-size:11px;margin-left:5px}
    .staff-foul-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .staff-foul-team{border:1px solid #d9e2ec;border-radius:12px;padding:12px;background:#f8fbfd}
    .staff-foul-team h3{margin:0 0 8px;font-size:15px;color:#17365f}
    .staff-foul-team button{display:block;width:100%;margin-top:8px;border:0;border-radius:9px;padding:12px 8px;background:#17365f;color:#fff;font-weight:900;cursor:pointer}
    .staff-foul-team[data-team="B"] button{background:#27233f}
    .staff-foul-team button small{display:block;font-size:11px;font-weight:700;opacity:.85;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .staff-foul-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
    .staff-foul-actions button{border:0;border-radius:9px;padding:11px;font-weight:900;cursor:pointer}
    .staff-foul-undo{background:#fff0f2;color:${RED};border:1px solid #f5b8c0!important}
    .staff-foul-cancel{background:#eef3f7;color:#23364a}
    .team-foul-x-overlay,.sheet-timeout-minute,.staff-tech-overlay{position:absolute;transform:translate(-50%,-50%);font-family:Arial,'Noto Sans JP',sans-serif;font-weight:900;line-height:1;text-align:center;pointer-events:none;z-index:12}
    .team-foul-x-overlay{font-size:clamp(8px,.9vw,12px)}
    .sheet-timeout-minute{font-size:clamp(8px,.9vw,12px)}
    .staff-tech-overlay{font-size:clamp(8px,.88vw,12px)}
  `;
  document.head.appendChild(style);

  function ensureTimeoutDialog(){
    let dlg=document.getElementById('timeoutTeamDialog');
    if(dlg) return dlg;
    dlg=document.createElement('dialog');
    dlg.id='timeoutTeamDialog';
    dlg.innerHTML=`<div class="timeout-choice-card">
      <h2>タイムアウト</h2>
      <p>タイムアウトを取ったチームを選択してください。</p>
      <div class="timeout-choice-grid">
        <button type="button" class="timeout-choice-a" data-timeout-team="A">TEAM A<small id="timeoutTeamAName">TEAM A</small></button>
        <button type="button" class="timeout-choice-b" data-timeout-team="B">TEAM B<small id="timeoutTeamBName">TEAM B</small></button>
      </div>
      <button type="button" class="timeout-choice-cancel" data-timeout-cancel>キャンセル</button>
    </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click',e=>{
      const teamButton=e.target.closest('[data-timeout-team]');
      if(teamButton){
        dlg.close();
        recordTimeoutForTeam(teamButton.dataset.timeoutTeam);
        return;
      }
      if(e.target.closest('[data-timeout-cancel]')) dlg.close();
    });
    return dlg;
  }

  function openTimeoutChooser(){
    const state=loadState();
    const dlg=ensureTimeoutDialog();
    dlg.querySelector('#timeoutTeamAName').textContent=state?.teams?.A?.name||'TEAM A';
    dlg.querySelector('#timeoutTeamBName').textContent=state?.teams?.B?.name||'TEAM B';
    if(typeof dlg.showModal==='function') dlg.showModal();
  }

  function recordTimeoutForTeam(team){
    const timeoutBtn=document.getElementById('timeoutBtn');
    if(!timeoutBtn) return;
    const selected=document.querySelector('.player-row.is-selected[data-select-team][data-select-player]');
    const previous=selected?{team:selected.dataset.selectTeam,id:selected.dataset.selectPlayer}:null;
    const target=document.querySelector(`.player-row[data-select-team="${team}"]`);
    if(!target){alert(`TEAM ${team} に選手が登録されていません。`);return;}
    target.click();
    requestAnimationFrame(()=>{
      bypassTimeout=true;
      timeoutBtn.click();
      setTimeout(()=>{
        if(previous){
          document.querySelector(`.player-row[data-select-team="${previous.team}"][data-select-player="${CSS.escape(String(previous.id))}"]`)?.click();
        }
        refreshPfWarnings();
        scheduleSheetMarks(true);
      },30);
    });
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('#timeoutBtn');
    if(!btn) return;
    if(bypassTimeout){bypassTimeout=false;return;}
    e.preventDefault();
    e.stopImmediatePropagation();
    openTimeoutChooser();
  },true);

  // -------------------------------------------------------------------------
  // Coach / assistant coach technical fouls.
  // These are intentionally kept separate from player/team-foul totals.
  // -------------------------------------------------------------------------
  function staffRoleLabel(role){
    return role==='assistant'?'A.コーチ':'コーチ';
  }

  function staffName(state,team,role){
    const t=state?.teams?.[team]||{};
    return role==='assistant'?(t.assistant||'氏名未入力'):(t.coach||'氏名未入力');
  }

  function ensureStaffFoulDialog(){
    let dlg=document.getElementById('staffFoulDialog');
    if(dlg) return dlg;
    dlg=document.createElement('dialog');
    dlg.id='staffFoulDialog';
    dlg.innerHTML=`<div class="staff-foul-card">
      <h2>コーチ・A.コーチ テクニカル</h2>
      <p>対象を選ぶと、その行のファウル欄へ「T」を記録します。</p>
      <div class="staff-foul-grid">
        <div class="staff-foul-team" data-team="A">
          <h3 id="staffTeamAHeading">TEAM A</h3>
          <button type="button" data-staff-team="A" data-staff-role="coach">コーチ T<small id="staffACoachName"></small></button>
          <button type="button" data-staff-team="A" data-staff-role="assistant">A.コーチ T<small id="staffAAssistantName"></small></button>
        </div>
        <div class="staff-foul-team" data-team="B">
          <h3 id="staffTeamBHeading">TEAM B</h3>
          <button type="button" data-staff-team="B" data-staff-role="coach">コーチ T<small id="staffBCoachName"></small></button>
          <button type="button" data-staff-team="B" data-staff-role="assistant">A.コーチ T<small id="staffBAssistantName"></small></button>
        </div>
      </div>
      <div class="staff-foul-actions">
        <button type="button" class="staff-foul-undo" data-staff-undo>直前のスタッフTを取消</button>
        <button type="button" class="staff-foul-cancel" data-staff-cancel>閉じる</button>
      </div>
    </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click',e=>{
      const target=e.target.closest('[data-staff-team][data-staff-role]');
      if(target){
        recordStaffTechnical(target.dataset.staffTeam,target.dataset.staffRole);
        dlg.close();
        return;
      }
      if(e.target.closest('[data-staff-undo]')){
        const rows=loadStaffFouls();
        if(!rows.length){alert('取り消せるスタッフテクニカルはありません。');return;}
        const last=rows[rows.length-1];
        if(confirm(`TEAM ${last.team} ${staffRoleLabel(last.role)} の直前のTを取り消しますか？`)){
          rows.pop();
          saveStaffFouls(rows);
          scheduleSheetMarks(true);
        }
        return;
      }
      if(e.target.closest('[data-staff-cancel]')) dlg.close();
    });
    return dlg;
  }

  function openStaffFoulDialog(){
    const state=loadState();
    if(!state) return;
    const dlg=ensureStaffFoulDialog();
    dlg.querySelector('#staffTeamAHeading').textContent=`TEAM A　${state.teams?.A?.name||''}`;
    dlg.querySelector('#staffTeamBHeading').textContent=`TEAM B　${state.teams?.B?.name||''}`;
    dlg.querySelector('#staffACoachName').textContent=staffName(state,'A','coach');
    dlg.querySelector('#staffAAssistantName').textContent=staffName(state,'A','assistant');
    dlg.querySelector('#staffBCoachName').textContent=staffName(state,'B','coach');
    dlg.querySelector('#staffBAssistantName').textContent=staffName(state,'B','assistant');
    if(typeof dlg.showModal==='function') dlg.showModal();
  }

  function recordStaffTechnical(team,role){
    const state=loadState();
    if(!state) return;
    const rows=loadStaffFouls();
    const sameRow=rows.filter(r=>r.team===team&&r.role===role);
    if(sameRow.length>=4){
      alert(`${staffRoleLabel(role)}のスコアシート欄は4枠までです。`);
      return;
    }
    rows.push({
      id:`staff-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      ts:new Date().toISOString(),
      team,
      role,
      type:'T',
      quarter:Number(state.game?.currentQuarter)||1,
      clock:Number(state.game?.clockSeconds)||0,
      name:staffName(state,team,role)
    });
    saveStaffFouls(rows);
    scheduleSheetMarks(true);
  }

  function installStaffFoulButton(){
    if(document.getElementById('staffFoulBtn')) return;
    const foulBtn=document.getElementById('openFoul');
    if(!foulBtn) return;
    const btn=document.createElement('button');
    btn.id='staffFoulBtn';
    btn.type='button';
    btn.innerHTML='<b>STAFF T</b><small>コーチ / A.コーチ</small>';
    btn.addEventListener('click',openStaffFoulDialog);
    foulBtn.insertAdjacentElement('afterend',btn);
  }

  // Exact centers measured from assets/スコアシート.jpg (1240 x 1754).
  const X_LEFT=[27.379,29.516,31.613,33.750];
  const X_RIGHT=[38.750,40.887,42.984,45.121];
  const Y={A:{top:15.422,bottom:16.904},B:{top:52.138,bottom:53.592}};

  // Coach/A.Coach foul-box centers on the official sheet.
  // The rows use four boxes to the right of the staff name area.
  const STAFF_TECH_X=[39.72,42.62,45.48,48.39];
  const STAFF_TECH_Y={
    A:{coach:46.41,assistant:47.78},
    B:{coach:83.10,assistant:84.52}
  };

  // Time-out boxes: first half has 2 boxes, second half 3, overtime 3.
  const TIMEOUT_X={first:[6.573,8.266],second:[6.573,8.266,9.960],ot:[6.573,8.266,9.960]};
  const TIMEOUT_Y={
    A:{first:15.507,second:16.819,ot:18.159},
    B:{first:52.195,second:53.535,ot:54.903}
  };

  function foulCountForQuarter(state,team,quarter){
    let count=0;
    for(const p of state.teams?.[team]?.players||[]){
      for(const f of p.fouls||[]){
        if(Number(f.quarter)===Number(quarter)) count++;
      }
    }
    return Math.min(4,count);
  }

  function markPosition(team,q,index){
    const xs=(q===1||q===3)?X_LEFT:X_RIGHT;
    return {x:xs[index],y:(q===1||q===2)?Y[team].top:Y[team].bottom};
  }

  function timeoutEvents(state,team){
    return (state.events||[])
      .filter(e=>e&&e.action==='timeout'&&e.team===team)
      .slice()
      .sort((a,b)=>new Date(a.ts||0)-new Date(b.ts||0));
  }

  function timeoutPlacements(state,team){
    const buckets={first:[],second:[],ot:[]};
    for(const ev of timeoutEvents(state,team)){
      const q=Number(ev.quarter)||1;
      if(q<=2) buckets.first.push(ev);
      else if(q<=4) buckets.second.push(ev);
      else buckets.ot.push(ev);
    }
    const placements=[];
    for(const key of ['first','second','ot']){
      buckets[key].slice(0,TIMEOUT_X[key].length).forEach((ev,i)=>placements.push({ev,key,index:i}));
    }
    return placements;
  }

  function remainingMinute(clock){
    const seconds=Math.max(0,Number(clock)||0);
    return String(Math.floor(seconds/60));
  }

  function currentSheetSignature(state){
    const fouls=['A','B'].map(team=>[1,2,3,4].map(q=>foulCountForQuarter(state,team,q)));
    const timeouts=['A','B'].map(team=>timeoutPlacements(state,team).map(({ev,key,index})=>[team,ev.id,ev.quarter,ev.clock,ev.ts,key,index]));
    const staff=loadStaffFouls().map(r=>[r.id,r.team,r.role,r.quarter,r.clock,r.type]);
    return JSON.stringify([fouls,timeouts,staff]);
  }

  function expectedManagedCount(state){
    const fouls=['A','B'].reduce((sum,t)=>sum+[1,2,3,4].reduce((s,q)=>s+foulCountForQuarter(state,t,q),0),0);
    const timeouts=['A','B'].reduce((sum,t)=>sum+timeoutPlacements(state,t).length,0);
    const staff=loadStaffFouls().length;
    return fouls+timeouts+staff;
  }

  function renderStaffTechnicalMarks(overlay){
    const rows=loadStaffFouls();
    for(const team of ['A','B']){
      for(const role of ['coach','assistant']){
        const marks=rows.filter(r=>r.team===team&&r.role===role).slice(0,STAFF_TECH_X.length);
        marks.forEach((row,index)=>{
          const mark=document.createElement('span');
          mark.className='staff-tech-overlay';
          mark.textContent='T';
          mark.style.left=`${STAFF_TECH_X[index]}%`;
          mark.style.top=`${STAFF_TECH_Y[team][role]}%`;
          mark.style.color=inkForQuarter(row.quarter);
          mark.title=`TEAM ${team} ${staffRoleLabel(role)} Q${row.quarter} テクニカル`;
          overlay.appendChild(mark);
        });
      }
    }
  }

  function renderSheetMarks(force=false){
    const overlay=document.getElementById('sheetOverlay');
    const state=loadState();
    if(!overlay||!state) return;

    const sig=currentSheetSignature(state);
    const expected=expectedManagedCount(state);
    const existing=overlay.querySelectorAll('.team-foul-x-overlay,.sheet-timeout-minute,.staff-tech-overlay').length;
    if(!force && sig===sheetSignature && existing===expected) return;
    sheetSignature=sig;

    if(observer) observer.disconnect();
    overlay.querySelectorAll('.team-foul-x-overlay,.sheet-timeout-minute,.staff-tech-overlay').forEach(el=>el.remove());

    for(const team of ['A','B']){
      for(const {ev,key,index} of timeoutPlacements(state,team)){
        const mark=document.createElement('span');
        mark.className='sheet-timeout-minute';
        mark.textContent=remainingMinute(ev.clock);
        mark.style.left=`${TIMEOUT_X[key][index]}%`;
        mark.style.top=`${TIMEOUT_Y[team][key]}%`;
        mark.style.color=inkForQuarter(ev.quarter);
        mark.title=`TEAM ${team} Q${ev.quarter} タイムアウト 残り${remainingMinute(ev.clock)}分`;
        overlay.appendChild(mark);
      }

      for(let q=1;q<=4;q++){
        const count=foulCountForQuarter(state,team,q);
        for(let i=0;i<count;i++){
          const {x,y}=markPosition(team,q,i);
          const mark=document.createElement('span');
          mark.className='team-foul-x-overlay';
          mark.textContent='×';
          mark.style.left=`${x}%`;
          mark.style.top=`${y}%`;
          mark.style.color=inkForQuarter(q);
          mark.title=`TEAM ${team} Q${q} チームファウル ${i+1}`;
          overlay.appendChild(mark);
        }
      }
    }

    renderStaffTechnicalMarks(overlay);

    if(observer) observer.observe(overlay,{childList:true,subtree:false});
  }

  function scheduleSheetMarks(force=false){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      renderSheetMarks(force);
    });
  }

  const overlay=document.getElementById('sheetOverlay');
  if(overlay){
    observer=new MutationObserver(()=>{
      const state=loadState();
      if(!state) return;
      const existing=overlay.querySelectorAll('.team-foul-x-overlay,.sheet-timeout-minute,.staff-tech-overlay').length;
      if(existing!==expectedManagedCount(state)) scheduleSheetMarks(true);
    });
    observer.observe(overlay,{childList:true,subtree:false});
  }

  const clearGame=document.getElementById('clearGame');
  clearGame?.addEventListener('click',()=>setTimeout(()=>{
    const state=loadState();
    if(state && Array.isArray(state.events) && state.events.length===0 && !state.game?.started){
      localStorage.removeItem(STAFF_FOUL_KEY);
      scheduleSheetMarks(true);
    }
  },0));

  window.addEventListener('storage',()=>{refreshPfWarnings();scheduleSheetMarks(true);});
  document.addEventListener('click',()=>setTimeout(()=>{refreshPfWarnings();scheduleSheetMarks(true);},0));
  document.getElementById('refreshSheet')?.addEventListener('click',()=>setTimeout(()=>scheduleSheetMarks(true),0));
  document.querySelector('[data-view="sheet"]')?.addEventListener('click',()=>setTimeout(()=>scheduleSheetMarks(true),50));
  setInterval(()=>{refreshPfWarnings();scheduleSheetMarks(false);},500);

  installStaffFoulButton();
  refreshPfWarnings();
  scheduleSheetMarks(true);
})();
