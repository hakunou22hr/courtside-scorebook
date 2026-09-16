(() => {
  'use strict';

  const STATE_KEY = 'courtside-scorebook-v2';
  const status = document.getElementById('voiceStatus');
  const originalButton = document.getElementById('voiceBtn');
  if (!status || !originalButton) return;

  const button = originalButton.cloneNode(true);
  originalButton.replaceWith(button);
  const hint = button.querySelector('small');
  if (hint) hint.textContent = '1回タップで開始・もう一度で停止';
  button.setAttribute('aria-pressed', 'false');

  const livePanel = document.createElement('div');
  livePanel.id = 'voiceLivePanel';
  livePanel.setAttribute('role', 'status');
  livePanel.setAttribute('aria-live', 'polite');
  livePanel.setAttribute('aria-atomic', 'false');
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
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSNonSafari = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

  let recognition = null;
  let starting = false;
  let listening = false;
  let gotSpeech = false;
  let gotFinalResult = false;
  let startTimer = null;
  let hideTimer = null;
  let lastExecutedFinal = '';

  function showLivePanel() {
    clearTimeout(hideTimer);
    livePanel.style.display = 'block';
  }

  function hideLivePanelSoon(delay = 4500) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!starting && !listening) livePanel.style.display = 'none';
    }, delay);
  }

  function setStatus(text, showPanel = true) {
    status.textContent = text;
    liveState.textContent = text;
    if (showPanel) showLivePanel();
  }

  function setTranscript(text, mode = 'live') {
    if (!text) {
      liveText.textContent = '';
      return;
    }
    liveText.textContent = `${mode === 'final' ? '認識結果' : '文字起こし中'}：${text}`;
    showLivePanel();
  }

  function setListening(on) {
    listening = on;
    button.classList.toggle('is-listening', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY));
      return s && s.teams ? s : null;
    } catch {
      return null;
    }
  }

  function normalize(text) {
    return String(text || '')
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[。、，,．.]/g, '')
      .replace(/\s+/g, '');
  }

  function japaneseNumberToInt(token) {
    const value = String(token || '');
    if (/^\d{1,2}$/.test(value)) return Number(value);
    const digit = { '〇':0, '零':0, '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9 };
    if (value === '十') return 10;
    if (value.includes('十')) {
      const [left, right] = value.split('十');
      const tens = left === '' ? 1 : digit[left];
      const ones = right === '' ? 0 : digit[right];
      if (tens != null && ones != null) return tens * 10 + ones;
      return NaN;
    }
    if (value.length === 1 && digit[value] != null) return digit[value];
    return NaN;
  }

  function extractPlayerNumber(s) {
    const m = s.match(/(\d{1,2}|[〇零一二三四五六七八九十]{1,3})番/);
    if (!m) return null;
    const n = japaneseNumberToInt(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function selectTeamPlayer(team, number) {
    const s = loadState();
    const players = s?.teams?.[team]?.players || [];
    const p = players.find(x => String(Number(x.number)) === String(Number(number)));
    if (!p) return false;
    const row = document.querySelector(`.player-row[data-select-team="${team}"][data-select-player="${CSS.escape(p.id)}"]`);
    if (!row) return false;
    row.click();
    return true;
  }

  function selectAnyFromTeam(team) {
    const row = document.querySelector(`.player-row[data-select-team="${team}"]`);
    if (!row) return false;
    row.click();
    return true;
  }

  function clickAction(action) {
    const b = document.querySelector(`button[data-action="${action}"]`);
    if (!b) return false;
    b.click();
    return true;
  }

  function recordVoiceFoul(ft) {
    const open = document.getElementById('openFoul');
    if (!open) return false;
    open.click();
    const dialog = document.getElementById('foulDialog');
    if (!dialog?.open) return false;
    const p = document.querySelector('input[name="foulType"][value="P"]');
    if (p) p.checked = true;
    const select = document.getElementById('foulFt');
    if (select) select.value = String(ft);
    document.getElementById('saveFoul')?.click();
    return true;
  }

  function executeTranscript(raw) {
    const s = normalize(raw);
    let team = null;
    // 音声認識で「青四番」「青4番」と返るケースにも対応。
    if (/青|白|チームA|TEAMA/i.test(s)) team = 'A';
    if (/赤|黒|チームB|TEAMB/i.test(s)) team = 'B';

    const saved = loadState();
    if (!team) team = saved?.selected?.team || 'A';

    const playerNumber = extractPlayerNumber(s);
    const hasPlayerNumber = playerNumber !== null;
    if (hasPlayerNumber && !selectTeamPlayer(team, playerNumber)) {
      setStatus(`認識: ${raw} ／ ${playerNumber}番が見つかりません`);
      return;
    }

    if (/タイムアウト/.test(s)) {
      if (!hasPlayerNumber) selectAnyFromTeam(team);
      document.getElementById('timeoutBtn')?.click();
      setStatus(`入力完了: ${raw}`);
      return;
    }

    if (/ファウル/.test(s)) {
      if (!hasPlayerNumber) {
        setStatus(`認識: ${raw} ／ 選手番号も話してください`);
        return;
      }
      const ftMatch = s.match(/(?:FT|フリースロー)([123一二三])本?/i);
      const ft = ftMatch ? japaneseNumberToInt(ftMatch[1]) : 0;
      if (recordVoiceFoul(ft)) setStatus(`入力完了: ${raw}`);
      return;
    }

    const actions = [
      [/オフェンスリバウンド|OREB/i, 'oreb'],
      [/ディフェンスリバウンド|DREB/i, 'dreb'],
      [/アシスト|AST/i, 'ast'],
      [/ターンオーバー|TOV|TO$/i, 'tov'],
      [/スティール|STL/i, 'stl'],
      [/ブロック|BLK/i, 'blk'],
      [/2P失敗|2点失敗|二点失敗|ツー失敗/i, 'fg2x'],
      [/3P失敗|3点失敗|三点失敗|スリー失敗/i, 'fg3x'],
      [/フリースロー失敗/i, 'ftx'],
      [/3点|3P|三点|スリー/i, 'fg3m'],
      [/2点|2P|二点|ツー/i, 'fg2m'],
      [/1点|一点|フリースロー成功|FT成功/i, 'ftm']
    ];

    for (const [re, action] of actions) {
      if (re.test(s)) {
        if (!hasPlayerNumber) {
          setStatus(`認識: ${raw} ／ 選手番号も話してください`);
          return;
        }
        if (clickAction(action)) setStatus(`入力完了: ${raw}`);
        return;
      }
    }

    setStatus(`認識: ${raw} ／ コマンドを特定できません`);
  }

  function friendlyError(code) {
    const map = {
      'not-allowed': 'マイクまたは音声認識が許可されていません',
      'service-not-allowed': 'Safariの音声認識サービスが利用できません',
      'audio-capture': 'マイクを使用できません',
      'no-speech': '音声が聞き取れませんでした',
      'network': '音声認識の通信に失敗しました',
      'aborted': '音声入力を停止しました',
      'language-not-supported': '日本語の音声認識が利用できません'
    };
    return map[code] || `音声入力エラー: ${code}`;
  }

  async function primeMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      setStatus('マイクの許可が必要です。iPadの設定 → Safari → マイクを確認してください');
      return false;
    }
  }

  function buildRecognition() {
    if (!SR) return null;
    const r = new SR();
    r.lang = 'ja-JP';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;

    r.onstart = () => {
      starting = false;
      gotSpeech = false;
      gotFinalResult = false;
      lastExecutedFinal = '';
      setListening(true);
      setTranscript('');
      setStatus('🔴 音声入力開始・話してください');
      clearTimeout(startTimer);
    };
    r.onaudiostart = () => setStatus('🎤 マイクON・音声を聞いています');
    r.onsoundstart = () => setStatus('🎧 音を検出しました');
    r.onspeechstart = () => {
      gotSpeech = true;
      setStatus('📝 リアルタイム文字起こし中…');
    };
    r.onresult = e => {
      let interimText = '';
      let finalText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result?.[0]?.transcript || '';
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      interimText = interimText.trim();
      finalText = finalText.trim();
      if (interimText) {
        gotSpeech = true;
        setStatus('📝 リアルタイム文字起こし中…');
        setTranscript(interimText, 'live');
      }
      if (finalText) {
        gotSpeech = true;
        gotFinalResult = true;
        setTranscript(finalText, 'final');
        if (finalText !== lastExecutedFinal) {
          lastExecutedFinal = finalText;
          executeTranscript(finalText);
        }
      }
    };
    r.onspeechend = () => {
      if (!gotFinalResult) setStatus('⏳ 音声を文字に変換しています…');
    };
    r.onnomatch = () => {
      setStatus('聞き取れませんでした。もう一度タップしてください');
      hideLivePanelSoon();
    };
    r.onerror = e => {
      starting = false;
      setListening(false);
      setStatus(friendlyError(e.error));
      hideLivePanelSoon();
    };
    r.onend = () => {
      starting = false;
      setListening(false);
      clearTimeout(startTimer);
      if (!gotSpeech && /音声入力開始|マイクON|音を検出|文字起こし/.test(liveState.textContent)) {
        setStatus('音声が入力されませんでした。もう一度タップして話してください');
      } else if (gotSpeech && !gotFinalResult) {
        setStatus('音声は検出しましたが文字起こしを確定できませんでした。もう一度お試しください');
      }
      hideLivePanelSoon();
    };
    return r;
  }

  async function startListening() {
    if (!SR) {
      setStatus('このブラウザは音声認識APIに対応していません。iPadではSafariで開いてください');
      return;
    }
    if (isIOSNonSafari) {
      setStatus('iPadの音声入力はSafariで開いて使用してください');
      return;
    }
    if (starting || listening) return;

    starting = true;
    setTranscript('');
    setStatus('マイクを準備中…');
    const micOK = await primeMicrophone();
    if (!micOK) {
      starting = false;
      hideLivePanelSoon();
      return;
    }

    recognition = buildRecognition();
    if (!recognition) {
      starting = false;
      return;
    }

    try {
      recognition.start();
      startTimer = setTimeout(() => {
        if (starting && !listening) {
          starting = false;
          setListening(false);
          setStatus('音声認識が開始できません。Safariで開き、Siriとマイクの許可を確認してください');
          try { recognition.abort(); } catch {}
          hideLivePanelSoon();
        }
      }, 5000);
    } catch (err) {
      starting = false;
      setListening(false);
      setStatus(`音声入力を開始できません: ${err?.name || 'unknown'}`);
      hideLivePanelSoon();
    }
  }

  function stopListening() {
    clearTimeout(startTimer);
    starting = false;
    if (recognition) {
      try { recognition.stop(); } catch {}
    }
    setListening(false);
    setStatus('停止しました');
    hideLivePanelSoon(1800);
  }

  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (listening || starting) stopListening();
    else startListening();
  });

  button.addEventListener('pointerdown', e => e.preventDefault());

  if (!SR) {
    setStatus('音声入力はSafariなど対応ブラウザで使用してください', false);
  } else if (isIOSNonSafari) {
    setStatus('iPadではSafariで開くと音声入力を利用できます', false);
  } else {
    setStatus('音声入力：1回タップして話してください', false);
  }
})();