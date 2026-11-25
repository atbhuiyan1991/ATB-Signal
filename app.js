(() => {
  const SOUND_STORAGE_KEY = 'smc_engine_sound_v1';

  const state = {
    signals: [],
    logs: JSON.parse(localStorage.getItem(CONFIG.storageKeys.logs) || '[]'),
    mode: localStorage.getItem(CONFIG.storageKeys.mode) || CONFIG.exchanges.defaultMode,
    soundEnabled: localStorage.getItem(SOUND_STORAGE_KEY) !== 'false',
    alertedIds: new Set(),
    audioCtx: null,
    autoTimer: null,
    isScanning: false
  };

  const el = {
    exchangeMode: document.getElementById('exchangeMode'),
    stateFilter: document.getElementById('stateFilter'),
    scanBtn: document.getElementById('scanBtn'),
    autoBtn: document.getElementById('autoBtn'),
    soundBtn: document.getElementById('soundBtn'),
    clearLogBtn: document.getElementById('clearLogBtn'),
    statScanned: document.getElementById('statScanned'),
    statWatchlist: document.getElementById('statWatchlist'),
    statValid: document.getElementById('statValid'),
    statTime: document.getElementById('statTime'),
    statusText: document.getElementById('statusText'),
    signalsList: document.getElementById('signalsList'),
    logList: document.getElementById('logList')
  };

  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!state.audioCtx) {
      state.audioCtx = new AudioContextClass();
    }
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume().catch(() => {});
    }
    return state.audioCtx;
  }

  function playAlertSound() {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0, duration: 0.14 },
      { freq: 1174.66, start: 0.16, duration: 0.22 }
    ];

    notes.forEach(({ freq, start, duration }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration + 0.02);
    });
  }

  function syncSoundButton() {
    if (!el.soundBtn) return;
    el.soundBtn.textContent = state.soundEnabled ? 'Sound: ON' : 'Sound: OFF';
    el.soundBtn.classList.toggle('active', state.soundEnabled);
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem(SOUND_STORAGE_KEY, String(state.soundEnabled));
    syncSoundButton();
    if (state.soundEnabled) {
      playAlertSound();
      addLog('Sound alert enabled.');
    } else {
      addLog('Sound alert muted.');
    }
  }

  function addLog(message) {
    const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
    state.logs = [entry, ...state.logs].slice(0, 120);
    localStorage.setItem(CONFIG.storageKeys.logs, JSON.stringify(state.logs));
    renderLogs();
  }

  function renderLogs() {
    el.logList.innerHTML = state.logs.length
      ? state.logs.map(item => `<li>${item}</li>`).join('')
      : '<li>No logs yet.</li>';
  }

  function fmtPrice(val) {
    if (val === null || val === undefined || Number.isNaN(val)) return '—';
    return val >= 1 ? Number(val).toFixed(2) : Number(val).toFixed(5);
  }

  function renderSignals() {
    const filter = el.stateFilter.value;
    const list = filter === 'ALL'
      ? state.signals
      : state.signals.filter(s => s.state === filter);

    const validCount = state.signals.filter(s => s.state === 'VALID SETUP').length;
    el.statValid.textContent = String(validCount);

    if (!list.length) {
      el.signalsList.innerHTML = '<p class="status-text">No setups match the selected filter.</p>';
      return;
    }

    el.signalsList.innerHTML = list.map(s => `
      <article class="signal-card">
        <div class="card-top">
          <div class="badges">
            <span class="badge ex-${s.exchange}">${s.exchange}</span>
            <strong>${s.symbol}</strong>
            <span class="side-${s.side}">${s.side}</span>
          </div>
          <span class="badge state-${s.state}">${s.state}</span>
        </div>
        <div class="levels">
          <div>Entry: <strong>${fmtPrice(s.entry)}</strong></div>
          <div>R:R: <strong>${s.rr ?? '—'}</strong></div>
          <div>SL: <strong>${fmtPrice(s.sl)}</strong></div>
          <div>TP: <strong>${fmtPrice(s.tp)}</strong></div>
        </div>
        <div class="reason">${s.reason}</div>
      </article>
    `).join('');
  }

  async function executeScan() {
    if (state.isScanning) return;
    getAudioContext();
    state.isScanning = true;
    el.scanBtn.disabled = true;
    el.scanBtn.classList.add('scanning');
    el.scanBtn.textContent = 'Scanning...';
    el.statusText.classList.add('scanning');
    const signalsPanel = el.signalsList.closest('.panel');
    if (signalsPanel) signalsPanel.classList.add('scanning-active');

    el.statusText.textContent = `Scanning (${state.mode})...`;

    try {
      const result = await SignalScanner.runScan(state.mode, CONFIG, (exId, sym) => {
        el.statusText.textContent = `Checking [${exId}] ${sym}...`;
      });

      state.signals = result.signals;
      el.statScanned.textContent = String(result.totalTickers);
      el.statWatchlist.textContent = String(result.watchlistCount);
      el.statTime.textContent = new Date().toLocaleTimeString();
      el.statusText.textContent = `Scan complete (${result.signals.length} items)`;

      const validSetups = result.signals.filter(s => s.state === 'VALID SETUP');
      let hasNewValidSetup = false;

      validSetups.forEach(v => {
        const alertKey = v.id || `${v.exchange}_${v.symbol}_${v.side}_${v.entry}`;
        if (!state.alertedIds.has(alertKey)) {
          state.alertedIds.add(alertKey);
          hasNewValidSetup = true;
          addLog(`[${v.exchange}] ${v.symbol} ${v.side} VALID SETUP | Entry: ${fmtPrice(v.entry)} | SL: ${fmtPrice(v.sl)} | TP: ${fmtPrice(v.tp)} | RR: ${v.rr}`);
        }
      });

      if (hasNewValidSetup) {
        playAlertSound();
      }

      renderSignals();
    } catch (err) {
      el.statusText.textContent = 'Scan error';
      addLog(`ERROR: ${err.message}`);
    } finally {
      state.isScanning = false;
      el.scanBtn.disabled = false;
      el.scanBtn.classList.remove('scanning');
      el.scanBtn.textContent = 'Scan Now';
      el.statusText.classList.remove('scanning');
      if (signalsPanel) signalsPanel.classList.remove('scanning-active');
    }
  }

  function toggleAutoScan() {
    getAudioContext();
    if (state.autoTimer) {
      clearInterval(state.autoTimer);
      state.autoTimer = null;
      el.autoBtn.textContent = 'Auto: OFF';
      el.autoBtn.classList.remove('active');
      addLog('Auto scan stopped.');
    } else {
      el.autoBtn.textContent = 'Auto: ON';
      el.autoBtn.classList.add('active');
      addLog(`Auto scan enabled (${CONFIG.scanner.autoScanIntervalMs / 1000}s).`);
      executeScan();
      state.autoTimer = setInterval(executeScan, CONFIG.scanner.autoScanIntervalMs);
    }
  }

  el.exchangeMode.value = state.mode;
  syncSoundButton();

  el.exchangeMode.addEventListener('change', () => {
    state.mode = el.exchangeMode.value;
    localStorage.setItem(CONFIG.storageKeys.mode, state.mode);
    addLog(`Exchange mode set to ${state.mode}`);
    executeScan();
  });

  el.stateFilter.addEventListener('change', renderSignals);
  el.scanBtn.addEventListener('click', executeScan);
  el.autoBtn.addEventListener('click', toggleAutoScan);
  if (el.soundBtn) {
    el.soundBtn.addEventListener('click', toggleSound);
  }
  el.clearLogBtn.addEventListener('click', () => {
    state.logs = [];
    state.alertedIds.clear();
    localStorage.removeItem(CONFIG.storageKeys.logs);
    renderLogs();
  });

  renderLogs();
  executeScan();
})();
