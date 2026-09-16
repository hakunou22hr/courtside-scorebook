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

  // Translate the old SVG running-score positions to the uploaded JPG.
  const runXMap=[
    [55.4,51.21], [57.9,59.76],
    [66.5,62.74], [69.0,71.21],
    [78.0,74.19], [80.5,82.66],
    [89.1,85.65], [91.6,94.19]
  ];

  // The scorer number is written beside the running-score mark, as in the
  // supplied completed score sheet. This offset keeps the jersey number in
  // the adjacent writing space without covering the printed running total.
  const SCORER_OFFSET=1.45;
  const RED_INK='#d51f32';
  const BLACK_INK='#111111';
  let observer=null;
  let scheduled=false;

  function nearestMappedX(x){
    let best=runXMap[0];
    for(const pair of runXMap){
      if(Math.abs(pair[0]-x)<Math.abs(best[0]-x)) best=pair;
    }
    return best[1];
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
    // Match the reference sheet: Q1/Q3 in red, Q2/Q4 in black.
    return Number(quarter)===1||Number(quarter)===3?RED_INK:BLACK_INK;
  }

  function addScorerNumber(event,scoreMark){
    if(!event?.playerNumber) return;
    const scoreX=parseFloat(scoreMark.style.left)||0;
    const y=parseFloat(scoreMark.style.top)||0;
    const color=inkForQuarter(event.quarter);
    const scorer=document.createElement('span');
    scorer.className='running-scorer-number';
    scorer.textContent=String(event.playerNumber);
    scorer.style.position='absolute';
    scorer.style.left=`${scoreX+(event.team==='A'?-SCORER_OFFSET:SCORER_OFFSET)}%`;
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

    // A successful 3-point field goal is shown by circling the scorer number,
    // matching the supplied completed-score-sheet example.
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
    marks.forEach(el=>{
      const oldX=parseFloat(el.style.left)||0;
      const oldY=parseFloat(el.style.top)||0;
      const row=Math.max(0,Math.min(39,Math.round((oldY-14.8)/1.43)));
      el.style.left=`${nearestMappedX(oldX)}%`;
      el.style.top=`${15.365+row*1.4115}%`;
      el.style.transform='translate(-50%,-50%)';
    });

    // app.js creates run marks in chronological scoring-event order.
    const state=loadState();
    const scoringEvents=state?[...state.events].reverse().filter(e=>e&&e.points>0&&e.team):[];
    marks.forEach((mark,index)=>{
      const event=scoringEvents[index];
      if(!event) return;
      const color=inkForQuarter(event.quarter);
      mark.style.color=color;
      mark.style.fontWeight='900';
      mark.style.lineHeight='1';

      // Free throw: filled dot on the new running score.
      // 2P/3P: diagonal slash on the new running score.
      if(event.action==='ftm'){
        mark.textContent='●';
        mark.style.fontSize='clamp(6px,.72vw,9px)';
      }else{
        mark.textContent='／';
        mark.style.fontSize='clamp(8px,.9vw,12px)';
      }
      addScorerNumber(event,mark);
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
