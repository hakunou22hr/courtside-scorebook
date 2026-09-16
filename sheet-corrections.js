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

  function findOvNear(x,y,tolX=.8,tolY=.8){
    return ovElements().find(el=>{
      const ex=parseFloat(el.style.left)||0;
      const ey=parseFloat(el.style.top)||0;
      return Math.abs(ex-x)<=tolX && Math.abs(ey-y)<=tolY;
    });
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

  function makeOverlayText(role,text,x,y,{fontSize='clamp(8px,.85vw,12px)',fontWeight='700'}={}){
    let el=overlay.querySelector(`[data-correction-role="${role}"]`);
    if(!text){
      el?.remove();
      return null;
    }
    if(!el){
      el=document.createElement('span');
      el.className='ov small correction-added';
      el.dataset.correctionRole=role;
      overlay.appendChild(el);
    }
    el.textContent=text;
    place(el,x,y,{fontSize,fontWeight});
    return el;
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

  function adjustOfficials(state){
    const g=state.game||{};

    // Existing top officials emitted by app.js. Move each name to the visual
    // center of its printed writing line and keep it clear of the underline.
    const topCrew=findOvNear(70,9.2,1.2,1.0);
    const topU1=findOvNear(68,11.4,1.2,1.0);
    const topU2=findOvNear(88,11.4,1.2,1.0);
    place(topCrew,65.7,8.55,{fontSize:'clamp(8px,.9vw,12px)',fontWeight:'800'});
    place(topU1,61.8,10.65,{fontSize:'clamp(8px,.9vw,12px)',fontWeight:'800'});
    place(topU2,83.9,10.65,{fontSize:'clamp(8px,.9vw,12px)',fontWeight:'800'});

    // The official scoresheet repeats the officials in the lower-left block.
    // app.js does not draw these fields, so mirror the same names here.
    makeOverlayText('bottom-crew-chief',g.crewChief||'',29.0,92.15,{fontSize:'clamp(8px,.9vw,12px)',fontWeight:'800'});
    makeOverlayText('bottom-umpire1',g.umpire1||'',20.6,95.15,{fontSize:'clamp(8px,.9vw,12px)',fontWeight:'800'});
    makeOverlayText('bottom-umpire2',g.umpire2||'',40.0,95.15,{fontSize:'clamp(8px,.9vw,12px)',fontWeight:'800'});
  }

  function adjustCoaches(){
    // Center the coach names inside the wide name cells instead of leaving
    // them near the label/license columns.
    place(findOvNear(18.5,46.4,1.0,.8),22.4,46.25,{fontSize:'clamp(8px,.85vw,12px)',fontWeight:'800'});
    place(findOvNear(18.5,48.0,1.0,.8),22.4,47.82,{fontSize:'clamp(8px,.85vw,12px)',fontWeight:'800'});
    place(findOvNear(18.5,84.0,1.0,.8),22.4,83.95,{fontSize:'clamp(8px,.85vw,12px)',fontWeight:'800'});
    place(findOvNear(18.5,85.6,1.0,.8),22.4,85.52,{fontSize:'clamp(8px,.85vw,12px)',fontWeight:'800'});
  }

  function adjustFinalScores(){
    // Final score boxes are wider than the original overlay coordinates.
    // Put each value in the geometric center and make it roughly twice as large.
    const a=findOvNear(76,88.5,1.2,.9);
    const b=findOvNear(92,88.5,1.2,.9);
    place(a,79.7,88.15,{fontSize:'clamp(18px,2vw,28px)',fontWeight:'900',color:RED});
    place(b,92.2,88.15,{fontSize:'clamp(18px,2vw,28px)',fontWeight:'900',color:RED});
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

      mark.textContent='';
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
      main.textContent=type;
      main.style.lineHeight='1';
      mark.appendChild(main);

      if(type==='P' && ft>0){
        const badge=document.createElement('span');
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
      adjustOfficials(state);
      adjustCoaches();
      adjustFinalScores();
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
