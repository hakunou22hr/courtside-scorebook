(() => {
  'use strict';
  const STORAGE_KEY='courtside-scorebook-v2';
  // Percentages are based on the 1000 x 1415 scoresheet SVG viewBox. Keep this
  // fallback in sync with scoresheet-field-map.json for immediate/offline use.
  let scoresheetFieldMap={
    teamA:{playerRows:[21.855,23.163,24.47,25.777,27.085,28.392,29.7,31.007,32.314,33.622,34.929,36.237,37.544,38.852,40.159,41.466,42.774,44.081]},
    teamB:{playerRows:[58.251,59.558,60.866,62.173,63.481,64.788,66.095,67.403,68.71,70.018,71.325,72.633,73.94,75.247,76.555,77.862,79.17,80.477]},
    playerNameX:21.75,jerseyNumberX:32,playerInX:35.75,licenseNumberX:10.5,foulStartX:38.6,foulColumnStep:2.2
  };
  const makeStats=()=>({pts:0,fg2m:0,fg2a:0,fg3m:0,fg3a:0,ftm:0,fta:0,oreb:0,dreb:0,ast:0,tov:0,stl:0,blk:0,pf:0});
  const starterPlayers=(prefix, nums)=>nums.map((n,i)=>({id:crypto.randomUUID?.()||`${prefix}-${Date.now()}-${i}`,number:String(n),name:'',license:'',starter:i<5,stats:makeStats(),quarterPoints:[0,0,0,0,0],fouls:[]}));
  const defaultState=()=>({
    game:{competition:'',gameNo:'',date:new Date().toISOString().slice(0,10),time:'',place:'',crewChief:'',umpire1:'',umpire2:'',periodMinutes:6,currentQuarter:1,clockSeconds:360,running:false,started:false,ended:false,endTime:''},
    teams:{A:{name:'TEAM A',coach:'',assistant:'',timeouts:0,teamFouls:[0,0,0,0,0],players:starterPlayers('A',[4,5,6,7,8])},B:{name:'TEAM B',coach:'',assistant:'',timeouts:0,teamFouls:[0,0,0,0,0],players:starterPlayers('B',[4,5,6,7,8])}},
    selected:{team:'A',playerId:null},events:[]
  });
  let state=load(); let undoStack=[]; let redoStack=[]; let timer=null; let recognition=null; let listening=false;
  function load(){try{const s=JSON.parse(localStorage.getItem(STORAGE_KEY));return s&&s.game&&s.teams?s:defaultState()}catch{return defaultState()}}
  function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));document.getElementById('saveIndicator').textContent='✓ 保存済み'}
  const qIndex=()=>Math.min(4,Math.max(0,state.game.currentQuarter-1));
  const teamScore=t=>state.teams[t].players.reduce((a,p)=>a+p.stats.pts,0);
  const quarterScore=(t,q)=>state.teams[t].players.reduce((a,p)=>a+(p.quarterPoints[q]||0),0);
  const playerBy=(t,id)=>state.teams[t].players.find(p=>p.id===id);
  const selectedPlayer=()=>playerBy(state.selected.team,state.selected.playerId);
  const fmtClock=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const snapshot=()=>JSON.stringify(state);
  function stopTimer(){state.game.running=false;if(timer){clearInterval(timer);timer=null}renderRibbon()}
  function restore(s){state=JSON.parse(s);state.game.running=false;stopTimer();save();renderAll()}
  function mutate(fn){undoStack.push(snapshot());if(undoStack.length>50)undoStack.shift();redoStack=[];fn();save();renderAll()}
  function event(t,player,action,detail,points=0){state.events.unshift({id:Date.now()+Math.random(),ts:new Date().toISOString(),quarter:state.game.currentQuarter,clock:state.game.clockSeconds,team:t,playerId:player?.id||null,playerNumber:player?.number||'',playerName:player?.name||'',action,detail,points,scoreA:teamScore('A'),scoreB:teamScore('B')})}
  function addPlayer(t){if(state.teams[t].players.length>=18)return alert('選手は18名までです');mutate(()=>state.teams[t].players.push({id:crypto.randomUUID?.()||`${t}-${Date.now()}`,number:'',name:'',license:'',starter:false,stats:makeStats(),quarterPoints:[0,0,0,0,0],fouls:[]}))}
  function scoreAction(kind){const p=selectedPlayer();if(!p)return alert('先に選手を選択してください');const t=state.selected.team,qi=qIndex();mutate(()=>{let detail='',pts=0;if(kind==='ftm'){p.stats.ftm++;p.stats.fta++;pts=1;detail='フリースロー成功'}if(kind==='ftx'){p.stats.fta++;detail='フリースロー失敗'}if(kind==='fg2m'){p.stats.fg2m++;p.stats.fg2a++;pts=2;detail='2P成功'}if(kind==='fg2x'){p.stats.fg2a++;detail='2P失敗'}if(kind==='fg3m'){p.stats.fg3m++;p.stats.fg3a++;pts=3;detail='3P成功'}if(kind==='fg3x'){p.stats.fg3a++;detail='3P失敗'}p.stats.pts+=pts;p.quarterPoints[qi]+=pts;event(t,p,kind,detail,pts)})}
  function statAction(kind){const p=selectedPlayer();if(!p)return alert('先に選手を選択してください');const labels={oreb:'オフェンスリバウンド',dreb:'ディフェンスリバウンド',ast:'アシスト',tov:'ターンオーバー',stl:'スティール',blk:'ブロック'};mutate(()=>{p.stats[kind]++;event(state.selected.team,p,kind,labels[kind])})}
  function recordFoul(type,ft){const p=selectedPlayer();if(!p)return;const t=state.selected.team;mutate(()=>{p.stats.pf++;p.fouls.push({type,quarter:state.game.currentQuarter,clock:state.game.clockSeconds,ft:Number(ft)});state.teams[t].teamFouls[qIndex()]++;event(t,p,'foul',`${type}ファウル / FT ${ft==='0'?'なし':ft+'本'}`)})}
  function timeout(){const t=state.selected.team;mutate(()=>{state.teams[t].timeouts++;event(t,null,'timeout','タイムアウト')})}
  function runTimer(){if(timer)return;state.game.running=true;timer=setInterval(()=>{if(state.game.clockSeconds<=0){stopTimer();renderRibbon();return}state.game.clockSeconds--;save();renderRibbon()},1000);renderRibbon()}
  function toggleClock(){state.game.running?stopTimer():runTimer()}
  function endQuarter(){if(!confirm(`第${state.game.currentQuarter}クォーターを終了しますか？`))return;mutate(()=>{event('',null,'quarter',`第${state.game.currentQuarter}Q終了`);state.game.currentQuarter=Math.min(5,state.game.currentQuarter+1);state.game.clockSeconds=Number(state.game.periodMinutes)*60;state.game.running=false});stopTimer()}
  function startGame(){mutate(()=>{state.game.started=true;state.game.ended=false;state.game.clockSeconds=Number(state.game.periodMinutes)*60;event('',null,'start','試合開始')});document.getElementById('setupPanel').open=false}
  function endGame(){if(!confirm('試合を終了しますか？'))return;mutate(()=>{state.game.ended=true;state.game.running=false;state.game.endTime=new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});event('',null,'end','試合終了')});stopTimer()}
  function undo(){if(!undoStack.length)return;redoStack.push(snapshot());restore(undoStack.pop())}
  function redo(){if(!redoStack.length)return;undoStack.push(snapshot());restore(redoStack.pop())}
  function switchView(name){document.querySelectorAll('.view').forEach(v=>v.classList.remove('is-active'));document.getElementById(`view-${name}`).classList.add('is-active');document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('is-active',b.dataset.view===name));if(name==='sheet')renderSheet();if(name==='stats')renderStats();if(name==='pbp')renderPbp()}
  function renderRibbon(){['A','B'].forEach(t=>{const team=state.teams[t];document.getElementById(`ribbon${t}Name`).textContent=team.name;document.getElementById(`ribbon${t}Score`).textContent=teamScore(t);document.getElementById(`ribbon${t}Q`).textContent=[0,1,2,3].map((q,i)=>`Q${i+1} ${quarterScore(t,q)}`).join('　');document.getElementById(`ribbon${t}Fouls`).textContent=`チームファウル ${team.teamFouls[qIndex()]||0} ・ タイムアウト ${team.timeouts}`});document.getElementById('quarterLabel').textContent=state.game.currentQuarter<=4?`第${state.game.currentQuarter}クォーター`:'オーバータイム';document.getElementById('clockText').textContent=fmtClock(state.game.clockSeconds);document.getElementById('clockToggle').textContent=state.game.running?'Ⅱ PAUSE':'▶ START'}
  function renderSetupTeam(t){const team=state.teams[t],box=document.getElementById(`setup${t}`);box.innerHTML=`<h2>TEAM ${t}</h2><label>チーム名<input class="team-name-input" value="${esc(team.name)}" data-team-name="${t}"></label><label>コーチ<input value="${esc(team.coach)}" data-coach="${t}"></label><label>A.コーチ<input value="${esc(team.assistant)}" data-assistant="${t}"></label><div class="setup-players">${team.players.map(p=>`<div class="player-edit" data-edit-id="${p.id}" data-team="${t}"><input class="p-number" inputmode="numeric" placeholder="#" value="${esc(p.number)}"><input class="p-name" placeholder="選手氏名" value="${esc(p.name)}"><input class="p-license" placeholder="ライセンスNo." value="${esc(p.license)}"><label><input type="checkbox" class="p-starter" ${p.starter?'checked':''}>先発</label><button class="remove-player" type="button">×</button></div>`).join('')}</div><button class="setup-add" data-add-player="${t}">＋ 選手追加</button>`}
  function renderSetup(){document.querySelectorAll('[data-game]').forEach(el=>{const k=el.dataset.game;el.value=state.game[k]??''});renderSetupTeam('A');renderSetupTeam('B')}
  function renderRoster(t){const box=document.getElementById(`roster${t}`);document.getElementById(`team${t}Heading`).textContent=state.teams[t].name;box.innerHTML=state.teams[t].players.map(p=>`<button class="player-row ${state.selected.team===t&&state.selected.playerId===p.id?'is-selected':''}" data-select-team="${t}" data-select-player="${p.id}"><span class="num">#${esc(p.number||'--')}</span><span><b>${esc(p.name||'名称未入力')}</b><div class="meta">PTS ${p.stats.pts}　PF ${p.stats.pf}　REB ${p.stats.oreb+p.stats.dreb}</div></span><span class="mini">›</span></button>`).join('')}
  function renderSelected(){const p=selectedPlayer();document.getElementById('selectedPlayerLabel').textContent=p?`TEAM ${state.selected.team}　#${p.number} ${p.name||''}`:'選手を選択';document.getElementById('foulPlayer').textContent=p?`TEAM ${state.selected.team} #${p.number} ${p.name||''}`:'選手を選択'}
  function pct(m,a){return a?`${Math.round(m/a*100)}%`:'–'}
  function renderStats(){const wrap=document.getElementById('statsTables');wrap.innerHTML=['A','B'].map(t=>`<div class="stats-block"><h2>TEAM ${t}　${esc(state.teams[t].name)}　— ${teamScore(t)}点</h2><table class="stats-table"><thead><tr><th>#</th><th>選手</th><th>PTS</th><th>2P</th><th>2P%</th><th>3P</th><th>3P%</th><th>FT</th><th>FT%</th><th>OREB</th><th>DREB</th><th>REB</th><th>AST</th><th>TOV</th><th>STL</th><th>BLK</th><th>PF</th></tr></thead><tbody>${state.teams[t].players.map(p=>{const s=p.stats;return `<tr><td>${esc(p.number)}</td><td class="name">${esc(p.name||'—')}</td><td><b>${s.pts}</b></td><td>${s.fg2m}/${s.fg2a}</td><td>${pct(s.fg2m,s.fg2a)}</td><td>${s.fg3m}/${s.fg3a}</td><td>${pct(s.fg3m,s.fg3a)}</td><td>${s.ftm}/${s.fta}</td><td>${pct(s.ftm,s.fta)}</td><td>${s.oreb}</td><td>${s.dreb}</td><td>${s.oreb+s.dreb}</td><td>${s.ast}</td><td>${s.tov}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.pf}</td></tr>`}).join('')}</tbody></table></div>`).join('')}
  function renderPbp(){const box=document.getElementById('pbpList');box.innerHTML=state.events.length?state.events.map(e=>`<div class="pbp-row"><span class="time">Q${e.quarter} ${fmtClock(e.clock)}</span><span class="teamtag">${e.team?`TEAM ${e.team}`:'GAME'}</span><span>${e.playerNumber?`#${esc(e.playerNumber)} ${esc(e.playerName)} — `:''}${esc(e.detail)}</span><span class="score">${e.scoreA}-${e.scoreB}</span></div>`).join(''):'<div class="card" style="padding:24px">まだ記録がありません。</div>';document.getElementById('historyCount').textContent=state.events.length}
  function ov(html,x,y,cls='small'){return `<span class="ov ${cls}" style="left:${x}%;top:${y}%">${html}</span>`}
  function renderSheet(){const o=document.getElementById('sheetOverlay');let h='';const g=state.game,A=state.teams.A,B=state.teams.B;h+=ov(esc(A.name),20,5.8,'med')+ov(esc(B.name),69,5.8,'med');h+=ov(esc(g.competition),18,9.2)+ov(esc(g.date),32,9.2)+ov(esc(g.time),45,9.2)+ov(esc(g.place),32,11.4)+ov(esc(g.gameNo),17,11.4);h+=ov(esc(g.crewChief),70,9.2)+ov(esc(g.umpire1),68,11.4)+ov(esc(g.umpire2),88,11.4);
    const roster=t=>{const rows=scoresheetFieldMap[`team${t}`].playerRows;return state.teams[t].players.slice(0,rows.length).map((p,i)=>{const y=rows[i];let s=ov(esc(p.license),scoresheetFieldMap.licenseNumberX,y)+ov(esc(p.name),scoresheetFieldMap.playerNameX,y)+ov(esc(p.number),scoresheetFieldMap.jerseyNumberX,y);if(p.starter)s+=ov('P',scoresheetFieldMap.playerInX,y,'small red');p.fouls.slice(0,5).forEach((f,j)=>s+=`<span class="foulmark" style="left:${scoresheetFieldMap.foulStartX+j*scoresheetFieldMap.foulColumnStep}%;top:${y}%">${f.type}</span>`);return s}).join('')};h+=roster('A')+roster('B');h+=ov(esc(A.coach),18.5,46.4)+ov(esc(A.assistant),18.5,48.0)+ov(esc(B.coach),18.5,84.0)+ov(esc(B.assistant),18.5,85.6);
    [...state.events].reverse().filter(e=>e.points>0&&e.team).forEach(e=>{const n=e.team==='A'?e.scoreA:e.scoreB;if(n<1||n>160)return;const block=Math.floor((n-1)/40),row=(n-1)%40;const baseX=[55.4,66.5,78.0,89.1][block];const x=baseX+(e.team==='A'?0:2.5);const y=14.8+row*1.43;h+=`<span class="runmark" style="left:${x}%;top:${y}%">／</span>`});
    [0,1,2,3].forEach(q=>{h+=ov(quarterScore('A',q),74.5,73.4+q*3.0,'med red')+ov(quarterScore('B',q),89.2,73.4+q*3.0,'med red')});h+=ov(teamScore('A'),76,88.5,'med red')+ov(teamScore('B'),92,88.5,'med red');const win=teamScore('A')===teamScore('B')?'':teamScore('A')>teamScore('B')?A.name:B.name;h+=ov(esc(win),74,92.0,'med')+ov(esc(g.endTime||''),74,96.1,'med');o.innerHTML=h}
  function renderAll(){renderRibbon();renderSetup();renderRoster('A');renderRoster('B');renderSelected();renderStats();renderPbp();renderSheet();document.getElementById('undoBtn').disabled=!undoStack.length;document.getElementById('redoBtn').disabled=!redoStack.length}
  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function syncSetupInput(el){const row=el.closest('[data-edit-id]');if(row){const p=playerBy(row.dataset.team,row.dataset.editId);if(!p)return;if(el.classList.contains('p-number'))p.number=el.value;if(el.classList.contains('p-name'))p.name=el.value;if(el.classList.contains('p-license'))p.license=el.value;if(el.classList.contains('p-starter'))p.starter=el.checked;save();return}if(el.dataset.teamName){state.teams[el.dataset.teamName].name=el.value;save();return}if(el.dataset.coach){state.teams[el.dataset.coach].coach=el.value;save();return}if(el.dataset.assistant){state.teams[el.dataset.assistant].assistant=el.value;save();return}if(el.dataset.game){const k=el.dataset.game;state.game[k]=k==='periodMinutes'?Number(el.value):el.value;if(k==='periodMinutes'&&!state.game.started)state.game.clockSeconds=Number(el.value)*60;save();}}
  function parseVoice(text){const s=text.replace(/\s/g,'');let t=null;if(/白|チームA|teama/i.test(s))t='A';if(/黒|チームB|teamb/i.test(s))t='B';if(!t)t=state.selected.team;const m=s.match(/(\d{1,2})番/);if(m){const p=state.teams[t].players.find(x=>String(Number(x.number))===String(Number(m[1])));if(p)state.selected={team:t,playerId:p.id}}if(/タイムアウト/.test(s)){state.selected.team=t;timeout();return}if(/ファウル/.test(s)){state.selected.team=t;if(!selectedPlayer())return voiceMessage('選手番号を確認してください');recordFoul('P',0);return}const map=[[/オフェンスリバウンド|OREB/i,'oreb'],[/ディフェンスリバウンド|DREB/i,'dreb'],[/アシスト|AST/i,'ast'],[/ターンオーバー|TOV|TO$/i,'tov'],[/スティール|STL/i,'stl'],[/ブロック|BLK/i,'blk']];for(const [re,k] of map){if(re.test(s)){state.selected.team=t;statAction(k);return}}if(/2P失敗|2点失敗|ツー失敗/.test(s)){state.selected.team=t;scoreAction('fg2x');return}if(/3P失敗|3点失敗|スリー失敗/.test(s)){state.selected.team=t;scoreAction('fg3x');return}if(/フリースロー失敗/.test(s)){state.selected.team=t;scoreAction('ftx');return}if(/3点|スリー/.test(s)){state.selected.team=t;scoreAction('fg3m');return}if(/2点|ツー/.test(s)){state.selected.team=t;scoreAction('fg2m');return}if(/1点|フリースロー成功/.test(s)){state.selected.team=t;scoreAction('ftm');return}voiceMessage('認識しましたが、入力コマンドを特定できませんでした')}
  function voiceMessage(s){document.getElementById('voiceStatus').textContent=s}
  function initVoice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){voiceMessage('このブラウザは音声認識API非対応です。タッチ入力を使用してください。');return}recognition=new SR();recognition.lang='ja-JP';recognition.interimResults=false;recognition.continuous=false;recognition.onresult=e=>{const text=e.results[0][0].transcript;voiceMessage(`認識: ${text}`);parseVoice(text)};recognition.onerror=e=>voiceMessage(`音声入力: ${e.error}`);recognition.onend=()=>{listening=false;document.getElementById('voiceBtn').classList.remove('is-listening')}}
  function voiceStart(){if(!recognition)initVoice();if(!recognition||listening)return;try{listening=true;document.getElementById('voiceBtn').classList.add('is-listening');voiceMessage('聞き取り中…');recognition.start()}catch{}}
  function voiceStop(){if(recognition&&listening){try{recognition.stop()}catch{}}}
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.view)switchView(b.dataset.view);if(b.dataset.selectPlayer){state.selected={team:b.dataset.selectTeam,playerId:b.dataset.selectPlayer};renderRoster('A');renderRoster('B');renderSelected()}if(b.dataset.action){['ftm','ftx','fg2m','fg2x','fg3m','fg3x'].includes(b.dataset.action)?scoreAction(b.dataset.action):statAction(b.dataset.action)}if(b.dataset.addPlayer)addPlayer(b.dataset.addPlayer);if(b.classList.contains('remove-player')){const row=b.closest('[data-edit-id]');if(confirm('この選手を削除しますか？'))mutate(()=>state.teams[row.dataset.team].players=state.teams[row.dataset.team].players.filter(p=>p.id!==row.dataset.editId))}if(b.dataset.zoom)document.getElementById('sheetPrintArea').style.transform=`scale(${b.dataset.zoom})`});
  // iPhone/PWA: while editing the lower setup panel, keep the page at the
  // exact vertical position where editing started. Safari can otherwise
  // auto-scroll upward as the virtual keyboard/visual viewport changes.
  let setupEditScrollY=null;
  let setupPreFocusScrollY=null;
  let setupScrollRestoreRaf=0;
  function editingSetup(){return !!document.activeElement?.closest?.('#setupPanel');}
  function restoreSetupScroll(){
    if(setupEditScrollY==null||!editingSetup())return;
    cancelAnimationFrame(setupScrollRestoreRaf);
    setupScrollRestoreRaf=requestAnimationFrame(()=>{
      if(setupEditScrollY!=null&&editingSetup()&&Math.abs(window.scrollY-setupEditScrollY)>1){
        window.scrollTo({top:setupEditScrollY,left:0,behavior:'auto'});
      }
    });
  }
  // Capture the page position BEFORE Safari focuses the field. On iPhone,
  // focus itself may scroll first, so focusin alone is already too late.
  document.addEventListener('pointerdown',e=>{
    if(e.target.closest?.('#setupPanel') && e.target.matches?.('input,select,textarea')){
      setupPreFocusScrollY=window.scrollY;
    }
  },true);
  document.addEventListener('touchstart',e=>{
    const target=e.target;
    if(target?.closest?.('#setupPanel') && target.matches?.('input,select,textarea')){
      setupPreFocusScrollY=window.scrollY;
    }
  },{capture:true,passive:true});
  document.addEventListener('focusin',e=>{
    if(!e.target.closest?.('#setupPanel'))return;
    setupEditScrollY=setupPreFocusScrollY??window.scrollY;
    setupPreFocusScrollY=null;
    restoreSetupScroll();
    // iOS can perform a second automatic scroll while the keyboard opens.
    [30,90,180,320].forEach(ms=>setTimeout(restoreSetupScroll,ms));
  },true);
  document.addEventListener('input',e=>{
    syncSetupInput(e.target);
    if(e.target.closest?.('#setupPanel')){
      restoreSetupScroll();
      setTimeout(restoreSetupScroll,0);
    }
  });
  document.addEventListener('focusout',e=>{
    if(!e.target.closest?.('#setupPanel'))return;
    setTimeout(()=>{
      if(editingSetup()){restoreSetupScroll();return;}
      const y=setupEditScrollY??window.scrollY;
      setupEditScrollY=null;
      renderRibbon();renderRoster('A');renderRoster('B');renderSheet();
      requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:'auto'}));
    },0);
  },true);
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',restoreSetupScroll);
    window.visualViewport.addEventListener('scroll',restoreSetupScroll);
  }
  document.getElementById('clockToggle').addEventListener('click',toggleClock);document.getElementById('startGame').addEventListener('click',startGame);document.getElementById('endGame').addEventListener('click',endGame);document.getElementById('quarterEnd').addEventListener('click',endQuarter);document.getElementById('timeoutBtn').addEventListener('click',timeout);document.getElementById('openFoul').addEventListener('click',()=>{if(!selectedPlayer())return alert('先に選手を選択してください');renderSelected();document.getElementById('foulDialog').showModal()});document.getElementById('saveFoul').addEventListener('click',e=>{e.preventDefault();const type=document.querySelector('input[name="foulType"]:checked').value;recordFoul(type,document.getElementById('foulFt').value);document.getElementById('foulDialog').close()});document.getElementById('undoBtn').addEventListener('click',undo);document.getElementById('redoBtn').addEventListener('click',redo);document.getElementById('printSheet').addEventListener('click',()=>window.print());document.getElementById('printShortcut').addEventListener('click',()=>{switchView('sheet');setTimeout(()=>window.print(),100)});document.getElementById('historyShortcut').addEventListener('click',()=>switchView('pbp'));document.getElementById('refreshSheet').addEventListener('click',renderSheet);document.getElementById('clearGame').addEventListener('click',()=>{if(confirm('試合データをすべて初期化しますか？')){localStorage.removeItem(STORAGE_KEY);state=defaultState();undoStack=[];redoStack=[];renderAll()}});
  const vb=document.getElementById('voiceBtn');vb.addEventListener('pointerdown',e=>{e.preventDefault();voiceStart()});['pointerup','pointercancel','pointerleave'].forEach(n=>vb.addEventListener(n,e=>{e.preventDefault();voiceStop()}));
  window.addEventListener('beforeunload',save);if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});renderAll();
  fetch('scoresheet-field-map.json').then(response=>{if(!response.ok)throw new Error(`field map: ${response.status}`);return response.json()}).then(fieldMap=>{scoresheetFieldMap=fieldMap;renderSheet()}).catch(()=>{});
})();
