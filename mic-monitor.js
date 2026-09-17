(() => {
  'use strict';

  if (!navigator.mediaDevices?.getUserMedia) return;

  let stream = null;
  let audioContext = null;
  let analyser = null;
  let raf = null;
  let source = null;
  let activeDeviceId = '';

  const style = document.createElement('style');
  style.textContent = `
    .mic-monitor{display:flex;align-items:center;gap:8px;min-width:260px;max-width:430px;padding:6px 9px;border:1px solid #d7e1ec;border-radius:9px;background:#fff;color:#17365f;font-family:Arial,'Noto Sans JP',sans-serif}
    .mic-monitor button{border:0;border-radius:7px;background:#17365f;color:#fff;padding:8px 10px;font-weight:900;white-space:nowrap;cursor:pointer}
    .mic-monitor button.is-on{background:#d51f32}
    .mic-monitor-info{min-width:0;flex:1}
    .mic-monitor-title{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:900;white-space:nowrap}
    .mic-monitor-device{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:#62758b;margin-top:2px}
    .mic-monitor-bars{display:flex;align-items:flex-end;gap:2px;height:16px;margin-left:auto}
    .mic-monitor-bars i{display:block;width:4px;height:4px;border-radius:2px;background:#cbd6e2;transition:height .06s linear,background .06s linear}
    .mic-monitor-bars i.on{background:#24a148}
    .mic-monitor-bars i.hot{background:#f0a000}
    .mic-monitor-bars i.peak{background:#d51f32}
    .mic-monitor-select{display:none;max-width:150px;border:1px solid #ccd7e2;border-radius:6px;padding:5px;font-size:10px;background:#fff;color:#17365f}
    .mic-monitor.has-devices .mic-monitor-select{display:block}
    .mic-monitor-status{font-size:10px;color:#62758b;white-space:nowrap}
    @media(max-width:900px){.mic-monitor{min-width:210px}.mic-monitor-select{max-width:110px}.mic-monitor-device{max-width:120px}}
  `;
  document.head.appendChild(style);

  const host = document.createElement('div');
  host.className = 'mic-monitor';
  host.innerHTML = `
    <button type="button" id="micTestBtn">🎧 マイク確認</button>
    <div class="mic-monitor-info">
      <div class="mic-monitor-title"><span id="micMonitorStatus">待機</span><span class="mic-monitor-status" id="micBtHint"></span></div>
      <span class="mic-monitor-device" id="micDeviceLabel">入力マイク未確認</span>
    </div>
    <select class="mic-monitor-select" id="micDeviceSelect" aria-label="確認するマイク"></select>
    <div class="mic-monitor-bars" id="micBars" aria-label="マイク音量">
      ${Array.from({length:8},()=>'<i></i>').join('')}
    </div>`;

  const bottomBar = document.querySelector('.bottom-bar');
  const voiceStatus = document.getElementById('voiceStatus');
  if (bottomBar && voiceStatus) bottomBar.insertBefore(host, voiceStatus);
  else if (bottomBar) bottomBar.appendChild(host);
  else document.body.appendChild(host);

  const testBtn = host.querySelector('#micTestBtn');
  const statusEl = host.querySelector('#micMonitorStatus');
  const labelEl = host.querySelector('#micDeviceLabel');
  const btHint = host.querySelector('#micBtHint');
  const selectEl = host.querySelector('#micDeviceSelect');
  const bars = [...host.querySelectorAll('#micBars i')];

  function setBars(level){
    const lit = Math.max(0, Math.min(bars.length, Math.round(level * bars.length)));
    bars.forEach((bar, i) => {
      bar.className = '';
      bar.style.height = `${4 + i * 1.5}px`;
      if (i < lit) bar.classList.add(i >= 7 ? 'peak' : i >= 5 ? 'hot' : 'on');
    });
  }

  function stopMonitor(message='待機'){
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (source) try{source.disconnect()}catch{}
    source = null;
    if (analyser) try{analyser.disconnect()}catch{}
    analyser = null;
    if (audioContext) try{audioContext.close()}catch{}
    audioContext = null;
    if (stream) stream.getTracks().forEach(t=>t.stop());
    stream = null;
    testBtn.classList.remove('is-on');
    testBtn.textContent = '🎧 マイク確認';
    statusEl.textContent = message;
    setBars(0);
  }

  async function refreshDevices(){
    try{
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');
      const previous = selectEl.value || activeDeviceId;
      selectEl.innerHTML = '';
      devices.forEach((d,i)=>{
        const option=document.createElement('option');
        option.value=d.deviceId;
        option.textContent=d.label || `マイク ${i+1}`;
        selectEl.appendChild(option);
      });
      if(devices.length>1) host.classList.add('has-devices'); else host.classList.remove('has-devices');
      if(previous && devices.some(d=>d.deviceId===previous)) selectEl.value=previous;
      return devices;
    }catch{return []}
  }

  function describeTrack(track){
    const label = track?.label || '入力マイク';
    labelEl.textContent = label;
    const lower = label.toLowerCase();
    const looksBluetooth = /bluetooth|airpods|beats|buds|headset|ヘッドセット|イヤホン/.test(lower);
    btHint.textContent = looksBluetooth ? 'Bluetooth候補' : '';
    return label;
  }

  async function startMonitor(deviceId=''){
    stopMonitor('接続中…');
    try{
      const constraints = {
        audio: {
          ...(deviceId ? {deviceId:{exact:deviceId}} : {}),
          echoCancellation:true,
          noiseSuppression:true,
          autoGainControl:true
        }
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getAudioTracks()[0];
      activeDeviceId = track?.getSettings?.().deviceId || deviceId || '';
      describeTrack(track);
      await refreshDevices();
      if(activeDeviceId && [...selectEl.options].some(o=>o.value===activeDeviceId)) selectEl.value=activeDeviceId;

      const AC = window.AudioContext || window.webkitAudioContext;
      audioContext = new AC();
      if(audioContext.state==='suspended') await audioContext.resume();
      source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      testBtn.classList.add('is-on');
      testBtn.textContent = '■ 確認停止';
      statusEl.textContent = '入力中';

      const draw = () => {
        if(!analyser) return;
        analyser.getByteTimeDomainData(data);
        let sum=0;
        for(let i=0;i<data.length;i++){
          const v=(data[i]-128)/128;
          sum += v*v;
        }
        const rms=Math.sqrt(sum/data.length);
        const level=Math.min(1, rms*8.5);
        setBars(level);
        raf=requestAnimationFrame(draw);
      };
      draw();
    }catch(err){
      const name=err?.name||'';
      let msg='マイクを使用できません';
      if(name==='NotAllowedError') msg='マイク許可が必要です';
      else if(name==='NotFoundError') msg='マイクが見つかりません';
      else if(name==='OverconstrainedError') msg='選択したマイクを使用できません';
      stopMonitor(msg);
      labelEl.textContent = msg;
      btHint.textContent='';
    }
  }

  testBtn.addEventListener('click',()=>{
    if(stream) stopMonitor();
    else startMonitor(selectEl.value||'');
  });

  selectEl.addEventListener('change',()=>startMonitor(selectEl.value));

  // SpeechRecognition and getUserMedia can compete for the microphone on iPad.
  // Stop the test stream immediately before real voice input starts.
  const voiceBtn=document.getElementById('voiceBtn');
  voiceBtn?.addEventListener('pointerdown',()=>{
    if(stream) stopMonitor('音声入力へ切替');
  },true);

  navigator.mediaDevices.addEventListener?.('devicechange',refreshDevices);
  window.addEventListener('beforeunload',()=>stopMonitor());
  refreshDevices();
})();
