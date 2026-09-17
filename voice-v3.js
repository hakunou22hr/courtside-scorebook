(() => {
  'use strict';

  const STATE_KEY = 'courtside-scorebook-v2';
  const status = document.getElementById('voiceStatus');
  const originalButton = document.getElementById('voiceBtn');
  if (!status || !originalButton) return;

  const button = originalButton.cloneNode(true);
  originalButton.replaceWith(button);
  const hint = button.querySelector('small');
  if (hint) hint.textContent = '選手選択後は「2点」「アシスト」だけでもOK';
  button.setAttribute('aria-pressed', 'false');

  const livePanel = document.createElement('div');
  livePanel.id = 'voiceLivePanel';
  livePanel.setAttribute('role', 'status');
  livePanel.setAttribute('aria-live', 'polite');
  Object.assign(livePanel.style, {
    position: 'fixed', left: '50%', bottom: 'calc(86px + env(safe-area-inset-bottom))',
    transform: 'translateX(-50%)', zIndex: '60', width: 'calc(100% - 24px)',
    maxWidth: '760px', padding: '10px 14px', border: '2px solid #e93f4e',
    borderRadius: '12px', background: 'rgba(255,255,255,.97)',
    boxShadow: '0 10px 32px rgba(17,36,59,.24)', color: '#11243b',
    pointerEvents: 'none', display: 'none'
  });
  livePanel.innerHTML = '<div id="voiceLiveState" style="font-size:12px;font-weight:900;color:#e93f4e"></div><div id="voiceLiveText" style="margin-top:4px;font-size:16px;font-weight:800;line-height:1.4;min-height:1.4em;overflow-wrap:anywhere"></div>';
  document.body.appendChild(livePanel);
  const liveState = document.getElementById('voiceLiveState');
  const liveText = document.getElementById('voiceLiveText');

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSNonSafari = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

  let recognition = null;
  let starting = false;
  let listening = false;
  let lastFinal = '';
  let lastInterim = '';
  let bestSeen = null;
  let executed = false;
  let hideTimer = null;
  let heardAudio = false;
  let heardSpeech = false;

  const digitMap = {〇:0, 零:0, 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9};
  const kanaDigit = {'れい':0,'ぜろ':0,'いち':1,'に':2,'さん':3,'よん':4,'し':4,'ご':5,'ろく':6,'なな':7,'しち':7,'はち':8,'きゅう':9,'く':9};

  function showPanel() {
    clearTimeout(hideTimer);
    livePanel.style.display = 'block';
  }
  function hidePanel(delay = 4200) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!starting && !listening) livePanel.style.display = 'none';
    }, delay);
  }
  function feedback(text) {
    status.textContent = text;
    liveState.textContent = text;
    showPanel();
  }
  function transcript(text, final = false) {
    liveText.textContent = text ? `${final ? '認識結果' : '文字起こし中'}：${text}` : '';
    if (text) showPanel();
  }

  function normalize(value) {
    let s = String(value || '').normalize('NFKC').toLowerCase();
    s = s.replace(/[、。，．,.!！?？・\s]/g, '');

    // Team-color variations frequently returned by Japanese dictation.
    s = s.replace(/^(?:しろ|シロ|白|城|しろい|白い|ひろ|ヒロ)/, '白');
    s = s.replace(/^(?:あお|アオ|青|蒼|碧|あを)/, '青');

    // Score variations.
    s = s.replace(/(?:1|一|いち|いっ)(?:点|てん|テン)|一点|言ってん|いってん|イッテン|一転/g, '1点');
    s = s.replace(/(?:2|二|に)(?:点|てん|テン)|二点|二転|にてん|ニテン|ツーポイント/g, '2点');
    s = s.replace(/(?:3|三|さん)(?:点|てん|テン)|三点|三転|さんてん|サンテン|スリーポイント/g, '3点');
    s = s.replace(/ポイント/g, '点');

    // Basketball terms and common recognition variants.
    s = s.replace(/フリー?スロー|フリースロウ|フリースロ|ふりーすろー|ふりーすろ/g, 'フリースロー');
    s = s.replace(/ターンオーバー|ターンオーバ|たーんおーばー|たーんおーば|ターンオーヴァー|ターンオーバァ/g, 'ターンオーバー');
    s = s.replace(/オフェンシブリバウンド|オフェンスリバウンド|オフェンスリバン(?:ド)?|おふぇんすりばうんど/g, 'オフェンスリバウンド');
    s = s.replace(/ディフェンシブリバウンド|ディフェンスリバウンド|ディフェンスリバン(?:ド)?|でぃふぇんすりばうんど/g, 'ディフェンスリバウンド');
    s = s.replace(/アシストー|あしすと/g, 'アシスト');
    s = s.replace(/スチール|すてぃーる|すちーる/g, 'スティール');
    s = s.replace(/ぶろっくしょっと|ぶろっく/g, 'ブロック');
    s = s.replace(/ふぁうる/g, 'ファウル');
    return s;
  }

  function japaneseNumber(token) {
    const raw = String(token || '').toLowerCase();
    if (/^\d{1,2}$/.test(raw)) return Number(raw);
    if (raw === '十' || raw === 'じゅう') return 10;
    if (raw.includes('十')) {
      const [left, right] = raw.split('十');
      const tens = left === '' ? 1 : digitMap[left];
      const ones = right === '' ? 0 : digitMap[right];
      return tens != null && ones != null ? tens * 10 + ones : null;
    }
    if (raw.includes('じゅう')) {
      const [left, right] = raw.split('じゅう');
      const tens = left === '' ? 1 : kanaDigit[left];
      const ones = right === '' ? 0 : kanaDigit[right];
      return tens != null && ones != null ? tens * 10 + ones : null;
    }
    if (raw.length === 1 && digitMap[raw] != null) return digitMap[raw];
    if (kanaDigit[raw] != null) return kanaDigit[raw];
    return null;
  }

  function numberKanji(n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 0 || n > 99) return '';
    const d = ['零','一','二','三','四','五','六','七','八','九'];
    if (n < 10) return d[n];
    const tens = Math.floor(n / 10), ones = n % 10;
    return `${tens === 1 ? '' : d[tens]}十${ones ? d[ones] : ''}`;
  }

  function numberKana(n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 0 || n > 99) return '';
    const d = ['ぜろ','いち','に','さん','よん','ご','ろく','なな','はち','きゅう'];
    if (n < 10) return d[n];
    const tens = Math.floor(n / 10), ones = n % 10;
    return `${tens === 1 ? '' : d[tens]}じゅう${ones ? d[ones] : ''}`;
  }

  function readState() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY));
      return s && s.teams ? s : null;
    } catch {
      return null;
    }
  }

  function selectedPlayer() {
    const state = readState();
    const row = document.querySelector('.player-row.is-selected[data-select-team][data-select-player]');
    if (row) {
      const team = row.dataset.selectTeam;
      const p = state?.teams?.[team]?.players?.find(x => String(x.id) === String(row.dataset.selectPlayer));
      if (p) return { team, number:Number(p.number), id:p.id, name:p.name || '' };
    }
    const team = state?.selected?.team;
    const id = state?.selected?.playerId;
    if (team && id != null) {
      const p = state?.teams?.[team]?.players?.find(x => String(x.id) === String(id));
      if (p) return { team:String(team), number:Number(p.number), id:p.id, name:p.name || '' };
    }
    return null;
  }

  function extractTeam(s) {
    if (/^(?:白|チームa|teama)/i.test(s)) return 'A';
    if (/^(?:青|チームb|teamb)/i.test(s)) return 'B';
    if (/^(?:黒|くろ|クロ|赤|あか|アカ)/.test(s)) return 'B';
    return null;
  }

  function stripTeamPrefix(s) {
    return String(s || '').replace(/^(?:白|青|黒|くろ|クロ|赤|あか|アカ|チームa|チームb|teama|teamb)/i, '').replace(/^第/, '');
  }

  function registeredNumbers(team) {
    const state = readState();
    const players = state?.teams?.[team]?.players || [];
    return [...new Set(players.map(p => Number(p.number)).filter(Number.isFinite))];
  }

  function extractPlayerNumber(s, team) {
    const body = stripTeamPrefix(s);
    const registered = registeredNumbers(team);
    for (const n of registered) {
      const variants = [String(n), numberKanji(n), numberKana(n)].filter(Boolean);
      for (const v of variants) {
        if (body.startsWith(`${v}番`) || body.startsWith(`${v}ばん`) || body.startsWith(`${v}バン`)) return n;
      }
    }
    let m = body.match(/^(\d{1,2}|[〇零一二三四五六七八九十]{1,4}|(?:じゅう)?(?:れい|ぜろ|いち|に|さん|よん|し|ご|ろく|なな|しち|はち|きゅう|く))(?:番|ばん|バン)/);
    if (!m) m = body.match(/(\d{1,2}|[〇零一二三四五六七八九十]{1,4}|(?:じゅう)?(?:れい|ぜろ|いち|に|さん|よん|し|ご|ろく|なな|しち|はち|きゅう|く))(?:番|ばん|バン)/);
    if (m) return japaneseNumber(m[1]);
    for (const n of registered) {
      const variants = [String(n), numberKanji(n), numberKana(n)].filter(Boolean);
      for (const v of variants) {
        if (body.startsWith(v)) {
          const rest = body.slice(v.length);
          if (/^(?:1点|2点|3点|フリースロー|ターンオーバー|オフェンスリバウンド|ディフェンスリバウンド|アシスト|スティール|ブロック|ファウル|tov|oreb|dreb|ast|stl|blk)/i.test(rest)) return n;
        }
      }
    }
    return null;
  }

  function determineAction(s) {
    if (/ターンオーバ|tov|turnover/i.test(s)) return 'tov';
    if (/オフェンスリバ|oreb|攻撃リバ/i.test(s)) return 'oreb';
    if (/ディフェンスリバ|dreb|守備リバ/i.test(s)) return 'dreb';
    if (/アシスト|ast/i.test(s)) return 'ast';
    if (/スティール|stl/i.test(s)) return 'stl';
    if (/ブロック|blk/i.test(s)) return 'blk';
    if (/フリースロー/.test(s)) return /失敗/.test(s) ? 'ftx' : 'ftm';
    if (/3p失敗|3点失敗|スリー失敗/i.test(s)) return 'fg3x';
    if (/2p失敗|2点失敗|ツー失敗/i.test(s)) return 'fg2x';
    if (/3点|3p|スリー/i.test(s)) return 'fg3m';
    if (/2点|2p|ツー/i.test(s)) return 'fg2m';
    if (/1点|ft成功|ft1/i.test(s)) return 'ftm';
    return null;
  }

  function parseCommand(raw) {
    const s = normalize(raw);
    const team = extractTeam(s);
    const number = team ? extractPlayerNumber(s, team) : null;
    const foul = /ファウル/.test(s);
    const action = foul ? 'foul' : determineAction(s);
    let ft = 0;
    if (foul) {
      const m = s.match(/(?:ft|フリースロー)([123一二三])(?:本|点)?/i);
      ft = m ? (japaneseNumber(m[1]) || 0) : 0;
    }
    return { raw, s, team, number, action, ft };
  }

  function resolveCommand(parsed) {
    const selected = selectedPlayer();
    let team = parsed.team;
    let number = parsed.number;
    let fromSelection = false;

    // If a player is visibly selected, short commands such as "2点" or
    // "アシスト" are intentionally accepted for that player.
    if (parsed.action && selected) {
      if (!team && number == null) {
        team = selected.team;
        number = selected.number;
        fromSelection = true;
      } else if (team && number == null && team === selected.team) {
        number = selected.number;
        fromSelection = true;
      } else if (!team && number != null && Number(number) === Number(selected.number)) {
        team = selected.team;
        fromSelection = true;
      }
    }

    return {
      ...parsed,
      team,
      number,
      fromSelection,
      complete: !!team && number != null && !!parsed.action
    };
  }

  function commandScore(resolved, confidence = 0) {
    let score = Number.isFinite(confidence) ? confidence : 0;
    if (resolved.action) score += 12;
    if (resolved.team) score += 6;
    if (resolved.number != null) score += 9;
    if (resolved.complete) score += 35;
    if (resolved.fromSelection) score += 4;
    return score;
  }

  function chooseBestAlternative(result) {
    let best = null;
    const count = Math.min(result.length || 1, 20);
    for (let j = 0; j < count; j++) {
      const alt = result[j];
      if (!alt?.transcript) continue;
      const parsed = parseCommand(alt.transcript);
      const resolved = resolveCommand(parsed);
      const score = commandScore(resolved, alt.confidence);
      if (!best || score > best.score) best = { text:alt.transcript.trim(), parsed, resolved, score };
    }
    return best;
  }

  function selectPlayer(team, number) {
    const state = readState();
    const player = state?.teams?.[team]?.players?.find(p => String(Number(p.number)) === String(Number(number)));
    if (!player) return false;
    const row = [...document.querySelectorAll(`.player-row[data-select-team="${team}"]`)]
      .find(el => String(el.dataset.selectPlayer) === String(player.id));
    if (!row) return false;
    if (!row.classList.contains('is-selected')) row.click();
    return true;
  }

  function clickAction(action) {
    const el = document.querySelector(`button[data-action="${action}"]`);
    if (!el) return false;
    el.click();
    return true;
  }

  function recordFoul(ft) {
    const open = document.getElementById('openFoul');
    if (!open) return false;
    open.click();
    const dialog = document.getElementById('foulDialog');
    if (!dialog?.open) return false;
    const p = dialog.querySelector('input[name="foulType"][value="P"]');
    if (p) p.checked = true;
    const select = document.getElementById('foulFt');
    if (select) select.value = String(ft || 0);
    document.getElementById('saveFoul')?.click();
    return true;
  }

  function actionLabel(action) {
    return ({ftm:'FT成功',ftx:'FT失敗',fg2m:'2点',fg2x:'2P失敗',fg3m:'3点',fg3x:'3P失敗',tov:'ターンオーバー',oreb:'オフェンスリバウンド',dreb:'ディフェンスリバウンド',ast:'アシスト',stl:'スティール',blk:'ブロック',foul:'ファウル'})[action] || action;
  }

  function executeResolved(resolved) {
    const { raw, team, number, action, ft, fromSelection } = resolved;
    if (!action) return feedback(`認識: ${raw} ／ 「2点」「アシスト」などプレー内容をもう一度話してください`), false;
    if (!team || number == null) return feedback(`認識: ${raw} ／ 選手をタップしてから短く話すか、「白4番2点」のように話してください`), false;

    const color = team === 'A' ? '白' : '青';
    feedback(`解釈: ${color}${number}番 ${actionLabel(action)}${fromSelection ? '（選択中の選手）' : ''}`);
    if (!selectPlayer(team, number)) return feedback(`認識: ${raw} ／ ${color}${number}番が登録選手に見つかりません`), false;

    if (action === 'foul') {
      if (!recordFoul(ft)) return feedback(`認識: ${raw} ／ ファウル入力を実行できません`), false;
      feedback(`入力完了: ${color}${number}番 ファウル${ft ? ` / FT${ft}本` : ''}`);
      return true;
    }
    if (!clickAction(action)) return feedback(`認識: ${raw} ／ 入力ボタンを実行できません`), false;
    feedback(`入力完了: ${color}${number}番 ${actionLabel(action)}`);
    return true;
  }

  function recognitionHint() {
    const selected = selectedPlayer();
    if (selected && Number.isFinite(selected.number)) {
      return `🔴 音声入力開始・選択中 ${selected.team === 'A' ? '白' : '青'}${selected.number}番 → 「2点」「アシスト」だけでもOK`;
    }
    return '🔴 音声入力開始・「白4番2点」のように続けて話してください';
  }

  function applyContextBias(r) {
    // Contextual bias is experimental, so use it only when the browser exposes it.
    try {
      if (!('phrases' in r) || typeof window.SpeechRecognitionPhrase !== 'function') return;
      const selected = selectedPlayer();
      const state = readState();
      const words = ['白','青','2点','3点','フリースロー','ターンオーバー','オフェンスリバウンド','ディフェンスリバウンド','アシスト','スティール','ブロック','ファウル'];
      for (const team of ['A','B']) {
        for (const p of state?.teams?.[team]?.players || []) {
          if (Number.isFinite(Number(p.number))) words.push(`${team === 'A' ? '白' : '青'}${Number(p.number)}番`);
        }
      }
      if (selected && Number.isFinite(selected.number)) words.push(`${selected.number}番`);
      r.phrases = [...new Set(words)].slice(0,80).map(x => new window.SpeechRecognitionPhrase(x, 5.0));
    } catch {}
  }

  function buildRecognition() {
    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 20;
    applyContextBias(r);
    lastInterim = '';
    lastFinal = '';
    bestSeen = null;
    executed = false;
    heardAudio = false;
    heardSpeech = false;

    r.onstart = () => {
      starting = false;
      listening = true;
      button.classList.add('is-listening');
      button.setAttribute('aria-pressed', 'true');
      transcript('');
      feedback(recognitionHint());
    };

    r.onaudiostart = () => {
      heardAudio = true;
      feedback('🎧 マイク入力を確認しました。声を待っています…');
    };
    r.onsoundstart = () => {
      feedback('🎧 音を検出しました。続けて話してください');
    };
    r.onspeechstart = () => {
      heardSpeech = true;
      feedback('🗣 声を検出しました。認識中…');
    };
    r.onspeechend = () => {
      feedback('認識結果を処理中…');
    };

    r.onresult = e => {
      let finalCandidate = null;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const candidate = chooseBestAlternative(result);
        if (!candidate) continue;
        if (!bestSeen || candidate.score > bestSeen.score) bestSeen = candidate;
        if (result.isFinal) {
          if (!finalCandidate || candidate.score > finalCandidate.score) finalCandidate = candidate;
        } else {
          lastInterim = candidate.text;
          transcript(lastInterim, false);
        }
      }

      if (finalCandidate) {
        const chosen = bestSeen && bestSeen.score > finalCandidate.score ? bestSeen : finalCandidate;
        transcript(chosen.text, true);
        const key = normalize(chosen.text);
        if (!executed && key !== lastFinal) {
          lastFinal = key;
          executed = executeResolved(chosen.resolved);
        }
      }
    };

    r.onnomatch = () => {
      feedback('音声は届きましたが、コマンドとして判定できませんでした。短く「2点」などで試してください');
    };

    r.onerror = e => {
      starting = false;
      listening = false;
      button.classList.remove('is-listening');
      button.setAttribute('aria-pressed', 'false');
      const names = {
        'no-speech': heardAudio ? 'マイクは接続されていますが、声を判定できませんでした' : '音声が聞き取れませんでした',
        'audio-capture':'マイクを使用できません',
        'not-allowed':'マイクまたは音声認識が許可されていません',
        'network':'音声認識の通信に失敗しました',
        'aborted':'音声入力を停止しました'
      };
      feedback(names[e.error] || `音声入力エラー: ${e.error || 'unknown'}`);
      hidePanel();
    };

    r.onend = () => {
      starting = false;
      listening = false;
      button.classList.remove('is-listening');
      button.setAttribute('aria-pressed', 'false');

      if (!executed && bestSeen?.resolved?.complete) {
        transcript(bestSeen.text, true);
        executed = executeResolved(bestSeen.resolved);
      } else if (!executed && lastInterim) {
        const resolved = resolveCommand(parseCommand(lastInterim));
        transcript(lastInterim, true);
        executeResolved(resolved);
      } else if (!executed && heardAudio && !heardSpeech) {
        feedback('🎧 マイク入力はありますが声として認識できません。口元に近づけて、短く「2点」と試してください');
      }
      hidePanel();
    };
    return r;
  }

  async function start() {
    if (!SR) return feedback('このブラウザは音声認識APIに対応していません。iPhone / iPadではSafariまたはホーム画面アプリを使用してください');
    if (isIOSNonSafari) return feedback('iPhone / iPadではSafariまたはホーム画面アプリで使用してください');
    if (starting || listening) return;
    starting = true;
    feedback('音声認識を準備中…');

    // On iPhone/iPad do not open a separate generic getUserMedia stream here.
    // It can interfere with the Bluetooth input route that was just checked by
    // mic-monitor.js. SpeechRecognition requests its own audio input.
    recognition = buildRecognition();
    try {
      recognition.start();
    } catch (err) {
      starting = false;
      feedback(`音声入力を開始できません: ${err?.name || 'unknown'}`);
    }
  }

  function stop() {
    starting = false;
    try { recognition?.stop(); } catch {}
    listening = false;
    button.classList.remove('is-listening');
    button.setAttribute('aria-pressed', 'false');
    feedback('停止しました');
    hidePanel(1600);
  }

  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (starting || listening) stop();
    else start();
  });
  button.addEventListener('pointerdown', e => e.preventDefault());

  if (!SR) status.textContent = '音声入力は対応ブラウザで使用してください';
  else if (isIOSNonSafari) status.textContent = 'iPhone / iPadではSafariまたはホーム画面アプリで使用してください';
  else status.textContent = '選手をタップ後は「2点」「アシスト」など短い音声でも入力できます';
})();
