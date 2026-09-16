(() => {
  const STATE_KEY='courtside-scorebook-v2';
  const overlay=document.getElementById('sheetOverlay');
  if(!overlay) return;

  const RED='#d51f32';
  const BLACK='#111111';
  const QUARTER_SCORE_TOPS=[73.4,76.4,79.4,82.4];
  const QUARTER_SCORE_RAISE=0.55;
  let observer=null;
  let scheduled=false;

  function loadState(){
    try{
      const state=JSON.parse(localStorage.getItem(STATE_KEY));
      return state&&state.game&&state.teams?state:null;
    }catch{
      return null;
    }
  }

  function inkForQuarter(quarter){
    return Number(quarter)%2===0?BLACK:RED;
  }

  function ovElements(){
    return [...overlay.querySelectorAll('.ov')];
  }

  function place(el,x,y,{fontSize,fontWeight='700',color,align='center'}={}){
    if(!el) return;
    el.style.left=`${x}%`;
    el.style.top=`${y}%`;
    el.style.transform=align==='left'?'translate(0,-50%)':'translate(-50%,-50%)';
    el.style.textAlign=align;
    el.style.whiteSpace='nowrap';
    if(fontSize) el.style.fontSize=fontSize;
    if(fontWeight) el.style.fontWeight=fontWeight;
    if(color) el.style.color=color;
  }

  function adjustDate(state){
    if(!state?.game?.date) return;
    const dateEl=ovElements().find(el=>el.textContent.trim()===String(state.game.date));
    if(!dateEl) return;
    place(dateEl,32,8.72,{fontWeight:'700'});
  }

  function adjustQuarterScores(){
    ovElements().forEach(el=>{
      const x=parseFloat(el.style.left)||0;
      const y=parseFloat(el.style.top)||0;
      const isScoreColumn=Math.abs(x-74.5)<0.25||Math.abs(x-89.2)<0.25;
      if(!isScoreColumn) return;
      const row=QUARTER_SCORE_TOPS.find(v=>Math.abs(y-v)<0.2);
      if(row===undefined) return;
      place(el,x,row-QUARTER_SCORE_RAISE,{fontWeight:'800'});
    });
  }

  function collectFouls(state){
    const out=[];
    ['A','B'].forEach(team=>{
      const players=state?.teams?.[team]?.players||[];
      players.forEach(player=>{
        (player.fouls||[]).slice(0,5).forEach(foul=>out.push(foul));
      });
    });
    return out;
  }

  function adjustFouls(state){
    const marks=[...overlay.querySelectorAll('.foulmark')];
    const fouls=collectFouls(state);
    marks.forEach((mark,index)=>{
      const foul=fouls[index];
      if(!foul) return;
      const type=String(foul.type||'P');
      const ft=Math.max(0,Number(foul.ft)||0);
      const color=inkForQuarter(foul.quarter);
      const signature=`${type}|${ft}|${color}`;

      // Important: do not rebuild the same foul DOM on every observer pass.
      // Rebuilding children used to trigger sheet-static.js, which then triggered
      // this observer again and caused the officials to visibly blink.
      if(mark.dataset.foulCorrection===signature) return;
      mark.dataset.foulCorrection=signature;

      mark.replaceChildren();
      mark.style.transform='translate(-50%,-50%)';
      mark.style.color=color;
      mark.style.position='absolute';
      mark.style.width='14px';
      mark.style.height='14px';
      mark.style.display='flex';
      mark.style.alignItems='center';
      mark.style.justifyContent='center';
      mark.style.fontFamily='Arial,"Noto Sans JP",sans-serif';
      mark.style.fontWeight='900';
      mark.style.fontSize='clamp(7px,.82vw,11px)';
      mark.style.lineHeight='1';
      mark.style.overflow='visible';

      const main=document.createElement('span');
      main.className='foul-main';
      main.textContent=type;
      main.style.lineHeight='1';
      mark.appendChild(main);

      if(type==='P' && ft>0){
        const badge=document.createElement('span');
        badge.className='foul-ft-count';
        badge.textContent=String(ft);
        badge.style.position='absolute';
        badge.style.right='-2px';
        badge.style.bottom='-3px';
        badge.style.fontSize='clamp(5px,.52vw,7px)';
        badge.style.fontWeight='900';
        badge.style.lineHeight='1';
        badge.style.color=color;
        badge.style.background='transparent';
        mark.appendChild(badge);
      }
    });
  }

  function adjust(){
    scheduled=false;
    if(observer) observer.disconnect();
    const state=loadState();
    if(state){
      adjustDate(state);
      adjustQuarterScores();
      // Officials, coaches and final score are intentionally handled only by
      // sheet-precision-fix.js. Keeping one owner prevents position ping-pong.
      adjustFouls(state);
    }
    if(observer) observer.observe(overlay,{childList:true,subtree:true,characterData:true});
  }

  function schedule(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(adjust);
  }

  observer=new MutationObserver(schedule);
  observer.observe(overlay,{childList:true,subtree:true,characterData:true});
  window.addEventListener('storage',schedule);
  document.getElementById('refreshSheet')?.addEventListener('click',()=>setTimeout(schedule,0));
  schedule();
})();
