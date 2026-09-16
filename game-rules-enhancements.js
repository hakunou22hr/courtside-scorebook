(() => {
  'use strict';

  const STATE_KEY='courtside-scorebook-v2';
  const RED='#d51f32';
  const BLACK='#111111';
  let bypassTimeout=false;
  let lastRosterSignature='';
  let lastSheetSignature='';

  function loadState(){
    try{
      const s=JSON.parse(localStorage.getItem(STATE_KEY));
      return s&&s.game&&s.teams?s:null;
    }catch{return null;}
  }

  function inkForQuarter(q){
    return Number(q)%2===0?BLACK:RED;
  }

  // ---- PF warning in the live input roster ---------------------------------
  function refreshPfWarnings(){
    const state=loadState();
    if(!state) return;
    const signature=JSON.stringify(['A','B'].flatMap(t=>(state.teams?.[t]?.players||[]).map(p=>[t,p.id,p.stats?.pts,p.stats?.pf,p.stats?.oreb,p.stats?.dreb])));
    if(signature===lastRosterSignature && document.querySelectorAll('.pf-hot').length) return;
    lastRosterSignature=signature;

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
    #timeoutTeamDialog::backdrop{background:rgba(8,22,40,.48)}
    #timeoutTeamDialog{border:0;border-radius:16px;padding:0;box-shadow:0 18px 60px rgba(0,0,0,.28);max-width:min(92vw,440px);width:440px}
    .timeout-choice-card{padding:22px;background:#fff;color:#11243b;font-family:Arial,'Noto Sans JP',sans-serif}
    .timeout-choice-card h2{margin:0 0 6px;font-size:22px}
    .timeout-choice-card p{margin:0 0 18px;color:#65778b;font-weight:700}
    .timeout-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .timeout-choice-grid button{border:0;border-radius:10px;padding:16px 10px;font-size:16px;font-weight:900;cursor:pointer}
    .timeout-choice-a{background:#17365f;color:#fff}
    .timeout-choice-b{background:#27233f;color:#fff}
    .timeout-choice-cancel{margin-top:12px;width:100%;background:#eef3f7!important;color:#23364a!important;padding:12px!important}
    .timeout-choice-grid small{display:block;font-size:11px;font-weight:700;opacity:.8;margin-top:4px}
    #rulesSheetOverlay{position:absolute;inset:0;pointer-events:none;z-index:7}
    .sheet-team-foul-mark,.sheet-timeout-mark{position:absolute;transform:translate(-50%,-50%);font-family:Arial,'Noto Sans JP',sans-serif;font-weight:900;text-align:center;line-height:1}
    .sheet-team-foul-mark{font-size:clamp(8px,1.05vw,14px)}
    .sheet-timeout-mark{font-size:clamp(7px,.92vw,12px)}
  `;
  document.head.appendChild(style);

  // ---- TIME OUT: choose TEAM A / TEAM B before recording -------------------
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
        const team=teamButton.dataset.timeoutTeam;
        dlg.close();
        recordTimeoutForTeam(team);
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
    if(!target){
      alert(`TEAM ${team} に選手が登録されていません。`);
      return;
    }

    // Re-use app.js' own timeout() path so UNDO/REDO, event history,
    // ribbon counts and localStorage all remain consistent.
    target.click();
    requestAnimationFrame(()=>{
      bypassTimeout=true;
      timeoutBtn.click();
      setTimeout(()=>{
        if(previous){
          document.querySelector(`.player-row[data-select-team="${previous.team}"][data-select-player="${CSS.escape(String(previous.id))}"]`)?.click();
        }
        refreshPfWarnings();
        refreshSheetMarks(true);
      },30);
    });
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('#timeoutBtn');
    if(!btn) return;
    if(bypassTimeout){
      bypassTimeout=false;
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    openTimeoutChooser();
  },true);

  // ---- Official scoresheet: timeout minute + team foul X -------------------
  // Positions measured from the supplied 442 x 720 official sheet image.
  const TIMEOUT_X={first:[7.58,10.52],second:[7.58,10.52,13.46],ot:[7.58,10.52,13.46]};
  const TIMEOUT_Y={
    A:{first:8.05,second:10.55,ot:13.05},
    B:{first:49.65,second:52.15,ot:54.65}
  };
  const TEAM_FOUL_X={
    1:[20.48,23.30,26.13,28.96],
    2:[34.62,37.44,40.27,42.99],
    3:[20.48,23.30,26.13,28.96],
    4:[34.62,37.44,40.27,42.99]
  };
  const TEAM_FOUL_Y={
    A:{1:8.05,2:8.05,3:10.55,4:10.55},
    B:{1:49.65,2:49.65,3:52.15,4:52.15}
  };

  function remainingMinute(clock){
    const seconds=Math.max(0,Number(clock)||0);
    return String(Math.floor(seconds/60));
  }

  function foulCountForQuarter(state,team,quarter){
    let count=0;
    for(const p of state.teams?.[team]?.players||[]){
      for(const f of p.fouls||[]){
        if(Number(f.quarter)===Number(quarter)) count++;
      }
    }
    return Math.min(4,count);
  }

  function timeoutEvents(state,team){
    return (state.events||[])
      .filter(e=>e&&e.action==='timeout'&&e.team===team)
      .slice()
      .sort((a,b)=>new Date(a.ts||0)-new Date(b.ts||0));
  }

  function markHtml(cls,x,y,color,text,title=''){
    const safeTitle=String(title).replace(/"/g,'&quot;');
    return `<span class="${cls}" style="left:${x}%;top:${y}%;color:${color}" title="${safeTitle}">${text}</span>`;
  }

  function renderSheetMarks(state){
    const overlay=document.getElementById('sheetOverlay');
    if(!overlay||!state) return;

    let html='';
    for(const team of ['A','B']){
      const events=timeoutEvents(state,team);
      const buckets={first:[],second:[],ot:[]};
      for(const ev of events){
        const q=Number(ev.quarter)||1;
        if(q<=2) buckets.first.push(ev);
        else if(q<=4) buckets.second.push(ev);
        else buckets.ot.push(ev);
      }
      for(const key of ['first','second','ot']){
        buckets[key].slice(0,TIMEOUT_X[key].length).forEach((ev,i)=>{
          html+=markHtml('sheet-timeout-mark',TIMEOUT_X[key][i],TIMEOUT_Y[team][key],inkForQuarter(ev.quarter),remainingMinute(ev.clock),`Q${ev.quarter} 残り ${Math.floor((Number(ev.clock)||0)/60)}分`);
        });
      }

      for(let q=1;q<=4;q++){
        const count=foulCountForQuarter(state,team,q);
        for(let i=0;i<count;i++){
          html+=markHtml('sheet-team-foul-mark',TEAM_FOUL_X[q][i],TEAM_FOUL_Y[team][q],inkForQuarter(q),'×',`TEAM ${team} Q${q} チームファウル ${i+1}`);
        }
      }
    }

    let layer=document.getElementById('rulesSheetOverlay');
    if(!layer){
      layer=document.createElement('div');
      layer.id='rulesSheetOverlay';
      overlay.appendChild(layer);
    }
    if(layer.innerHTML!==html) layer.innerHTML=html;
  }

  function sheetSignature(state){
    if(!state) return '';
    const fouls=['A','B'].flatMap(t=>(state.teams?.[t]?.players||[]).flatMap(p=>(p.fouls||[]).map(f=>[t,p.id,f.quarter,f.type,f.ft])));
    const timeouts=(state.events||[]).filter(e=>e?.action==='timeout').map(e=>[e.id,e.team,e.quarter,e.clock,e.ts]);
    return JSON.stringify([fouls,timeouts]);
  }

  function refreshSheetMarks(force=false){
    const state=loadState();
    if(!state) return;
    const sig=sheetSignature(state);
    const missing=!document.getElementById('rulesSheetOverlay');
    if(!force && sig===lastSheetSignature && !missing) return;
    lastSheetSignature=sig;
    renderSheetMarks(state);
  }

  const overlay=document.getElementById('sheetOverlay');
  if(overlay){
    const observer=new MutationObserver(()=>{
      if(!document.getElementById('rulesSheetOverlay')) refreshSheetMarks(true);
    });
    observer.observe(overlay,{childList:true});
  }

  window.addEventListener('storage',()=>{refreshPfWarnings();refreshSheetMarks(true);});
  document.addEventListener('click',()=>setTimeout(()=>{refreshPfWarnings();refreshSheetMarks();},0));
  setInterval(()=>{refreshPfWarnings();refreshSheetMarks();},350);
  refreshPfWarnings();
  refreshSheetMarks(true);
})();