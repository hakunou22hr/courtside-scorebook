(() => {
  const page=document.getElementById('sheetPrintArea');
  const image=document.getElementById('sheetImage');
  const overlay=document.getElementById('sheetOverlay');
  if(!page||!image||!overlay) return;

  const APP_STATE_KEY='courtside-scorebook-v2';
  const PLAYER_IN_KEY='courtside-player-in-v1';
  const RED_INK='#d51f32';
  const BLACK_INK='#111111';
  const PLAYER_IN_X=31.089;
  const PLAYER_ROWS={
    A:[20.981,22.377,23.803,25.214,26.625,28.036,29.447,30.858,32.269,33.68,35.091,36.517,37.928,39.339,40.75,42.161,43.572,44.983],
    B:[59.094,60.505,61.916,63.327,64.738,66.149,67.56,68.985,70.396,71.807,73.218,74.629,76.04,77.452,78.863,80.274,81.685,83.096]
  };

  // Use the exact JPG uploaded by the user as the visible score sheet.
  image.src='assets/スコアシート.jpg';
  image.alt='公式スコアシート';

  page.querySelectorAll('.sheet-static-overlay').forEach(el=>el.remove());

  // Exact column centers measured from the uploaded 1240px-wide JPG.
  const RUN_CELLS=[
    {old:55.4, score:54.073, scorer:51.250},
    {old:57.9, score:56.935, scorer:59.879},
    {old:66.5, score:65.524, scorer:62.742},
    {old:69.0, score:68.387, scorer:71.331},
    {old:78.0, score:76.976, scorer:74.194},
    {old:80.5, score:79.839, scorer:82.782},
    {old:89.1, score:88.427, scorer:85.645},
    {old:91.6, score:91.290, scorer:94.194}
  ];

  let observer=null;
  let scheduled=false;

  function nearestCell(x){
    let best=RUN_CELLS[0];
    for(const cell of RUN_CELLS){
      if(Math.abs(cell.old-x)<Math.abs(best.old-x)) best=cell;
    }
    return best;
  }

  function loadState(){
    try{
      const state=JSON.parse(localStorage.getItem(APP_STATE_KEY));
      return state&&state.game&&state.teams?state:null;
    }catch{
      return null;
    }
  }

  function loadPlayerInLog(){
    try{
      const log=JSON.parse(localStorage.getItem(PLAYER_IN_KEY));
      return Array.isArray(log)?log:[];
    }catch{
      return [];
    }
  }

  function savePlayerInLog(log){
    localStorage.setItem(PLAYER_IN_KEY,JSON.stringify(log));
  }

  function inkForQuarter(quarter){
    // Odd quarters are recorded in red; even quarters in black.
    return Number(quarter)%2===0?BLACK_INK:RED_INK;
  }

  function addScorerNumber(event,scoreMark,scorerX){
    if(!event?.playerNumber) return;
    const y=parseFloat(scoreMark.style.top)||0;
    const color=inkForQuarter(event.quarter);
    const scorer=document.createElement('span');
    scorer.className='running-scorer-number';
    scorer.textContent=String(event.playerNumber);
    scorer.style.position='absolute';
    scorer.style.left=`${scorerX}%`;
    scorer.style.top=`${y}%`;
    scorer.style.transform='translate(-50%,-50%)';
    scorer.style.color=color;
    scorer.style.fontFamily='Arial,"Noto Sans JP",sans-serif';
    scorer.style.fontWeight='900';
    scorer.style.fontSize='clamp(6px,.78vw,10px)';
    scorer.style.lineHeight='1';
    scorer.style.textAlign='center';
    scorer.style.zIndex='3';
    scorer.style.whiteSpace='nowrap';

    if(event.action==='fg3m'){
      scorer.style.minWidth='13px';
      scorer.style.height='13px';
      scorer.style.padding='0 1px';
      scorer.style.display='flex';
      scorer.style.alignItems='center';
      scorer.style.justifyContent='center';
      scorer.style.border=`1.2px solid ${color}`;
      scorer.style.borderRadius='50%';
    }
    overlay.appendChild(scorer);
  }

  function removeLegacyPlayerInMarks(){
    // app.js previously printed a red "P" for starters. The official sheet
    // uses X, with a circle added to the starting five when the game starts.
    [...overlay.querySelectorAll('.ov')].forEach(el=>{
      if(el.textContent.trim()==='P' && Math.abs((parseFloat(el.style.left)||0)-PLAYER_IN_X)<1.2){
        el.remove();
      }
    });
    overlay.querySelectorAll('.playerin-overlay').forEach(el=>el.remove());
  }

  function createPlayerInMark(y,color,circled=false){
    const mark=document.createElement('span');
    mark.className='playerin-overlay';
    mark.textContent='×';
    mark.style.position='absolute';
    mark.style.left=`${PLAYER_IN_X}%`;
    mark.style.top=`${y}%`;
    mark.style.transform='translate(-50%,-50%)';
    mark.style.color=color;
    mark.style.fontFamily='Arial,"Noto Sans JP",sans-serif';
    mark.style.fontWeight='900';
    mark.style.fontSize='clamp(7px,.85vw,11px)';
    mark.style.lineHeight='1';
    mark.style.width='14px';
    mark.style.height='14px';
    mark.style.display='flex';
    mark.style.alignItems='center';
    mark.style.justifyContent='center';
    mark.style.zIndex='4';
    if(circled){
      mark.style.border=`1.4px solid ${color}`;
      mark.style.borderRadius='50%';
    }
    overlay.appendChild(mark);
  }

  function renderPlayerInMarks(state){
    removeLegacyPlayerInMarks();
    if(!state) return;
    const log=loadPlayerInLog();

    ['A','B'].forEach(team=>{
      const players=state.teams?.[team]?.players||[];
      const rows=PLAYER_ROWS[team];
      players.slice(0,rows.length).forEach((player,index)=>{
        const y=rows[index];
        if(player.starter){
          // Before tip-off: red X. Once the game is started and the lineup is
          // confirmed: put a red circle over the same X.
          createPlayerInMark(y,RED_INK,Boolean(state.game.started));
          return;
        }
        const firstEntry=log.find(entry=>entry.team===team&&entry.playerId===player.id);
        if(firstEntry){
          createPlayerInMark(y,inkForQuarter(firstEntry.quarter),false);
        }
      });
    });
  }

  function adjustOverlay(){
    scheduled=false;
    if(observer) observer.disconnect();

    page.querySelectorAll('.sheet-static-overlay').forEach(el=>el.remove());
    overlay.querySelectorAll('.running-scorer-number').forEach(el=>el.remove());

    const marks=[...overlay.querySelectorAll('.runmark')];
    const mappedCells=[];
    marks.forEach(el=>{
      const oldX=parseFloat(el.style.left)||0;
      const oldY=parseFloat(el.style.top)||0;
      const row=Math.max(0,Math.min(39,Math.round((oldY-14.8)/1.43)));
      const cell=nearestCell(oldX);
      mappedCells.push(cell);
      el.style.left=`${cell.score}%`;
      el.style.top=`${15.365+row*1.4115}%`;
      el.style.transform='translate(-50%,-50%)';
    });

    const state=loadState();
    const scoringEvents=state&&Array.isArray(state.events)?[...state.events].reverse().filter(e=>e&&e.points>0&&e.team):[];
    marks.forEach((mark,index)=>{
      const event=scoringEvents[index];
      const cell=mappedCells[index];
      if(!event||!cell) return;
      const color=inkForQuarter(event.quarter);
      mark.style.color=color;
      mark.style.fontWeight='900';
      mark.style.lineHeight='1';
      if(event.action==='ftm'){
        mark.textContent='●';
        mark.style.fontSize='clamp(6px,.72vw,9px)';
      }else{
        mark.textContent='／';
        mark.style.fontSize='clamp(8px,.9vw,12px)';
      }
      addScorerNumber(event,mark,cell.scorer);
    });

    overlay.querySelectorAll('.foulmark').forEach(el=>{
      el.style.transform='translate(-50%,-50%)';
    });

    renderPlayerInMarks(state);

    if(observer) observer.observe(overlay,{childList:true,subtree:true});
  }

  function scheduleAdjust(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(adjustOverlay);
  }

  function selectedPlayerFromDom(){
    const selected=document.querySelector('.player-row.is-selected');
    if(!selected) return null;
    const state=loadState();
    if(!state) return null;
    const team=selected.dataset.selectTeam;
    const playerId=selected.dataset.selectPlayer;
    const player=state.teams?.[team]?.players?.find(p=>p.id===playerId);
    return player?{state,team,player}:null;
  }

  function markPlayerIn(){
    const selected=selectedPlayerFromDom();
    if(!selected){
      alert('先に出場する選手を選択してください。');
      return;
    }
    const {state,team,player}=selected;
    if(!state.game.started){
      alert('交代選手の出場記録は「試合開始」後に入力してください。');
      return;
    }
    if(player.starter){
      alert('先発選手は試合開始時に赤い○付き×で記録されています。');
      return;
    }

    const log=loadPlayerInLog();
    const existingIndex=log.findIndex(entry=>entry.team===team&&entry.playerId===player.id);
    if(existingIndex>=0){
      if(confirm(`#${player.number} ${player.name||''} の出場記録を取り消しますか？`)){
        log.splice(existingIndex,1);
        savePlayerInLog(log);
        scheduleAdjust();
      }
      return;
    }

    log.push({
      team,
      playerId:player.id,
      playerNumber:player.number||'',
      quarter:Number(state.game.currentQuarter)||1,
      ts:new Date().toISOString()
    });
    savePlayerInLog(log);
    scheduleAdjust();
  }

  function installPlayerInButton(){
    if(document.getElementById('playerInBtn')) return;
    const foulButton=document.getElementById('openFoul');
    if(!foulButton) return;
    const button=document.createElement('button');
    button.id='playerInBtn';
    button.type='button';
    button.innerHTML='<b>PLAYER IN</b> <small>出場を×で記録</small>';
    button.style.marginTop='9px';
    button.style.width='100%';
    button.style.background='#17365f';
    button.style.color='#fff';
    button.style.border='0';
    button.style.borderRadius='7px';
    button.style.padding='12px';
    button.style.fontWeight='900';
    button.addEventListener('click',markPlayerIn);
    foulButton.parentNode.insertBefore(button,foulButton);
  }

  const clearGame=document.getElementById('clearGame');
  if(clearGame){
    clearGame.addEventListener('click',()=>{
      setTimeout(()=>{
        const state=loadState();
        if(state && Array.isArray(state.events) && state.events.length===0 && !state.game.started){
          localStorage.removeItem(PLAYER_IN_KEY);
          scheduleAdjust();
        }
      },0);
    });
  }

  observer=new MutationObserver(scheduleAdjust);
  observer.observe(overlay,{childList:true,subtree:true});
  image.addEventListener('load',scheduleAdjust);
  window.addEventListener('storage',scheduleAdjust);
  installPlayerInButton();
  scheduleAdjust();
})();
