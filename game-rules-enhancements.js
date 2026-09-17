(() => {
  'use strict';

  const STATE_KEY='courtside-scorebook-v2';
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
    .team-foul-x-overlay,.sheet-timeout-minute{position:absolute;transform:translate(-50%,-50%);font-family:Arial,'Noto Sans JP',sans-serif;font-weight:900;line-height:1;text-align:center;pointer-events:none;z-index:12}
    .team-foul-x-overlay{font-size:clamp(8px,.9vw,12px)}
    .sheet-timeout-minute{font-size:clamp(8px,.9vw,12px)}
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

  // Exact centers measured from assets/スコアシート.jpg (1240 x 1754).
  const X_LEFT=[27.379,29.516,31.613,33.750];
  const X_RIGHT=[38.750,40.887,42.984,45.121];
  const Y={A:{top:15.422,bottom:16.904},B:{top:52.138,bottom:53.592}};

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
    return JSON.stringify([fouls,timeouts]);
  }

  function expectedManagedCount(state){
    const fouls=['A','B'].reduce((sum,t)=>sum+[1,2,3,4].reduce((s,q)=>s+foulCountForQuarter(state,t,q),0),0);
    const timeouts=['A','B'].reduce((sum,t)=>sum+timeoutPlacements(state,t).length,0);
    return fouls+timeouts;
  }

  function renderSheetMarks(force=false){
    const overlay=document.getElementById('sheetOverlay');
    const state=loadState();
    if(!overlay||!state) return;

    const sig=currentSheetSignature(state);
    const expected=expectedManagedCount(state);
    const existing=overlay.querySelectorAll('.team-foul-x-overlay,.sheet-timeout-minute').length;
    if(!force && sig===sheetSignature && existing===expected) return;
    sheetSignature=sig;

    if(observer) observer.disconnect();
    overlay.querySelectorAll('.team-foul-x-overlay,.sheet-timeout-minute').forEach(el=>el.remove());

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
      const existing=overlay.querySelectorAll('.team-foul-x-overlay,.sheet-timeout-minute').length;
      if(existing!==expectedManagedCount(state)) scheduleSheetMarks(true);
    });
    observer.observe(overlay,{childList:true,subtree:false});
  }

  window.addEventListener('storage',()=>{refreshPfWarnings();scheduleSheetMarks(true);});
  document.addEventListener('click',()=>setTimeout(()=>{refreshPfWarnings();scheduleSheetMarks(true);},0));
  document.getElementById('refreshSheet')?.addEventListener('click',()=>setTimeout(()=>scheduleSheetMarks(true),0));
  document.querySelector('[data-view="sheet"]')?.addEventListener('click',()=>setTimeout(()=>scheduleSheetMarks(true),50));
  setInterval(()=>{refreshPfWarnings();scheduleSheetMarks(false);},500);

  refreshPfWarnings();
  scheduleSheetMarks(true);
})();
