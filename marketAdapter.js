const MarketAdapter = (() => {
  const ADAPTERS = {
    BINANCE: BinanceExchange,
    BYBIT: BybitExchange
  };

  function getAdapter(exchangeId) {
    const adapter = ADAPTERS[exchangeId];
    if (!adapter) throw new Error(`Unsupported exchange: ${exchangeId}`);
    return adapter;
  }

  function getActiveExchanges(mode) {
    if (mode === 'BOTH') return ['BINANCE', 'BYBIT'];
    return [mode];
  }

  async function fetchTickersByExchange(exchangeId) {
    return getAdapter(exchangeId).fetch24hTickers();
  }

  async function fetchKlinesWithFallback(exchangeId, symbol, interval, limit = 120) {
    try {
      return await getAdapter(exchangeId).fetchKlines(symbol, interval, limit);
    } catch (err) {
      const fallbackId = exchangeId === 'BINANCE' ? 'BYBIT' : 'BINANCE';
      const fallbackCandles = await getAdapter(fallbackId).fetchKlines(symbol, interval, limit);
      return fallbackCandles.map(c => ({
        ...c,
        exchange: exchangeId,
        fallbackFrom: fallbackId
      }));
    }
  }

  return {
    getAdapter,
    getActiveExchanges,
    fetchTickersByExchange,
    fetchKlinesWithFallback
  };
})();
