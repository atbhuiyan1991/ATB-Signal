const SignalScanner = (() => {
  function passesScannerFilters(ticker, cfg) {
    if (!ticker || ticker.lastPrice <= 0) return false;
    if (ticker.quoteVolume24h < cfg.scanner.minQuoteVolume24h) return false;
    if (ticker.spreadPct > cfg.scanner.maxSpreadPct) return false;
    if (Math.abs(ticker.priceChangePct24h) > cfg.scanner.max24hPumpPct) return false;
    return true;
  }

  async function runPool(items, concurrency, worker) {
    const results = [];
    let index = 0;

    async function next() {
      if (index >= items.length) return;
      const item = items[index++];
      const res = await worker(item);
      results.push(res);
      await next();
    }

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, next);
    await Promise.all(runners);
    return results;
  }

  async function scanExchange(exchangeId, cfg, onProgress) {
    const tickers = await MarketAdapter.fetchTickersByExchange(exchangeId);
    const filtered = tickers
      .filter(t => passesScannerFilters(t, cfg))
      .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
      .slice(0, cfg.scanner.maxWatchlistPerExchange);

    const results = await runPool(filtered, cfg.scanner.concurrency, async (ticker) => {
      try {
        const [dailyCandles, sweepCandles, mssCandles, confCandles] = await Promise.all([
          MarketAdapter.fetchKlinesWithFallback(exchangeId, ticker.symbol, cfg.timeframes.daily, 5),
          MarketAdapter.fetchKlinesWithFallback(exchangeId, ticker.symbol, cfg.timeframes.sweep, 80),
          MarketAdapter.fetchKlinesWithFallback(exchangeId, ticker.symbol, cfg.timeframes.mss, 80),
          MarketAdapter.fetchKlinesWithFallback(exchangeId, ticker.symbol, cfg.timeframes.confirmation, 60)
        ]);

        const atr = SMCAnalysis.calcATR(mssCandles, 14);
        const atrPct = ticker.lastPrice > 0 ? atr / ticker.lastPrice : 0;

        if (atrPct < cfg.scanner.minAtrPct || atrPct > cfg.scanner.maxAtrPct) {
          return {
            id: `${exchangeId}_${ticker.symbol}_ATR_FILTER`,
            exchange: ticker.exchange,
            exchangeLabel: ticker.exchangeLabel,
            symbol: ticker.symbol,
            side: 'NEUTRAL',
            state: 'WATCH',
            entry: null,
            sl: null,
            tp: null,
            rr: null,
            reason: `Filtered by ATR% (${(atrPct * 100).toFixed(2)}%)`,
            updatedAt: new Date().toISOString()
          };
        }

        return SMCAnalysis.evaluateSymbol({
          ticker,
          dailyCandles,
          sweepCandles,
          mssCandles,
          confCandles,
          cfg
        });
      } catch (err) {
        return {
          id: `${exchangeId}_${ticker.symbol}_ERR`,
          exchange: exchangeId,
          exchangeLabel: exchangeId === 'BINANCE' ? 'Binance Futures' : 'Bybit Futures',
          symbol: ticker.symbol,
          side: 'NEUTRAL',
          state: 'WATCH',
          entry: null,
          sl: null,
          tp: null,
          rr: null,
          reason: `Fetch error: ${err.message}`,
          updatedAt: new Date().toISOString()
        };
      } finally {
        if (typeof onProgress === 'function') onProgress(exchangeId, ticker.symbol);
      }
    });

    return {
      totalTickers: tickers.length,
      watchlistCount: filtered.length,
      signals: results
    };
  }

  async function runScan(mode, cfg, onProgress) {
    const activeExchanges = MarketAdapter.getActiveExchanges(mode);
    let totalTickers = 0;
    let watchlistCount = 0;
    const allSignals = [];

    for (const exId of activeExchanges) {
      const part = await scanExchange(exId, cfg, onProgress);
      totalTickers += part.totalTickers;
      watchlistCount += part.watchlistCount;
      allSignals.push(...part.signals);
    }

    const order = { 'VALID SETUP': 1, WAIT: 2, WATCH: 3, REJECT: 4, EXPIRED: 5 };
    allSignals.sort((a, b) => (order[a.state] || 99) - (order[b.state] || 99));

    return {
      totalTickers,
      watchlistCount,
      signals: allSignals
    };
  }

  return {
    runScan
  };
})();
