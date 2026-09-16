(() => {
  'use strict';

  const STATE_KEY = 'courtside-scorebook-v2';
  const status = document.getElementById('voiceStatus');
  if (!status) return;

  let lastHandled = '';

  function normalizeText(value) {
    return String(value || '')
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[、。，．,.!！?？・\s]/g, '')
      .replace(/ポイント/g, '点')
      .replace(/てん|テン/g, '点');
  }

  function japaneseNumber(token) {
    const s = String(token || '')
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/〇|零/g, '0');
    if (/^\d{1,2}$/.test(s)) return Number(s);

    const digit = {一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
    if (s === '十') return 10;
    if (s.includes('十')) {
      const [left, right] = s.split('十');
      const tens = left ? digit[left] : 1;
      const ones = right ? digit[right] : 0;
      if (tens && ones !== undefined) return tens * 10 + ones;
    }
    if (s.length === 1 && digit[s]) return digit[s];
    return null;
  }

  function readState() {
    try {
      const value = JSON.parse(localStorage.getItem(STATE_KEY));
      return value && value.teams ? value : null;
    } catch {
      return null;
    }
  }

  function setFeedback(text) {
    status.textContent = text;
    const liveState = document.getElementById('voiceLiveState');
    if (liveState) liveState.textContent = text;
  }

  function selectPlayer(team, number) {
    const state = readState();
    const player = state?.teams?.[team]?.players?.find(
      p => String(Number(p.number)) === String(Number(number))
    );
    if (!player) return false;

    const row = [...document.querySelectorAll(`.player-row[data-select-team="${team}"]`)]
      .find(el => el.dataset.selectPlayer === player.id);
    if (!row) return false;
    row.click();
    return true;
  }

  function clickAction(action) {
    const button = document.querySelector(`button[data-action="${action}"]`);
    if (!button) return false;
    button.click();
    return true;
  }

  function extractTranscript() {
    const liveText = document.getElementById('voiceLiveText')?.textContent || '';
    const fromPanel = liveText.replace(/^.*?：/, '').trim();
    if (fromPanel) return fromPanel;

    const text = status.textContent || '';
    const m = text.match(/認識[:：]\s*(.*?)\s*[／/]/);
    return m ? m[1].trim() : '';
  }

  function tryFallback() {
    const currentStatus = status.textContent || '';
    if (!/コマンドを特定できません/.test(currentStatus)) return;

    const raw = extractTranscript();
    if (!raw) return;

    const key = `${raw}|${currentStatus}`;
    if (key === lastHandled) return;
    lastHandled = key;

    const s = normalizeText(raw);
    let team = null;
    if (/白|青|チームA|TEAMA/i.test(s)) team = 'A';
    if (/黒|赤|チームB|TEAMB/i.test(s)) team = 'B';
    if (!team) team = readState()?.selected?.team || 'A';

    const numberMatch = s.match(/([0-9]{1,2}|[一二三四五六七八九十〇零]{1,3})番/);
    if (!numberMatch) {
      setFeedback(`認識: ${raw} ／ 選手番号を読み取れません`);
      return;
    }
    const playerNumber = japaneseNumber(numberMatch[1]);
    if (!playerNumber || !selectPlayer(team, playerNumber)) {
      setFeedback(`認識: ${raw} ／ ${numberMatch[1]}番が見つかりません`);
      return;
    }

    const pointMatch = s.match(/([123一二三])点/);
    if (pointMatch) {
      const points = japaneseNumber(pointMatch[1]);
      const action = points === 1 ? 'ftm' : points === 2 ? 'fg2m' : points === 3 ? 'fg3m' : null;
      if (action && clickAction(action)) {
        setFeedback(`入力完了: ${raw}`);
        return;
      }
    }

    if (/フリースロー失敗/.test(s) && clickAction('ftx')) return setFeedback(`入力完了: ${raw}`);
    if (/2P失敗|2点失敗|ツー失敗/.test(s) && clickAction('fg2x')) return setFeedback(`入力完了: ${raw}`);
    if (/3P失敗|3点失敗|スリー失敗/.test(s) && clickAction('fg3x')) return setFeedback(`入力完了: ${raw}`);

    setFeedback(`認識: ${raw} ／ 得点内容を読み取れません`);
  }

  const observer = new MutationObserver(() => queueMicrotask(tryFallback));
  observer.observe(status, { childList: true, characterData: true, subtree: true });

  const liveState = document.getElementById('voiceLiveState');
  if (liveState) observer.observe(liveState, { childList: true, characterData: true, subtree: true });
})();
