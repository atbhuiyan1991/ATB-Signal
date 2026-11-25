const BinanceExchange = (() => {
  const BASE_URL = 'https://fapi.binance.com';

  function normalizeKline(exchange, symbol, interval, row) {
    return {
      exchange,
      symbol,
      interval,
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: Number(row[6])
    };
  }

  async function fetch24hTickers() {
    const res = await fetch(`${BASE_URL}/fapi/v1/ticker/24hr`);
    if (!res.ok) throw new Error(`Binance ticker error: ${res.status}`);
    const data = await res.json();

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

  async function fetchKlines(symbol, interval, limit = 120) {
    const url = `${BASE_URL}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance klines error (${symbol} ${interval}): ${res.status}`);
    const rows = await res.json();

    return rows
      .map(r => normalizeKline('BINANCE', symbol, interval, r))
      .sort((a, b) => a.openTime - b.openTime);
  }

  return {
    id: 'BINANCE',
    label: 'Binance Futures',
    fetch24hTickers,
    fetchKlines
  };
})();
