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
  // Native coordinates inside each independently clipped scoresheet block.
  const TIMEOUT_POSITIONS={
    first:[[35,37],[65,37]],
    second:[[100,37],[130,37],[160,37]],
    ot:[[100,54],[130,54],[160,54]]
  };
  const TEAM_FOUL_POSITIONS={
    1:[[18,37],[46,37],[74,37],[102,37]],
    2:[[142,37],[170,37],[198,37],[226,37]],
    3:[[18,54],[46,54],[74,54],[102,54]],
    4:[[142,54],[170,54],[198,54],[226,54]]
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
    return `<span class="${cls}" style="left:${x}px;top:${y}px;color:${color}" title="${safeTitle}">${text}</span>`;
  }

  function renderSheetMarks(state){
    const overlay=document.getElementById('sheetOverlay');
    if(!overlay||!state) return;
    for(const team of ['A','B']){
      const timeoutBlock=overlay.querySelector(`[data-sheet-block="team${team}TimeoutBlock"]`);
      const foulBlock=overlay.querySelector(`[data-sheet-block="team${team}FoulsSummaryBlock"]`);
      if(!timeoutBlock||!foulBlock) continue;
      const buckets={first:[],second:[],ot:[]};
      for(const ev of timeoutEvents(state,team)){
        const q=Number(ev.quarter)||1;
        buckets[q<=2?'first':q<=4?'second':'ot'].push(ev);
      }
      const timeoutHtml=['first','second','ot'].flatMap(key=>buckets[key].slice(0,TIMEOUT_POSITIONS[key].length).map((ev,i)=>{
        const [x,y]=TIMEOUT_POSITIONS[key][i];
        return markHtml('sheet-timeout-mark',x,y,inkForQuarter(ev.quarter),remainingMinute(ev.clock),`Q${ev.quarter} 残り ${remainingMinute(ev.clock)}分`);
      })).join('');
      if(timeoutBlock.innerHTML!==timeoutHtml) timeoutBlock.innerHTML=timeoutHtml;
      let fouls='';
      for(let q=1;q<=4;q++) for(let i=0;i<foulCountForQuarter(state,team,q);i++){
        const [x,y]=TEAM_FOUL_POSITIONS[q][i];
        fouls+=markHtml('sheet-team-foul-mark',x,y,inkForQuarter(q),'×',`TEAM ${team} Q${q} チームファウル ${i+1}`);
      }
      if(foulBlock.innerHTML!==fouls) foulBlock.innerHTML=fouls;
    }
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
    const missing=!document.querySelector('.sheet-timeout-mark,.sheet-team-foul-mark') && /timeout|foul/.test(sig);
    if(!force && sig===lastSheetSignature && !missing) return;
    lastSheetSignature=sig;
    renderSheetMarks(state);
  }

  const overlay=document.getElementById('sheetOverlay');
  if(overlay){
    const observer=new MutationObserver(()=>{
      refreshSheetMarks(true);
    });
    observer.observe(overlay,{childList:true});
  }

  window.addEventListener('storage',()=>{refreshPfWarnings();refreshSheetMarks(true);});
  document.addEventListener('click',()=>setTimeout(()=>{refreshPfWarnings();refreshSheetMarks();},0));
  setInterval(()=>{refreshPfWarnings();refreshSheetMarks();},350);
  refreshPfWarnings();
  refreshSheetMarks(true);
})();