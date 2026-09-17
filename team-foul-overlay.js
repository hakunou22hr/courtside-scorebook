(() => {
  'use strict';

  const STATE_KEY='courtside-scorebook-v2';
  const RED='#d51f32';
  const BLACK='#111111';

  // Exact centers measured from the current 1240 x 1754 official score sheet JPG.
  // Q1/Q3 use the left four boxes, Q2/Q4 use the right four boxes.
  const X_LEFT=[27.379,29.516,31.613,33.750];
  const X_RIGHT=[38.750,40.887,42.984,45.121];
  const Y={
    A:{top:15.422,bottom:16.904},
    B:{top:52.138,bottom:53.592}
  };

  function loadState(){
    try{
      const s=JSON.parse(localStorage.getItem(STATE_KEY));
      return s&&s.game&&s.teams?s:null;
    }catch{return null;}
  }

  function ink(q){
    return Number(q)%2===0?BLACK:RED;
  }

  function foulCount(state,team,quarter){
    let count=0;
    for(const p of state?.teams?.[team]?.players||[]){
      for(const f of p.fouls||[]){
        if(Number(f.quarter)===Number(quarter)) count++;
      }
    }
    return Math.min(4,count);
  }

  function position(team,q,index){
    const xs=(q===1||q===3)?X_LEFT:X_RIGHT;
    const y=(q===1||q===2)?Y[team].top:Y[team].bottom;
    return {x:xs[index],y};
  }

  let observer=null;
  let scheduled=false;
  let lastSignature='';

  function signature(state){
    return JSON.stringify(['A','B'].map(team=>[1,2,3,4].map(q=>foulCount(state,team,q))));
  }

  function render(force=false){
    scheduled=false;
    const overlay=document.getElementById('sheetOverlay');
    const state=loadState();
    if(!overlay||!state) return;

    const sig=signature(state);
    const existing=overlay.querySelectorAll('.team-foul-x-overlay').length;
    if(!force && sig===lastSignature && existing) return;
    lastSignature=sig;

    if(observer) observer.disconnect();
    overlay.querySelectorAll('.team-foul-x-overlay').forEach(el=>el.remove());

    for(const team of ['A','B']){
      for(let q=1;q<=4;q++){
        const count=foulCount(state,team,q);
        for(let i=0;i<count;i++){
          const {x,y}=position(team,q,i);
          const mark=document.createElement('span');
          mark.className='team-foul-x-overlay';
          mark.textContent='×';
          mark.setAttribute('aria-hidden','true');
          Object.assign(mark.style,{
            position:'absolute',
            left:`${x}%`,
            top:`${y}%`,
            transform:'translate(-50%,-50%)',
            color:ink(q),
            fontFamily:'Arial,"Noto Sans JP",sans-serif',
            fontWeight:'900',
            fontSize:'clamp(8px,.9vw,12px)',
            lineHeight:'1',
            textAlign:'center',
            zIndex:'12',
            pointerEvents:'none'
          });
          overlay.appendChild(mark);
        }
      }
    }

    if(observer) observer.observe(overlay,{childList:true,subtree:false});
  }

  function schedule(force=false){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(()=>render(force));
  }

  const overlay=document.getElementById('sheetOverlay');
  if(!overlay) return;

  observer=new MutationObserver(mutations=>{
    // app.js and the score-sheet correction scripts rebuild the overlay.
    // Re-add only our foul marks after those updates settle.
    if(mutations.some(m=>[...m.removedNodes].some(n=>n.nodeType===1 && (n.matches?.('.team-foul-x-overlay')||n.querySelector?.('.team-foul-x-overlay'))))) {
      schedule(true);
      return;
    }
    if(!overlay.querySelector('.team-foul-x-overlay')) schedule(true);
  });
  observer.observe(overlay,{childList:true,subtree:false});

  document.addEventListener('click',()=>setTimeout(()=>schedule(true),0));
  window.addEventListener('storage',()=>schedule(true));
  document.getElementById('refreshSheet')?.addEventListener('click',()=>setTimeout(()=>schedule(true),0));
  document.querySelector('[data-view="sheet"]')?.addEventListener('click',()=>setTimeout(()=>schedule(true),40));

  schedule(true);
})();
