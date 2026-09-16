(() => {
  'use strict';

  const STATE_KEY = 'courtside-scorebook-v2';
  const status = document.getElementById('voiceStatus');
  const originalButton = document.getElementById('voiceBtn');
  if (!status || !originalButton) return;

  const button = originalButton.cloneNode(true);
  originalButton.replaceWith(button);
  const hint = button.querySelector('small');
  if (hint) hint.textContent = '普通の速さで短く話す・もう一度タップで停止';
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

    // 色名。Safariが「しろ」を「ひろ」と誤認識するケースも試合コマンドの先頭なら白として扱う。
    s = s.replace(/^(?:しろ|シロ|ひろ|ヒロ|白)/, '白');
    s = s.replace(/^(?:あお|アオ|あを|青)/, '青');

    // 得点の表記揺れ。音声入力では「一点」が「言ってん」になることがある。
    s = s.replace(/(?:1|一|いち|いっ)(?:点|てん|テン)|一点|言ってん|いってん|イッテン|一転/g, '1点');
    s = s.replace(/(?:2|二|に)(?:点|てん|テン)|二点|ニテン/g, '2点');
    s = s.replace(/(?:3|三|さん)(?:点|てん|テン)|三点|サンテン/g, '3点');
    s = s.replace(/ポイント/g, '点');

    // バスケットボール用語の表記揺れ。
    s = s.replace(/フリー?スロー|フリースロウ|フリースロ|ふりーすろー|ふりーすろ/g, 'フリースロー');
    s = s.replace(/ターンオーバー|ターンオーバ|たーんおーばー|たーんおーば|ターンオーヴァー/g, 'ターンオーバー');
    s = s.replace(/オフェンシブリバウンド|オフェンスリバウンド|オフェンスリバン(?:ド)?|おふぇんすりばうんど/g, 'オフェンスリバウンド');
    s = s.replace(/ディフェンシブリバウンド|ディフェンスリバウンド|ディフェンスリバン(?:ド)?|でぃふぇんすりばうんど/g, 'ディフェンスリバウンド');
    s = s.replace(/アシストー|あしすと/g, 'アシスト');
    s = s.replace(/スチール|すてぃーる|すちーる/g, 'スティール');
    s = s.replace(/ぶろっくしょっと|ぶろっく/g, 'ブロック');
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
    if (n < 10) return Object.keys(digitMap).find(k => digitMap[k] === n && k !== '零') || (n === 0 ? '零' : '');
    const tens = Math.floor(n / 10), ones = n % 10;
    const d = ['零','一','二','三','四','五','六','七','八','九'];
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

  function extractTeam(s) {
    if (/^(?:白|チームa|teama)/i.test(s)) return 'A';
    if (/^(?:青|チームb|teamb)/i.test(s)) return 'B';
    // 従来呼称も許容。
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

    // 登録済み背番号を先に照合する。試合中の誤認識を最小化するための最優先ルール。
    for (const n of registered) {
      const variants = [String(n), numberKanji(n), numberKana(n)].filter(Boolean);
      for (const v of variants) {
        if (body.startsWith(`${v}番`) || body.startsWith(`${v}ばん`) || body.startsWith(`${v}バン`)) return n;
      }
    }

    // 一般的な番号表記のフォールバック。
    let m = body.match(/^(\d{1,2}|[〇零一二三四五六七八九十]{1,4}|(?:じゅう)?(?:れい|ぜろ|いち|に|さん|よん|し|ご|ろく|なな|しち|はち|きゅう|く))(?:番|ばん|バン)/);
    if (!m) m = body.match(/(\d{1,2}|[〇零一二三四五六七八九十]{1,4}|(?:じゅう)?(?:れい|ぜろ|いち|に|さん|よん|し|ご|ろく|なな|しち|はち|きゅう|く))(?:番|ばん|バン)/);
    if (m) return japaneseNumber(m[1]);

    // 「番」が落ちた場合は、登録済み番号かつ直後にプレー語があるときだけ補完する。
    for (const n of registered) {
      const variants = [String(n), numberKanji(n), numberKana(n)].filter(Boolean);
      for (const v of variants) {
        if (body.startsWith(v)) {
          const rest = body.slice(v.length);
          if (/^(?:1点|2点|3点|フリースロー|ターンオーバー|オフェンスリバウンド|ディフェンスリバウンド|アシスト|スティール|ブロック|tov|oreb|dreb|ast|stl|blk)/i.test(rest)) return n;
        }
      }
    }
    return null;
  }

  function determineAction(s) {
    // スタッツを得点より先に判定。
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
    const foul = /ファウル|ふぁうる/.test(s);
    const action = foul ? 'foul' : determineAction(s);
    let ft = 0;
    if (foul) {
      const m = s.match(/(?:ft|フリースロー)([123一二三])(?:本|点)?/i);
      ft = m ? (japaneseNumber(m[1]) || 0) : 0;
    }
    return { raw, s, team, number, action, ft, complete: !!team && number != null && !!action };
  }

  function commandScore(parsed, confidence = 0) {
    let score = Number.isFinite(confidence) ? confidence : 0;
    if (parsed.team) score += 5;
    if (parsed.number != null) score += 8;
    if (parsed.action) score += 10;
    if (parsed.complete) score += 30;
    return score;
  }

  function chooseBestAlternative(result) {
    let best = null;
    const count = Math.min(result.length || 1, 10);
    for (let j = 0; j < count; j++) {
      const alt = result[j];
      if (!alt?.transcript) continue;
      const parsed = parseCommand(alt.transcript);
      const score = commandScore(parsed, alt.confidence);
      if (!best || score > best.score) best = { text: alt.transcript.trim(), parsed, score };
    }
    return best;
  }

  function selectPlayer(team, number) {
    const state = readState();
    const player = state?.teams?.[team]?.players?.find(p => String(Number(p.number)) === String(Number(number)));
    if (!player) return false;
    const row = [...document.querySelectorAll(`.player-row[data-select-team="${team}"]`)]
      .find(el => el.dataset.selectPlayer === player.id);
    if (!row) return false;
    row.click();
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

  function executeParsed(parsed) {
    const { raw, team, number, action, ft } = parsed;
    if (!team) return feedback(`認識: ${raw} ／ 最初に「白」か「青」を話してください`), false;
    if (number == null) return feedback(`認識: ${raw} ／ 登録選手の背番号を特定できません`), false;
    if (!action) return feedback(`認識: ${raw} ／ プレー内容を特定できません`), false;

    feedback(`解釈: ${team === 'A' ? '白' : '青'} ${number}番 ${actionLabel(action)}`);
    if (!selectPlayer(team, number)) return feedback(`認識: ${raw} ／ ${team === 'A' ? '白' : '青'} ${number}番が登録選手に見つかりません`), false;

    if (action === 'foul') {
      if (!recordFoul(ft)) return feedback(`認識: ${raw} ／ ファウル入力を実行できません`), false;
      feedback(`入力完了: ${team === 'A' ? '白' : '青'} ${number}番 ファウル${ft ? ` / FT${ft}本` : ''}`);
      return true;
    }

    if (!clickAction(action)) return feedback(`認識: ${raw} ／ 入力ボタンを実行できません`), false;
    feedback(`入力完了: ${team === 'A' ? '白' : '青'} ${number}番 ${actionLabel(action)}`);
    return true;
  }

  async function primeMic() {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch {
      feedback('マイクの許可が必要です。iPadの設定でSafariのマイクを許可してください');
      return false;
    }
  }

  function buildRecognition() {
    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 10;
    lastInterim = '';
    lastFinal = '';
    bestSeen = null;
    executed = false;

    r.onstart = () => {
      starting = false;
      listening = true;
      button.classList.add('is-listening');
      button.setAttribute('aria-pressed', 'true');
      transcript('');
      feedback('🔴 音声入力開始・「白4番2点」のように続けて話してください');
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
          executed = executeParsed(chosen.parsed);
        }
      }
    };

    r.onerror = e => {
      starting = false;
      listening = false;
      button.classList.remove('is-listening');
      button.setAttribute('aria-pressed', 'false');
      const names = {
        'no-speech':'音声が聞き取れませんでした',
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

      // 最終結果が弱くても、途中候補で完全なコマンドが取れていればそちらを実行する。
      if (!executed && bestSeen?.parsed?.complete) {
        transcript(bestSeen.text, true);
        executed = executeParsed(bestSeen.parsed);
      } else if (!executed && lastInterim) {
        const parsed = parseCommand(lastInterim);
        transcript(lastInterim, true);
        executeParsed(parsed);
      }
      hidePanel();
    };
    return r;
  }

  async function start() {
    if (!SR) return feedback('このブラウザは音声認識APIに対応していません。iPadではSafariを使用してください');
    if (isIOSNonSafari) return feedback('iPadではSafariで開いて使用してください');
    if (starting || listening) return;
    starting = true;
    feedback('マイクを準備中…');
    if (!(await primeMic())) {
      starting = false;
      return;
    }
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
  else if (isIOSNonSafari) status.textContent = 'iPadではSafariで開いてください';
  else status.textContent = '音声入力：白/青 → 背番号 → 得点・スタッツを続けて話してください';
})();