const BybitExchange = (() => {
  const BASE_URL = 'https://api.bybit.com';

  const INTERVAL_MAP = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '1h': '60',
    '4h': '240',
    '1d': 'D'
  };

  function intervalToMs(interval) {
    const map = {
      '1m': 60_000,
      '5m': 300_000,
      '15m': 900_000,
      '1h': 3_600_000,
      '4h': 14_400_000,
      '1d': 86_400_000
    };
    return map[interval] || 900_000;
  }

  function normalizeKline(exchange, symbol, interval, row) {
    const openTime = Number(row[0]);
    return {
      exchange,
      symbol,
      interval,
      openTime,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: openTime + intervalToMs(interval) - 1
    };
  }

  async function fetch24hTickers() {
    const res = await fetch(`${BASE_URL}/v5/market/tickers?category=linear`);
    if (!res.ok) throw new Error(`Bybit ticker error: ${res.status}`);
    const json = await res.json();
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

  async function fetchKlines(symbol, interval, limit = 120) {
    const mappedInterval = INTERVAL_MAP[interval] || interval;
    const url = `${BASE_URL}/v5/market/kline?category=linear&symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(mappedInterval)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bybit klines error (${symbol} ${interval}): ${res.status}`);
    const json = await res.json();
    const rows = json?.result?.list || [];

    return rows
      .map(r => normalizeKline('BYBIT', symbol, interval, r))
      .sort((a, b) => a.openTime - b.openTime);
  }

  return {
    id: 'BYBIT',
    label: 'Bybit Futures',
    fetch24hTickers,
    fetchKlines
  };
})();
