(() => {
  'use strict';
  const KEY='courtside-scorebook-v2';
  const overlay=document.getElementById('sheetOverlay');
  if(!overlay) return;
  let observer=null;
  let scheduled=false;

  function state(){
    try{return JSON.parse(localStorage.getItem(KEY))||null}catch{return null}
  }
  function all(){return [...overlay.querySelectorAll('.ov')];}
  function byText(text, minY=-Infinity, maxY=Infinity){
    if(!text) return null;
    const target=String(text).trim();
    return all().find(el=>{
      const y=parseFloat(el.style.top)||0;
      return el.textContent.trim()===target && y>=minY && y<=maxY;
    })||null;
  }
  function near(x,y,tx=2,ty=2){
    return all().find(el=>{
      const ex=parseFloat(el.style.left)||0;
      const ey=parseFloat(el.style.top)||0;
      return Math.abs(ex-x)<=tx && Math.abs(ey-y)<=ty;
    })||null;
  }
  function place(el,x,y,{size,weight='800',color,align='center'}={}){
    if(!el) return;
    el.style.left=`${x}%`;
    el.style.top=`${y}%`;
    el.style.transform=align==='left'?'translate(0,-50%)':'translate(-50%,-50%)';
    el.style.textAlign=align;
    el.style.whiteSpace='nowrap';
    el.style.fontWeight=weight;
    if(size) el.style.fontSize=size;
    if(color) el.style.color=color;
  }

  function fixTopOfficials(s){
    const g=s?.game||{};
    // Move names into the blank writing areas to the right of the printed labels.
    place(byText(g.crewChief,0,15),79.3,8.05,{size:'clamp(8px,.9vw,12px)'});
    place(byText(g.umpire1,0,15),69.0,10.55,{size:'clamp(8px,.9vw,12px)'});
    place(byText(g.umpire2,0,15),89.0,10.55,{size:'clamp(8px,.9vw,12px)'});
  }

  function fixCoaches(s){
    const A=s?.teams?.A||{}, B=s?.teams?.B||{};
    // Put coach names in the center of the wide name cells and vertically center each row.
    place(byText(A.coach,42,50),26.2,45.45,{size:'clamp(8px,.85vw,12px)'});
    place(byText(A.assistant,42,51),26.2,46.85,{size:'clamp(8px,.85vw,12px)'});
    place(byText(B.coach,80,87),26.2,83.15,{size:'clamp(8px,.85vw,12px)'});
    place(byText(B.assistant,80,88),26.2,84.55,{size:'clamp(8px,.85vw,12px)'});
  }

  function fixBottomOfficials(){
    // Keep the repeated official names centered above the printed guide lines.
    place(overlay.querySelector('[data-correction-role="bottom-crew-chief"]'),29.0,91.80,{size:'clamp(8px,.9vw,12px)'});
    place(overlay.querySelector('[data-correction-role="bottom-umpire1"]'),20.0,94.65,{size:'clamp(8px,.9vw,12px)'});
    place(overlay.querySelector('[data-correction-role="bottom-umpire2"]'),39.5,94.65,{size:'clamp(8px,.9vw,12px)'});
  }

  function fixFinalScore(){
    // Existing correction currently moves these to about 79.7/92.2, 88.15.
    // Re-center them in the actual A/B score boxes and lift them vertically.
    const candidates=all().filter(el=>{
      const x=parseFloat(el.style.left)||0;
      const y=parseFloat(el.style.top)||0;
      return y>86 && y<90 && x>72;
    }).sort((a,b)=>(parseFloat(a.style.left)||0)-(parseFloat(b.style.left)||0));
    if(candidates[0]) place(candidates[0],77.0,87.10,{size:'clamp(18px,2vw,28px)',weight:'900',color:'#d51f32'});
    if(candidates[1]) place(candidates[1],88.5,87.10,{size:'clamp(18px,2vw,28px)',weight:'900',color:'#d51f32'});
  }

  function apply(){
    scheduled=false;
    if(observer) observer.disconnect();
    const s=state();
    if(s){
      fixTopOfficials(s);
      fixCoaches(s);
      fixBottomOfficials();
      fixFinalScore();
    }
    if(observer) observer.observe(overlay,{childList:true,subtree:true,characterData:true});
  }
  function schedule(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(()=>requestAnimationFrame(apply));
  }
  observer=new MutationObserver(schedule);
  observer.observe(overlay,{childList:true,subtree:true,characterData:true});
  window.addEventListener('storage',schedule);
  document.getElementById('refreshSheet')?.addEventListener('click',()=>setTimeout(schedule,0));
  schedule();
})();
