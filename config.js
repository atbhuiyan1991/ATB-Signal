const CONFIG = {
  exchanges: {
    defaultMode: 'BOTH', // 'BOTH' | 'BINANCE' | 'BYBIT'
    primaryExchange: 'BINANCE'
  },
  timeframes: {
    daily: '1d',
    sweep: '15m',
    mss: '5m',
    ob: '5m',
    confirmation: '1m'
  },
  scanner: {
    maxWatchlistPerExchange: 15,
    minQuoteVolume24h: 25_000_000, // 25M USDT
    maxSpreadPct: 0.0015,         // 0.15%
    max24hPumpPct: 45,            // Filter extreme parabolic pumps
    minAtrPct: 0.004,             // 0.4%
    maxAtrPct: 0.12,              // 12%
    btcConflictFilter: true,
    concurrency: 5,
    autoScanIntervalMs: 60_000
  },
  smc: {
    minSweepPct: 0.0005,          // 0.05% minimum beyond PDH/PDL
    maxSweepPct: 0.03,            // 3.0% maximum wick sweep
    swingLookback: 4,
    displacementBodyMult: 1.4,
    displacementBodyRatio: 0.55,
    maxWaitCandlesAfterSweep: 36,
    maxWaitCandlesAfterMss: 24,
    slBufferAtrMult: 0.25,
    minRiskReward: 1.8,
    maxRiskPct: 0.035             // Reject if SL distance > 3.5%
  },
  storageKeys: {
    logs: 'smc_engine_logs_v1',
    mode: 'smc_engine_mode_v1'
  }
};
