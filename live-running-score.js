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
    .running-score-head{padding:12px 12px 9px;border-bottom:1px solid #d7e0ea;background:#f8fafc;position:sticky;top:0;z-index:3}
    .running-score-head .eyebrow{color:#6f7f91}
    .running-score-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px}
    .running-score-title h2{font-size:17px;margin:0;color:#11243b}
    .running-score-current{font-size:22px;font-weight:900;color:#0d2a4e;white-space:nowrap}
    .running-score-latest{font-size:10px;font-weight:800;color:#65778b;margin-top:4px;min-height:1.4em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    .running-score-team-head{display:grid;grid-template-columns:1fr 1fr;background:#0d2a4e;color:#fff;font-size:11px;font-weight:900;text-align:center;position:sticky;top:73px;z-index:3}
    .running-score-team-head span{padding:5px 2px;border-right:1px solid rgba(255,255,255,.28)}
    .running-score-team-head span:last-child{border-right:0}
    .running-score-ab-head{display:grid;grid-template-columns:34px 42px 42px 34px;background:#fff;color:#0d2a4e;font-size:11px;font-weight:900;text-align:center;position:sticky;top:96px;z-index:3;border-bottom:1px solid #9aa9b8}
    .running-score-ab-head span{padding:3px 1px;border-right:1px solid #cfd8e2}
    .running-score-ab-head span:last-child{border-right:0}

    .running-score-scroll{overflow:auto;flex:1;scroll-behavior:smooth;background:#fff}
    .running-score-row{display:grid;grid-template-columns:34px 42px 42px 34px;min-height:27px;border-bottom:1px solid #dfe6ed;position:relative;font-size:12px}
    .running-score-row.latest{background:#fff8d9}
    .running-score-scorer,.running-score-total{display:flex;align-items:center;justify-content:center;position:relative;min-width:0}
    .running-score-scorer,.running-score-total{border-right:1px solid #cfd8e2}
    .running-score-row > :last-child{border-right:0}
    .running-score-total{font-weight:900;color:#26384d;background:rgba(248,250,252,.72);font-variant-numeric:tabular-nums}
    .running-score-scorer{font-weight:900;background:#fff}

    .running-score-scorer .player-mark{display:inline-flex;align-items:center;justify-content:center;gap:2px;min-width:21px;height:20px;font-weight:900;line-height:1}
    .running-score-scorer .player-mark.q-odd{color:#d51f32}
    .running-score-scorer .player-mark.q-even{color:#111}
    .running-score-scorer .player-mark.three .player-number{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1.7px solid currentColor;border-radius:50%}
    .running-score-scorer .ft-dot{font-size:10px;line-height:1;margin-left:1px}

    .running-score-total.scored::after{content:'';position:absolute;left:9px;right:9px;top:50%;height:1.8px;background:currentColor;transform:rotate(-48deg);transform-origin:center;border-radius:2px;pointer-events:none}
    .running-score-total.scored.q-odd{color:#d51f32}
    .running-score-total.scored.q-even{color:#111}
    .running-score-total.scored .score-number{color:#26384d}
    .running-score-row.latest .running-score-total,.running-score-row.latest .running-score-scorer{background:#fff8d9}
    .running-score-empty{padding:18px 8px;color:#6f7f91;font-size:11px;text-align:center}

    @media(max-width:1350px){
      #view-input .live-grid{grid-template-columns:minmax(225px,1fr) 320px minmax(225px,1fr) 220px}
      .running-score-title h2{font-size:15px}.running-score-current{font-size:19px}
      .running-score-row,.running-score-ab-head{grid-template-columns:31px 38px 38px 31px}
      .running-score-total.scored::after{left:8px;right:8px}
    }
    @media(max-width:1100px){
      #view-input .live-grid{grid-template-columns:1fr 330px 1fr}
      .running-score-card{grid-column:1/-1;max-height:430px}
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
    <div class="running-score-team-head"><span>TEAM A</span><span>TEAM B</span></div>
    <div class="running-score-ab-head"><span></span><span>A</span><span>B</span><span></span></div>
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

  function quarterClass(ev){
    return Number(ev?.quarter || 1) % 2 === 1 ? 'q-odd' : 'q-even';
  }

  function scorerHtml(ev){
    if (!ev) return '';
    const qClass = quarterClass(ev);
    const typeClass = ev.action === 'fg3m' ? 'three' : (ev.action === 'ftm' ? 'ft' : 'two');
    const ftDot = ev.action === 'ftm' ? '<span class="ft-dot">•</span>' : '';
    return `<span class="player-mark ${qClass} ${typeClass}" title="Q${Number(ev.quarter||1)} #${String(ev.playerNumber||'')} ${String(ev.detail||'')}"><span class="player-number">${String(ev.playerNumber||'')}</span>${ftDot}</span>`;
  }

  function scoreHtml(n, ev){
    const classes = ev ? `running-score-total scored ${quarterClass(ev)}` : 'running-score-total';
    const title = ev ? ` title="Q${Number(ev.quarter||1)} TEAM ${ev.team} #${String(ev.playerNumber||'')} ${String(ev.detail||'')}"` : '';
    return `<div class="${classes}"${title}><span class="score-number">${n}</span></div>`;
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
    const latestTeam = latestEvent?.team || '';

    for (let n=1;n<=maxScore;n++){
      const a = byA.get(n), b = byB.get(n);
      const isLatest = !!latestEvent && n === latestScore && ((latestTeam === 'A' && a) || (latestTeam === 'B' && b));
      html += `<div class="running-score-row${isLatest?' latest':''}" data-score-row="${n}">
        <div class="running-score-scorer">${scorerHtml(a)}</div>
        ${scoreHtml(n,a)}
        ${scoreHtml(n,b)}
        <div class="running-score-scorer">${scorerHtml(b)}</div>
      </div>`;
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
