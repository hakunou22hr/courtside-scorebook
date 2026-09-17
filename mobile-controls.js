(() => {
  'use strict';

  const STATE_KEY='courtside-scorebook-v2';
  const actionCard=document.querySelector('.action-card');
  const selectedBar=document.querySelector('.selected-bar');
  if(!actionCard||!selectedBar) return;

  const style=document.createElement('style');
  style.textContent=`
    .mobile-player-picker{display:none}
    @media(max-width:820px){
      #view-input .live-grid{gap:8px}
      #view-input .action-card{
        padding:8px;
        display:grid;
        grid-template-columns:repeat(6,minmax(0,1fr));
        gap:5px;
        align-items:stretch;
      }
      .mobile-player-picker{
        display:grid;
        grid-column:1/-1;
        gap:5px;
        min-width:0;
      }
      .mobile-player-team{
        display:grid;
        grid-template-columns:62px minmax(0,1fr);
        gap:5px;
        align-items:center;
        min-width:0;
      }
      .mobile-player-team-head{min-width:0;line-height:1.1}
      .mobile-player-team-head b{display:block;font-size:11px;color:#17365f}
      .mobile-player-team-head span{display:block;margin-top:3px;font-size:8px;color:#708196;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mobile-player-strip{
        display:flex;
        gap:4px;
        overflow-x:auto;
        min-width:0;
        padding:1px 1px 3px;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:none;
      }
      .mobile-player-strip::-webkit-scrollbar{display:none}
      .mobile-player-chip{
        flex:0 0 54px;
        min-width:54px;
        min-height:48px;
        padding:5px 3px;
        border:1px solid #cfd9e5;
        border-radius:8px;
        background:#fff;
        color:#17365f;
        text-align:center;
        touch-action:manipulation;
        transition:background .08s ease,border-color .08s ease,box-shadow .08s ease,color .08s ease,transform .05s ease;
      }
      .mobile-player-chip:active{transform:scale(.96)}
      .mobile-player-chip strong{display:block;font-size:17px;line-height:1;font-weight:900}
      .mobile-player-chip small{display:block;margin-top:4px;font-size:8px;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mobile-player-chip.is-selected{
        background:#17365f;
        border-color:#17365f;
        box-shadow:inset 0 0 0 2px #fff,0 0 0 2px #2f67b8;
        color:#fff;
      }
      #view-input .selected-bar{grid-column:1/-1;padding:6px 8px;font-size:11px}
      #view-input .score-actions,
      #view-input .miss-actions,
      #view-input .stat-actions{grid-column:1/-1;margin-top:0;gap:5px}
      #view-input .score-actions button{min-height:50px;padding:6px 3px;font-size:22px;border-radius:6px}
      #view-input .score-actions small{font-size:8px}
      #view-input .miss-actions button,
      #view-input .stat-actions button{min-height:38px;padding:5px 3px;font-size:11px;border-radius:6px}
      #view-input .stat-actions small{font-size:8px}
      #view-input #playerInBtn{grid-column:1/span 3;margin:0!important;min-height:42px;padding:7px 3px!important;font-size:11px!important;border-radius:6px!important}
      #view-input #openFoul{grid-column:4/span 3;margin:0!important;min-height:42px;padding:7px 3px;font-size:12px;border-radius:6px}
      #view-input #staffFoulBtn{grid-column:1/span 2;margin:0!important;min-height:42px;padding:6px 3px!important;font-size:10px!important;border-radius:6px!important}
      #view-input .game-actions{grid-column:3/-1;margin-top:0;gap:4px}
      #view-input .game-actions button{min-height:42px;padding:6px 3px;font-size:10px;border-radius:6px}
      #view-input .roster-card header{padding:10px 12px}
      #view-input .roster{padding:5px}
      #view-input .player-row{grid-template-columns:48px 1fr auto;gap:7px;padding:9px 8px;min-height:58px}
      #view-input .player-row .num{font-size:25px}
      #view-input .player-row .meta{font-size:10px}
    }
  `;
  document.head.appendChild(style);

  const picker=document.createElement('div');
  picker.className='mobile-player-picker';
  picker.setAttribute('aria-label','スマホ用 選手クイック選択');
  actionCard.insertBefore(picker,selectedBar);

  let activeSelection=null;

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

  function selectionFromDom(){
    const row=document.querySelector('.player-row.is-selected[data-select-team][data-select-player]');
    if(!row) return null;
    return {team:row.dataset.selectTeam,id:String(row.dataset.selectPlayer)};
  }

  function stateSelection(state){
    if(!state?.selected?.team||!state?.selected?.playerId) return null;
    return {team:String(state.selected.team),id:String(state.selected.playerId)};
  }

  function currentSelection(state){
    const dom=selectionFromDom();
    if(dom){activeSelection=dom;return dom;}
    if(activeSelection) return activeSelection;
    const saved=stateSelection(state);
    if(saved) activeSelection=saved;
    return saved;
  }

  function setActiveChip(team,id){
    activeSelection={team:String(team),id:String(id)};
    picker.querySelectorAll('.mobile-player-chip').forEach(chip=>{
      const selected=chip.dataset.selectTeam===activeSelection.team&&String(chip.dataset.selectPlayer)===activeSelection.id;
      chip.classList.toggle('is-selected',selected);
      chip.setAttribute('aria-pressed',selected?'true':'false');
    });
  }

  function teamRow(state,team,selected){
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
            const isSelected=selected?.team===team&&String(selected?.id)===String(p.id);
            return `<button type="button" class="mobile-player-chip${isSelected?' is-selected':''}" data-select-team="${team}" data-select-player="${esc(p.id)}" aria-pressed="${isSelected?'true':'false'}" aria-label="TEAM ${team} ${esc(p.number||'番号未入力')} ${esc(p.name||'名称未入力')}">
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
    const selected=currentSelection(state);
    const next=teamRow(state,'A',selected)+teamRow(state,'B',selected);
    if(picker.dataset.rendered===next){
      if(selected) setActiveChip(selected.team,selected.id);
      return;
    }
    picker.innerHTML=next;
    picker.dataset.rendered=next;
  }

  // Give immediate visual feedback on touch, before app.js finishes the normal
  // selection/render cycle. The same data attributes are then handled by app.js.
  picker.addEventListener('click',e=>{
    const chip=e.target.closest('.mobile-player-chip[data-select-team][data-select-player]');
    if(!chip) return;
    setActiveChip(chip.dataset.selectTeam,chip.dataset.selectPlayer);
  });

  // Keep the quick selector synchronized when selection changes through the
  // full roster, voice input, or another UI control.
  document.addEventListener('click',()=>setTimeout(render,0));
  document.addEventListener('input',()=>setTimeout(render,0));
  window.addEventListener('storage',render);
  setInterval(render,500);
  render();
})();
