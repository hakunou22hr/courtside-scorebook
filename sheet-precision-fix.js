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
  function byText(text,minY=-Infinity,maxY=Infinity){
    if(!text) return null;
    const target=String(text).trim();
    return all().find(el=>{
      const y=parseFloat(el.style.top)||0;
      return el.textContent.trim()===target && y>=minY && y<=maxY;
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
  function correctionText(role,text,x,y,{size='clamp(8px,.9vw,12px)',weight='800'}={}){
    let el=overlay.querySelector(`[data-precision-role="${role}"]`);
    if(!text){el?.remove();return null;}
    if(!el){
      el=document.createElement('span');
      el.className='ov small precision-added';
      el.dataset.precisionRole=role;
      overlay.appendChild(el);
    }
    if(el.textContent!==text) el.textContent=text;
    place(el,x,y,{size,weight});
    return el;
  }

  function fixTopOfficials(s){
    const g=s?.game||{};
    place(byText(g.crewChief,0,15),79.3,8.05,{size:'clamp(8px,.9vw,12px)'});
    place(byText(g.umpire1,0,15),69.0,10.55,{size:'clamp(8px,.9vw,12px)'});
    place(byText(g.umpire2,0,15),89.0,10.55,{size:'clamp(8px,.9vw,12px)'});
  }

  function fixCoaches(s){
    const A=s?.teams?.A||{},B=s?.teams?.B||{};
    place(byText(A.coach,42,50),26.2,45.45,{size:'clamp(8px,.85vw,12px)'});
    place(byText(A.assistant,42,51),26.2,46.85,{size:'clamp(8px,.85vw,12px)'});
    place(byText(B.coach,80,87),26.2,83.15,{size:'clamp(8px,.85vw,12px)'});
    place(byText(B.assistant,80,88),26.2,84.55,{size:'clamp(8px,.85vw,12px)'});
  }

  function fixBottomOfficials(s){
    const g=s?.game||{};
    correctionText('bottom-crew-chief',g.crewChief||'',29.0,91.80);
    correctionText('bottom-umpire1',g.umpire1||'',20.0,94.65);
    correctionText('bottom-umpire2',g.umpire2||'',39.5,94.65);
  }

  function fixFinalScore(){
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
      fixBottomOfficials(s);
      fixFinalScore();
    }
    if(observer) observer.observe(overlay,{childList:true,subtree:true,characterData:true});
  }
  function schedule(){
    if(scheduled) return;
    scheduled=true;
    requestAnimationFrame(apply);
  }
  observer=new MutationObserver(schedule);
  observer.observe(overlay,{childList:true,subtree:true,characterData:true});
  window.addEventListener('storage',schedule);
  document.getElementById('refreshSheet')?.addEventListener('click',()=>setTimeout(schedule,0));
  schedule();

  if(!document.querySelector('script[data-history-editor]')){
    const s=document.createElement('script');
    s.src='history-editor.js?v=1';
    s.dataset.historyEditor='1';
    document.body.appendChild(s);
  }

  if(!document.querySelector('script[data-game-rules-enhancements]')){
    const s=document.createElement('script');
    s.src='game-rules-enhancements.js?v=3';
    s.dataset.gameRulesEnhancements='1';
    document.body.appendChild(s);
  }
})();
