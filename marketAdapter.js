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

  async function fetchJsonWithCorsFallback(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (directErr) {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const proxyRes = await fetch(proxyUrl);
      if (!proxyRes.ok) {
        throw new Error(`Direct & Proxy failed (${directErr.message} / ${proxyRes.status})`);
      }
      return await proxyRes.json();
    }
  }

  async function fetchTickersByExchange(exchangeId) {
    if (exchangeId === 'BINANCE') {
      const data = await fetchJsonWithCorsFallback('https://fapi.binance.com/fapi/v1/ticker/24hr');
      return data
        .filter(t => typeof t.symbol === 'string' && t.symbol.endsWith('USDT'))
        .map(t => {
          const lastPrice = Number(t.lastPrice);
          const bidPrice = Number(t.bidPrice) || lastPrice;
          const askPrice = Number(t.askPrice) || lastPrice;
          const spreadPct = bidPrice > 0 ? Math.max(0, (askPrice - bidPrice) / bidPrice) : 0;
          return {
            exchange: 'BINANCE',
            exchangeLabel: 'Binance Futures',
            symbol: t.symbol,
            lastPrice,
            quoteVolume24h: Number(t.quoteVolume),
            priceChangePct24h: Number(t.priceChangePercent),
            spreadPct
          };
        });
    }

    if (exchangeId === 'BYBIT') {
      const json = await fetchJsonWithCorsFallback('https://api.bybit.com/v5/market/tickers?category=linear');
      const list = json?.result?.list || [];
      return list
        .filter(t => typeof t.symbol === 'string' && t.symbol.endsWith('USDT'))
        .map(t => {
          const lastPrice = Number(t.lastPrice);
          const bidPrice = Number(t.bid1Price) || lastPrice;
          const askPrice = Number(t.ask1Price) || lastPrice;
          const spreadPct = bidPrice > 0 ? Math.max(0, (askPrice - bidPrice) / bidPrice) : 0;
          return {
            exchange: 'BYBIT',
            exchangeLabel: 'Bybit Futures',
            symbol: t.symbol,
            lastPrice,
            quoteVolume24h: Number(t.turnover24h),
            priceChangePct24h: Number(t.price24hPcnt) * 100,
            spreadPct
          };
        });
    }

    throw new Error(`Unsupported exchange: ${exchangeId}`);
  }

  async function fetchKlinesByExchange(exchangeId, symbol, interval, limit = 120) {
    if (exchangeId === 'BINANCE') {
      const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
      const rows = await fetchJsonWithCorsFallback(url);
      return rows
        .map(r => ({
          exchange: 'BINANCE',
          symbol,
          interval,
          openTime: Number(r[0]),
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5]),
          closeTime: Number(r[6])
        }))
        .sort((a, b) => a.openTime - b.openTime);
    }

    if (exchangeId === 'BYBIT') {
      const map = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D' };
      const msMap = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
      const mappedInterval = map[interval] || interval;
      const stepMs = msMap[interval] || 900_000;
      const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(mappedInterval)}&limit=${limit}`;
      const json = await fetchJsonWithCorsFallback(url);
      const rows = json?.result?.list || [];
      return rows
        .map(r => {
          const openTime = Number(r[0]);
          return {
            exchange: 'BYBIT',
            symbol,
            interval,
            openTime,
            open: Number(r[1]),
            high: Number(r[2]),
            low: Number(r[3]),
            close: Number(r[4]),
            volume: Number(r[5]),
            closeTime: openTime + stepMs - 1
          };
        })
        .sort((a, b) => a.openTime - b.openTime);
    }

    throw new Error(`Unsupported exchange: ${exchangeId}`);
  }

  async function fetchKlinesWithFallback(exchangeId, symbol, interval, limit = 120) {
    try {
      return await fetchKlinesByExchange(exchangeId, symbol, interval, limit);
    } catch (err) {
      const fallbackId = exchangeId === 'BINANCE' ? 'BYBIT' : 'BINANCE';
      const fallbackCandles = await fetchKlinesByExchange(fallbackId, symbol, interval, limit);
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
