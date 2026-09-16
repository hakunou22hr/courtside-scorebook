(() => {
  'use strict';

  const STATE_KEY = 'courtside-scorebook-v2';
  const status = document.getElementById('voiceStatus');
  const originalButton = document.getElementById('voiceBtn');
  if (!status || !originalButton) return;

  // app.js installs press-and-hold pointer handlers. On iPad a quick tap can
  // release before Safari's recognition service has actually started. Replace
  // the node so those handlers are removed, then use a tap-to-start flow.
  const button = originalButton.cloneNode(true);
  originalButton.replaceWith(button);
  const hint = button.querySelector('small');
  if (hint) hint.textContent = '1回タップで開始・もう一度で停止';
  button.setAttribute('aria-pressed', 'false');

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSNonSafari = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);

  let recognition = null;
  let starting = false;
  let listening = false;
  let gotSpeech = false;
  let startTimer = null;

  function setStatus(text) {
    status.textContent = text;
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
      .replace(/\s+/g, '');
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
    if (/白|チームA|TEAMA/i.test(s)) team = 'A';
    if (/黒|チームB|TEAMB/i.test(s)) team = 'B';

    const saved = loadState();
    if (!team) team = saved?.selected?.team || 'A';

    const numberMatch = s.match(/(\d{1,2})番/);
    if (numberMatch && !selectTeamPlayer(team, numberMatch[1])) {
      setStatus(`認識: ${raw} ／ ${numberMatch[1]}番が見つかりません`);
      return;
    }

    if (/タイムアウト/.test(s)) {
      if (!numberMatch) selectAnyFromTeam(team);
      document.getElementById('timeoutBtn')?.click();
      setStatus(`入力完了: ${raw}`);
      return;
    }

    if (/ファウル/.test(s)) {
      if (!numberMatch) {
        setStatus(`認識: ${raw} ／ 選手番号も話してください`);
        return;
      }
      const ftMatch = s.match(/(?:FT|フリースロー)([123])本?/i);
      const ft = ftMatch ? Number(ftMatch[1]) : 0;
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
      [/2P失敗|2点失敗|ツー失敗/i, 'fg2x'],
      [/3P失敗|3点失敗|スリー失敗/i, 'fg3x'],
      [/フリースロー失敗/i, 'ftx'],
      [/3点|3P|スリー/i, 'fg3m'],
      [/2点|2P|ツー/i, 'fg2m'],
      [/1点|フリースロー成功|FT成功/i, 'ftm']
    ];

    for (const [re, action] of actions) {
      if (re.test(s)) {
        if (!numberMatch) {
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
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;

    r.onstart = () => {
      starting = false;
      gotSpeech = false;
      setListening(true);
      setStatus('聞き取り中… 話してください');
      clearTimeout(startTimer);
    };
    r.onaudiostart = () => setStatus('マイク入力中… 話してください');
    r.onspeechstart = () => {
      gotSpeech = true;
      setStatus('音声を認識中…');
    };
    r.onresult = e => {
      const text = e.results?.[0]?.[0]?.transcript || '';
      if (text) executeTranscript(text);
    };
    r.onnomatch = () => setStatus('聞き取れませんでした。もう一度タップしてください');
    r.onerror = e => {
      starting = false;
      setListening(false);
      setStatus(friendlyError(e.error));
    };
    r.onend = () => {
      starting = false;
      setListening(false);
      clearTimeout(startTimer);
      if (!gotSpeech && /聞き取り中|マイク入力中|音声を認識中/.test(status.textContent)) {
        setStatus('音声が入力されませんでした。もう一度タップして話してください');
      }
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
    setStatus('マイクを準備中…');
    const micOK = await primeMicrophone();
    if (!micOK) {
      starting = false;
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
        }
      }, 5000);
    } catch (err) {
      starting = false;
      setListening(false);
      setStatus(`音声入力を開始できません: ${err?.name || 'unknown'}`);
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
  }

  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (listening || starting) stopListening();
    else startListening();
  });

  // Prevent the synthetic pointer sequence from acting like the old
  // press-and-hold control on touch devices.
  button.addEventListener('pointerdown', e => e.preventDefault());

  if (!SR) {
    setStatus('音声入力はSafariなど対応ブラウザで使用してください');
  } else if (isIOSNonSafari) {
    setStatus('iPadではSafariで開くと音声入力を利用できます');
  } else {
    setStatus('音声入力：1回タップして話してください');
  }
})();