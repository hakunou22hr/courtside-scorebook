(() => {
  'use strict';

  const STATE_KEY='courtside-scorebook-v2';
  const actionCard=document.querySelector('.action-card');
  const selectedBar=document.querySelector('.selected-bar');
  if(!actionCard||!selectedBar) return;

  const picker=document.createElement('div');
  picker.className='mobile-player-picker';
  picker.setAttribute('aria-label','スマホ用 選手クイック選択');
  actionCard.insertBefore(picker,selectedBar);

  function loadState(){
    try{
      const state=JSON.parse(localStorage.getItem(STATE_KEY));
      return state&&state.teams?state:null;
    }catch{return null;}
  }

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function teamRow(state,team){
    const t=state.teams?.[team];
    if(!t) return '';
    const players=(t.players||[]).slice(0,18);
    return `
      <div class="mobile-player-team" data-mobile-team="${team}">
        <div class="mobile-player-team-head">
          <b>TEAM ${team}</b><span>${esc(t.name||`TEAM ${team}`)}</span>
        </div>
        <div class="mobile-player-strip">
          ${players.map(p=>{
            const selected=state.selected?.team===team&&String(state.selected?.playerId)===String(p.id);
            return `<button type="button" class="mobile-player-chip${selected?' is-selected':''}" data-select-team="${team}" data-select-player="${esc(p.id)}" aria-label="TEAM ${team} ${esc(p.number||'番号未入力')} ${esc(p.name||'名称未入力')}">
              <strong>#${esc(p.number||'--')}</strong>
              <small>${esc(p.name||'名称未入力')}</small>
            </button>`;
          }).join('')}
        </div>
      </div>`;
  }

  function render(){
    const state=loadState();
    if(!state) return;
    const next=teamRow(state,'A')+teamRow(state,'B');
    if(picker.dataset.rendered===next) return;
    picker.innerHTML=next;
    picker.dataset.rendered=next;
  }

  document.addEventListener('click',()=>setTimeout(render,0));
  document.addEventListener('input',()=>setTimeout(render,0));
  window.addEventListener('storage',render);
  setInterval(render,1000);
  render();
})();
