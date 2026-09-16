(() => {
  'use strict';

  const STATE_KEY = 'courtside-scorebook-v2';
  const status = document.getElementById('voiceStatus');
  const originalButton = document.getElementById('voiceBtn');
  if (!status || !originalButton) return;

  const button = originalButton.cloneNode(true);
  originalButton.replaceWith(button);
  const hint = button.querySelector('small');
  if (hint) hint.textContent = '短く続けて話せます・もう一度タップで停止';
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
  let gotFinal = false;
  let lastFinal = '';
  let lastInterim = '';
  let hideTimer = null;

  const digitMap = {〇:0, 零:0, 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9};
  const kanaDigit = {
    'れい':0, 'ぜろ':0, 'いち':1, 'に':2, 'さん':3, 'よん':4, 'し':4,
    'ご':5, 'ろく':6, 'なな':7, 'しち':7, 'はち':8, 'きゅう':9, 'く':9
  };

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
    return String(value || '')
      .normalize('NFKC')
      .replace(/[、。，．,.!！?？・\s]/g, '')
      .replace(/ポイント/g, '点')
      .replace(/(?:1|一|いち|いっ)(?:点|てん|テン)/g, '1点')
      .replace(/(?:2|二|に)(?:点|てん|テン)/g, '2点')
      .replace(/(?:3|三|さん)(?:点|てん|テン)/g, '3点')
      .replace(/フリー・?スロー|フリースロウ|フリースロ/g, 'フリースロー')
      .replace(/ターン・?オーバー|ターンオーバ/g, 'ターンオーバー')
      .replace(/オフェンシブリバウンド|オフェンスリバン(?:ド)?/g, 'オフェンスリバウンド')
      .replace(/ディフェンシブリバウンド|ディフェンスリバン(?:ド)?/g, 'ディフェンスリバウンド')
      .replace(/アシストー/g, 'アシスト');
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

  function readState() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY));
      return s && s.teams ? s : null;
    } catch {
      return null;
    }
  }

  const teamPrefix = /^(?:白|しろ|シロ|青|あお|アオ|黒|くろ|クロ|赤|あか|アカ|チームA|チームB|TEAMA|TEAMB)/i;
  const numberToken = '(?:\\d{1,2}|[〇零一二三四五六七八九十]{1,4}|(?:じゅう)?(?:れい|ぜろ|いち|に|さん|よん|し|ご|ろく|なな|しち|はち|きゅう|く))';

  function extractTeam(s) {
    if (/白|しろ|シロ|チームA|TEAMA/i.test(s)) return 'A';
    if (/青|あお|アオ|チームB|TEAMB/i.test(s)) return 'B';
    if (/黒|くろ|クロ|赤|あか|アカ/.test(s)) return 'B';
    return readState()?.selected?.team || null;
  }

  function extractPlayerNumber(s) {
    // まずチーム名を外して、先頭の「4番 / 四番 / よんばん」を確実に拾う。
    const body = String(s || '').replace(teamPrefix, '').replace(/^第/, '');
    let m = body.match(new RegExp(`^(${numberToken})(?:番|ばん|バン)`));
    if (!m) m = String(s || '').match(new RegExp(`(${numberToken})(?:番|ばん|バン)`));
    if (m) return japaneseNumber(m[1]);

    // Safariが「番」を落とす場合のみ、チーム直後〜プレー語直前の数字を選手番号として補完。
    m = body.match(new RegExp(`^(${numberToken})(?=(?:1点|2点|3点|フリースロー|ターンオーバー|オフェンスリバウンド|ディフェンスリバウンド|アシスト|スティール|スチール|ブロック|TOV|OREB|DREB|AST|STL|BLK))`, 'i'));
    return m ? japaneseNumber(m[1]) : null;
  }

  function determineAction(s) {
    if (/ターンオーバー|TOV|TO$/i.test(s)) return 'tov';
    if (/オフェンスリバウンド|オフェンスREB|OREB/i.test(s)) return 'oreb';
    if (/ディフェンスリバウンド|ディフェンスREB|DREB/i.test(s)) return 'dreb';
    if (/アシスト|AST/i.test(s)) return 'ast';
    if (/スティール|スチール|STL/i.test(s)) return 'stl';
    if (/ブロック|ブロックショット|BLK/i.test(s)) return 'blk';
    if (/フリースロー失敗|FT失敗/i.test(s)) return 'ftx';
    if (/フリースロー(?:1点|成功)?|FT(?:1点|成功)/i.test(s)) return 'ftm';
    if (/3P失敗|3点失敗|スリー失敗/i.test(s)) return 'fg3x';
    if (/2P失敗|2点失敗|ツー失敗/i.test(s)) return 'fg2x';
    if (/3点|3P|スリー(?:ポイント)?/i.test(s)) return 'fg3m';
    if (/2点|2P|ツー(?:ポイント)?/i.test(s)) return 'fg2m';
    if (/1点/i.test(s)) return 'ftm';
    return null;
  }

  function parseCommand(raw) {
    const s = normalize(raw);
    const team = extractTeam(s);
    const number = extractPlayerNumber(s);
    const foul = /ファウル/.test(s);
    const action = foul ? 'foul' : determineAction(s);
    let ft = 0;
    if (foul) {
      const ftm = s.match(/(?:FT|フリースロー)([123一二三])(?:本|点)?/i);
      ft = ftm ? japaneseNumber(ftm[1]) || 0 : 0;
    }
    return { raw, s, team, number, action, ft, complete: !!team && number != null && !!action };
  }

  function commandScore(parsed, confidence = 0) {
    let score = confidence || 0;
    if (parsed.team) score += 4;
    if (parsed.number != null) score += 6;
    if (parsed.action) score += 8;
    if (parsed.complete) score += 20;
    return score;
  }

  function chooseBestAlternative(result) {
    let best = null;
    const count = Math.min(result.length || 1, 5);
    for (let j = 0; j < count; j++) {
      const alt = result[j];
      if (!alt?.transcript) continue;
      const parsed = parseCommand(alt.transcript);
      const score = commandScore(parsed, Number.isFinite(alt.confidence) ? alt.confidence : 0);
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
    if (!team) return feedback(`認識: ${raw} ／ 「白」または「青」を最初に話してください`), false;
    if (number == null) return feedback(`認識: ${raw} ／ 選手番号を読み取れません`), false;
    if (!action) return feedback(`認識: ${raw} ／ コマンドを特定できません`), false;
    feedback(`解釈: ${team === 'A' ? '白' : '青'} ${number}番 ${actionLabel(action)}`);
    if (!selectPlayer(team, number)) return feedback(`認識: ${raw} ／ ${team === 'A' ? '白' : '青'} ${number}番が登録選手に見つかりません`), false;

    if (action === 'foul') {
      if (recordFoul(ft)) {
        feedback(`入力完了: ${team === 'A' ? '白' : '青'} ${number}番 ファウル${ft ? ` / FT${ft}本` : ''}`);
        return true;
      }
      feedback(`認識: ${raw} ／ ファウル入力を実行できません`);
      return false;
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
    r.maxAlternatives = 5;
    lastInterim = '';

    r.onstart = () => {
      starting = false;
      listening = true;
      gotFinal = false;
      lastFinal = '';
      lastInterim = '';
      button.classList.add('is-listening');
      button.setAttribute('aria-pressed', 'true');
      transcript('');
      feedback('🔴 音声入力開始・普通の速さで話してください');
    };

    r.onresult = e => {
      let interimBest = null;
      let finalBest = null;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const best = chooseBestAlternative(result);
        if (!best) continue;
        if (result.isFinal) {
          if (!finalBest || best.score > finalBest.score) finalBest = best;
        } else {
          if (!interimBest || best.score > interimBest.score) interimBest = best;
        }
      }
      if (interimBest?.text) {
        lastInterim = interimBest.text;
        transcript(lastInterim, false);
      }
      if (finalBest?.text) {
        gotFinal = true;
        transcript(finalBest.text, true);
        const key = normalize(finalBest.text);
        if (key !== lastFinal) {
          lastFinal = key;
          executeParsed(finalBest.parsed);
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
      if (!gotFinal && lastInterim) {
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
  else status.textContent = '音声入力：白/青 → 背番号 → 得点・スタッツを普通の速さで話してください';
})();