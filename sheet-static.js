(() => {
  const page=document.getElementById('sheetPrintArea');
  const image=document.getElementById('sheetImage');
  const overlay=document.getElementById('sheetOverlay');
  if(!page||!image||!overlay) return;

  // Use the exact JPG uploaded by the user as the visible score sheet.
  image.src='assets/スコアシート.jpg';
  image.alt='公式スコアシート';

  // The JPG already contains row numbers and running-score numbers, so remove
  // any older helper layer if a cached build created one.
  page.querySelectorAll('.sheet-static-overlay').forEach(el=>el.remove());

  // Exact column centers measured from the uploaded 1240px-wide JPG.
  // Each entry maps the legacy app.js X position to the correct score-number
  // cell and the adjacent scorer-number cell on the real score sheet.
  const RUN_CELLS=[
    {old:55.4, score:54.073, scorer:51.250}, // 1-40 Team A
    {old:57.9, score:56.935, scorer:59.879}, // 1-40 Team B
    {old:66.5, score:65.524, scorer:62.742}, // 41-80 Team A
    {old:69.0, score:68.387, scorer:71.331}, // 41-80 Team B
    {old:78.0, score:76.976, scorer:74.194}, // 81-120 Team A
    {old:80.5, score:79.839, scorer:82.782}, // 81-120 Team B
    {old:89.1, score:88.427, scorer:85.645}, // 121-160 Team A
    {old:91.6, score:91.290, scorer:94.194}  // 121-160 Team B
  ];

  const RED_INK='#d51f32';
  const BLACK_INK='#111111';
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
      const state=JSON.parse(localStorage.getItem('courtside-scorebook-v2'));
      return state&&Array.isArray(state.events)?state:null;
    }catch{
      return null;
    }
  }

  function inkForQuarter(quarter){
    // Match the supplied completed score sheet: Q1/Q3 red, Q2/Q4 black.
    return Number(quarter)===1||Number(quarter)===3?RED_INK:BLACK_INK;
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

    // A successful 3-point field goal is shown by circling the scorer number.
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
      // Row center from the real JPG: first score row 269.5 / 1754.
      el.style.top=`${15.365+row*1.4115}%`;
      el.style.transform='translate(-50%,-50%)';
    });

    // app.js creates run marks in chronological scoring-event order.
    const state=loadState();
    const scoringEvents=state?[...state.events].reverse().filter(e=>e&&e.points>0&&e.team):[];
    marks.forEach((mark,index)=>{
      const event=scoringEvents[index];
      const cell=mappedCells[index];
      if(!event||!cell) return;
      const color=inkForQuarter(event.quarter);
      mark.style.color=color;
      mark.style.fontWeight='900';
      mark.style.lineHeight='1';

      // Free throw: filled dot on the printed running-score number.
      // 2P/3P: diagonal slash on the printed running-score number.
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

    if(observer) observer.observe(overlay,{childList:true,subtree:true});
  }

  function scheduleAdjust(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(adjustOverlay);
  }

  observer=new MutationObserver(scheduleAdjust);
  observer.observe(overlay,{childList:true,subtree:true});
  image.addEventListener('load',scheduleAdjust);
  window.addEventListener('storage',scheduleAdjust);
  scheduleAdjust();
})();
