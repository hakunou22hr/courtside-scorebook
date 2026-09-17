(() => {
  'use strict';

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;

  const button = document.getElementById('voiceBtn');
  const liveState = document.getElementById('voiceLiveState');
  const liveText = document.getElementById('voiceLiveText');
  const status = document.getElementById('voiceStatus');
  if (!button || !liveState || !liveText || !status) return;

  let timer = null;
  let retryCount = 0;
  let lastText = '';
  let restarting = false;

  function clearWatch() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function hasTranscript() {
    return !!String(liveText.textContent || '').trim();
  }

  function setMessage(text) {
    liveState.textContent = text;
    status.textContent = text;
    const panel = document.getElementById('voiceLivePanel');
    if (panel) panel.style.display = 'block';
  }

  function startWatch() {
    clearWatch();
    if (hasTranscript()) return;

    timer = setTimeout(() => {
      if (hasTranscript()) {
        retryCount = 0;
        return;
      }

      const active = button.classList.contains('is-listening') || button.getAttribute('aria-pressed') === 'true';
      if (!active || restarting) return;

      // iOS 26 can leave SpeechRecognition showing the microphone indicator
      // while returning no onresult/onerror/onend. Retry once after allowing
      // the audio session to settle, then fail visibly instead of hanging.
      if (retryCount < 1) {
        retryCount += 1;
        restarting = true;
        setMessage('🔄 iPhone音声認識を再接続しています… 約4秒お待ちください');

        try { button.click(); } catch {}

        setTimeout(() => {
          try { button.click(); } catch {}
          restarting = false;
        }, 3800);
        return;
      }

      try { button.click(); } catch {}
      setMessage('⚠️ マイクは起動していますが音声認識結果が返りません。ホーム画面アプリを一度完全終了して再起動してください。改善しない場合はSafari版で音声入力を試してください。');
      clearWatch();
    }, 5000);
  }

  const stateObserver = new MutationObserver(() => {
    const text = String(liveState.textContent || '');
    if (/音声入力開始|マイク入力を確認|声を待っています|音を検出/.test(text)) {
      startWatch();
    }
    if (/入力完了|認識結果|エラー|停止|使用できません|許可されていません/.test(text)) {
      clearWatch();
    }
  });
  stateObserver.observe(liveState, { childList: true, subtree: true, characterData: true });

  const textObserver = new MutationObserver(() => {
    const text = String(liveText.textContent || '').trim();
    if (text && text !== lastText) {
      lastText = text;
      retryCount = 0;
      clearWatch();
    }
  });
  textObserver.observe(liveText, { childList: true, subtree: true, characterData: true });

  // Starting a new manual recognition cycle should be allowed to retry once.
  button.addEventListener('click', () => {
    setTimeout(() => {
      if (!restarting && (button.classList.contains('is-listening') || button.getAttribute('aria-pressed') === 'true')) {
        if (!hasTranscript()) startWatch();
      }
    }, 200);
  });
})();
