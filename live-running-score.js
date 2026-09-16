(() => {
  'use strict';

  const STORAGE_KEY = 'courtside-scorebook-v2';
  const liveGrid = document.querySelector('#view-input .live-grid');
  if (!liveGrid || document.getElementById('liveRunningScoreCard')) return;

  const style = document.createElement('style');
  style.textContent = `
    #view-input{max-width:1780px}
    #view-input .live-grid{grid-template-columns:minmax(250px,1fr) 350px minmax(250px,1fr) 250px;align-items:stretch}
    .running-score-card{display:flex;flex-direction:column;min-width:0;overflow:hidden;max-height:610px}
    .running-score-head{padding:12px 12px 9px;border-bottom:1px solid #d7e0ea;background:#f8fafc;position:sticky;top:0;z-index:2}
    .running-score-head .eyebrow{color:#6f7f91}
    .running-score-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px}
    .running-score-title h2{font-size:17px;margin:0;color:#11243b}
    .running-score-current{font-size:22px;font-weight:900;color:#0d2a4e;white-space:nowrap}
    .running-score-latest{font-size:10px;font-weight:800;color:#65778b;margin-top:4px;min-height:1.4em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .running-score-columns{display:grid;grid-template-columns:1fr 42px 1fr;background:#0d2a4e;color:#fff;font-size:11px;font-weight:900;text-align:center;position:sticky;top:73px;z-index:2}
    .running-score-columns span{padding:5px 2px;border-right:1px solid rgba(255,255,255,.18)}
    .running-score-columns span:last-child{border-right:0}
    .running-score-scroll{overflow:auto;flex:1;scroll-behavior:smooth;background:#fff}
    .running-score-row{display:grid;grid-template-columns:1fr 42px 1fr;min-height:27px;border-bottom:1px solid #dfe6ed;position:relative;font-size:12px}
    .running-score-row.latest{background:#fff8d9}
    .running-score-side,.running-score-num{display:flex;align-items:center;justify-content:center;position:relative}
    .running-score-side:first-child{border-right:1px solid #cfd8e2}
    .running-score-side:last-child{border-left:1px solid #cfd8e2}
    .running-score-num{font-weight:900;color:#26384d;background:#f8fafc;font-variant-numeric:tabular-nums}
    .running-score-mark{display:inline-flex;align-items:center;justify-content:center;gap:3px;font-weight:900;min-width:34px;line-height:1}
    .running-score-mark.q-odd{color:#d51f32}.running-score-mark.q-even{color:#111}
    .running-score-mark .player{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 2px}
    .running-score-mark.three .player{border:1.7px solid currentColor;border-radius:50%}
    .running-score-mark .slash{font-size:17px;font-weight:400;transform:rotate(-6deg)}
    .running-score-mark.ft .slash{font-size:13px}
    .running-score-empty{padding:18px 8px;color:#6f7f91;font-size:11px;text-align:center}
    @media(max-width:1350px){
      #view-input .live-grid{grid-template-columns:minmax(225px,1fr) 320px minmax(225px,1fr) 220px}
      .running-score-title h2{font-size:15px}.running-score-current{font-size:19px}
    }
    @media(max-width:1100px){
      #view-input .live-grid{grid-template-columns:1fr 330px 1fr}
      .running-score-card{grid-column:1/-1;max-height:430px}
      .running-score-columns{top:73px}
    }
    @media(max-width:820px){
      #view-input .live-grid{grid-template-columns:1fr}
      .running-score-card{grid-column:auto;max-height:420px;order:4}
    }
  `;
  document.head.appendChild(style);

  const card = document.createElement('aside');
  card.id = 'liveRunningScoreCard';
  card.className = 'card running-score-card';
  card.setAttribute('aria-label', 'リアルタイムランニングスコア');
  card.innerHTML = `
    <div class="running-score-head">
      <span class="eyebrow">OFFICIAL SCORESHEET</span>
      <div class="running-score-title"><h2>ランニングスコア</h2><span id="runningScoreCurrent" class="running-score-current">0 - 0</span></div>
      <div id="runningScoreLatest" class="running-score-latest">得点入力をリアルタイム表示</div>
    </div>
    <div class="running-score-columns"><span>TEAM A</span><span>得点</span><span>TEAM B</span></div>
    <div id="runningScoreScroll" class="running-score-scroll"><div class="running-score-empty">得点記録はまだありません。</div></div>`;
  liveGrid.appendChild(card);

  const current = card.querySelector('#runningScoreCurrent');
  const latest = card.querySelector('#runningScoreLatest');
  const scroll = card.querySelector('#runningScoreScroll');
  let lastFingerprint = '';

  function readState(){
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); return s?.teams && Array.isArray(s.events) ? s : null; }
    catch { return null; }
  }

  function teamScore(state, team){
    return (state?.teams?.[team]?.players || []).reduce((sum,p)=>sum + Number(p?.stats?.pts || 0),0);
  }

  function scoringEvents(state){
    return (state.events || [])
      .filter(e => e && e.team && Number(e.points || 0) > 0 && ['ftm','fg2m','fg3m'].includes(e.action))
      .slice()
      .sort((a,b)=>new Date(a.ts || 0)-new Date(b.ts || 0));
  }

  function markHtml(ev){
    if (!ev) return '';
    const qClass = Number(ev.quarter || 1) % 2 === 1 ? 'q-odd' : 'q-even';
    const typeClass = ev.action === 'fg3m' ? 'three' : (ev.action === 'ftm' ? 'ft' : 'two');
    const symbol = ev.action === 'ftm' ? '•' : '╱';
    return `<span class="running-score-mark ${qClass} ${typeClass}" title="Q${Number(ev.quarter||1)} #${String(ev.playerNumber||'')} ${String(ev.detail||'')}"><span class="player">${String(ev.playerNumber||'')}</span><span class="slash">${symbol}</span></span>`;
  }

  function render(state){
    if (!state) return;
    const events = scoringEvents(state);
    const scoreA = teamScore(state,'A');
    const scoreB = teamScore(state,'B');
    current.textContent = `${scoreA} - ${scoreB}`;

    const byA = new Map(), byB = new Map();
    for (const ev of events){
      const score = ev.team === 'A' ? Number(ev.scoreA || 0) : Number(ev.scoreB || 0);
      if (score <= 0) continue;
      (ev.team === 'A' ? byA : byB).set(score, ev);
    }

    const latestEvent = events[events.length - 1];
    latest.textContent = latestEvent
      ? `最新: Q${latestEvent.quarter} TEAM ${latestEvent.team} #${latestEvent.playerNumber} ${latestEvent.detail} → ${latestEvent.scoreA}-${latestEvent.scoreB}`
      : '得点入力をリアルタイム表示';

    const maxScore = Math.max(40, Math.min(160, Math.max(scoreA, scoreB) + 12));
    let html = '';
    const latestScore = latestEvent ? (latestEvent.team === 'A' ? Number(latestEvent.scoreA||0) : Number(latestEvent.scoreB||0)) : 0;
    for (let n=1;n<=maxScore;n++){
      const a = byA.get(n), b = byB.get(n);
      const isLatest = !!latestEvent && n === latestScore;
      html += `<div class="running-score-row${isLatest?' latest':''}" data-score-row="${n}"><div class="running-score-side">${markHtml(a)}</div><div class="running-score-num">${n}</div><div class="running-score-side">${markHtml(b)}</div></div>`;
    }
    scroll.innerHTML = html || '<div class="running-score-empty">得点記録はまだありません。</div>';

    if (latestScore > 0){
      const row = scroll.querySelector(`[data-score-row="${latestScore}"]`);
      if (row) requestAnimationFrame(()=>row.scrollIntoView({block:'center',behavior:'smooth'}));
    }
  }

  function fingerprint(state){
    if (!state) return '';
    return JSON.stringify((state.events || []).map(e=>[e.id,e.team,e.playerNumber,e.action,e.points,e.scoreA,e.scoreB,e.quarter,e.corrected]));
  }

  function refresh(){
    const state = readState();
    if (!state) return;
    const fp = fingerprint(state);
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;
    render(state);
  }

  refresh();
  setInterval(refresh, 250);
  window.addEventListener('storage', refresh);
  document.addEventListener('click', ()=>setTimeout(refresh, 0));
})();
