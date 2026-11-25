const SMCAnalysis = (() => {
  function calcATR(candles, period = 14) {
    if (!candles || candles.length < period + 1) return 0;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const curr = candles[i];
      const prev = candles[i - 1];
      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close)
      );
      trs.push(tr);
    }
    const slice = trs.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  function calcAvgBody(candles, period = 20) {
    if (!candles || candles.length === 0) return 0;
    const slice = candles.slice(-period);
    const total = slice.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0);
    return total / slice.length;
  }

  function isDisplacement(candle, avgBody, cfg) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    if (range <= 0 || avgBody <= 0) return false;
    return body >= avgBody * cfg.displacementBodyMult && (body / range) >= cfg.displacementBodyRatio;
  }

  function getPreviousDayLevels(dailyCandles) {
    if (!dailyCandles || dailyCandles.length < 2) return null;
    // Use the most recently closed daily candle
    const prevDay = dailyCandles[dailyCandles.length - 2];
    return {
      pdh: prevDay.high,
      pdl: prevDay.low,
      prevDayClose: prevDay.close
    };
  }

  function detectLiquiditySweep(sweepCandles, pdh, pdl, cfg) {
    if (!sweepCandles || sweepCandles.length < 5) return null;
    const lookback = sweepCandles.slice(-48);

    // Search backwards for most recent valid sweep + reclaim/rejection
    for (let i = lookback.length - 1; i >= 1; i--) {
      const c = lookback[i];

      // LONG: Sell-side sweep below PDL + reclaim above PDL
      const sweepBelowPct = (pdl - c.low) / pdl;
      if (
        c.low < pdl &&
        sweepBelowPct >= cfg.minSweepPct &&
        sweepBelowPct <= cfg.maxSweepPct &&
        c.close > pdl
      ) {
        return {
          side: 'LONG',
          sweepIndexInLookback: i,
          sweepPrice: c.low,
          levelSwept: pdl,
          sweepTime: c.closeTime
        };
      }

      // SHORT: Buy-side sweep above PDH + rejection below PDH
      const sweepAbovePct = (c.high - pdh) / pdh;
      if (
        c.high > pdh &&
        sweepAbovePct >= cfg.minSweepPct &&
        sweepAbovePct <= cfg.maxSweepPct &&
        c.close < pdh
      ) {
        return {
          side: 'SHORT',
          sweepIndexInLookback: i,
          sweepPrice: c.high,
          levelSwept: pdh,
          sweepTime: c.closeTime
        };
      }
    }

    return null;
  }

  function detectMSSAndOB(mssCandles, side, sweepTime, cfg) {
    if (!mssCandles || mssCandles.length < cfg.swingLookback * 2 + 2) {
      return { mss: null, ob: null };
    }

    const avgBody = calcAvgBody(mssCandles, 20);
    const startIdx = Math.max(
      cfg.swingLookback,
      mssCandles.findIndex(c => c.closeTime >= sweepTime)
    );
    const safeStart = startIdx > 0 ? startIdx : cfg.swingLookback;

    for (let i = safeStart; i < mssCandles.length; i++) {
      const c = mssCandles[i];
      const windowSlice = mssCandles.slice(Math.max(0, i - cfg.swingLookback * 2), i);
      if (windowSlice.length < cfg.swingLookback) continue;

      if (side === 'LONG') {
        const recentSwingHigh = Math.max(...windowSlice.map(x => x.high));
        if (c.close > c.open && c.close > recentSwingHigh && isDisplacement(c, avgBody, cfg)) {
          // Last bearish candle prior to displacement
          let obCandle = null;
          for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
            if (mssCandles[j].close < mssCandles[j].open) {
              obCandle = mssCandles[j];
              break;
            }
          }
          if (obCandle) {
            return {
              mss: {
                side: 'LONG',
                breakLevel: recentSwingHigh,
                breakClose: c.close,
                mssIndex: i,
                mssTime: c.closeTime
              },
              ob: {
                side: 'LONG',
                low: obCandle.low,
                high: Math.max(obCandle.open, obCandle.close),
                createdTime: obCandle.closeTime
              }
            };
          }
        }
      }

      if (side === 'SHORT') {
        const recentSwingLow = Math.min(...windowSlice.map(x => x.low));
        if (c.close < c.open && c.close < recentSwingLow && isDisplacement(c, avgBody, cfg)) {
          // Last bullish candle prior to displacement
          let obCandle = null;
          for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
            if (mssCandles[j].close > mssCandles[j].open) {
              obCandle = mssCandles[j];
              break;
            }
          }
          if (obCandle) {
            return {
              mss: {
                side: 'SHORT',
                breakLevel: recentSwingLow,
                breakClose: c.close,
                mssIndex: i,
                mssTime: c.closeTime
              },
              ob: {
                side: 'SHORT',
                low: Math.min(obCandle.open, obCandle.close),
                high: obCandle.high,
                createdTime: obCandle.closeTime
              }
            };
          }
        }
      }
    }

    return { mss: null, ob: null };
  }

  function checkRetestAndConfirmation(confCandles, ob, side) {
    if (!confCandles || confCandles.length < 3 || !ob) {
      return { retested: false, confirmed: false, entryPrice: null };
    }

    const recent = confCandles.slice(-30);
    let retested = false;

    for (let i = 0; i < recent.length - 1; i++) {
      const c = recent[i];
      const next = recent[i + 1];
      const touchesOB = c.low <= ob.high && c.high >= ob.low;

      if (touchesOB) {
        retested = true;
        if (side === 'LONG' && next.close > next.open && next.close > c.high) {
          return { retested: true, confirmed: true, entryPrice: next.close };
        }
        if (side === 'SHORT' && next.close < next.open && next.close < c.low) {
          return { retested: true, confirmed: true, entryPrice: next.close };
        }
      }
    }

    const last = recent[recent.length - 1];
    if (!retested && last.low <= ob.high && last.high >= ob.low) {
      retested = true;
    }

    return { retested, confirmed: false, entryPrice: null };
  }

  function evaluateSymbol({ ticker, dailyCandles, sweepCandles, mssCandles, confCandles, cfg }) {
    const levels = getPreviousDayLevels(dailyCandles);
    const atr = calcATR(mssCandles, 14);
    const currentPrice = ticker.lastPrice;

    const baseResult = {
      id: `${ticker.exchange}_${ticker.symbol}_PENDING`,
      exchange: ticker.exchange,
      exchangeLabel: ticker.exchangeLabel,
      symbol: ticker.symbol,
      side: 'NEUTRAL',
      state: 'WATCH',
      entry: null,
      sl: null,
      tp: null,
      rr: null,
      pdh: levels ? levels.pdh : null,
      pdl: levels ? levels.pdl : null,
      reason: 'Watching for PDH/PDL liquidity sweep',
      updatedAt: new Date().toISOString()
    };

    if (!levels || !currentPrice) {
      return { ...baseResult, state: 'REJECT', reason: 'Insufficient candle or price data' };
    }

    const sweep = detectLiquiditySweep(sweepCandles, levels.pdh, levels.pdl, cfg.smc);
    if (!sweep) {
      return {
        ...baseResult,
        id: `${ticker.exchange}_${ticker.symbol}_${levels.pdh}_${levels.pdl}_WATCH`,
        state: 'WATCH',
        reason: `No valid PDH (${levels.pdh}) / PDL (${levels.pdl}) sweep yet`
      };
    }

    const candlesSinceSweep = sweepCandles.filter(c => c.closeTime >= sweep.sweepTime).length;
    if (candlesSinceSweep > cfg.smc.maxWaitCandlesAfterSweep) {
      return {
        ...baseResult,
        id: `${ticker.exchange}_${ticker.symbol}_${sweep.side}_${sweep.sweepTime}_EXPIRED`,
        side: sweep.side,
        state: 'EXPIRED',
        reason: `${sweep.side} sweep expired after ${candlesSinceSweep} candles without setup`
      };
    }

    const { mss, ob } = detectMSSAndOB(mssCandles, sweep.side, sweep.sweepTime, cfg.smc);
    if (!mss || !ob) {
      return {
        ...baseResult,
        id: `${ticker.exchange}_${ticker.symbol}_${sweep.side}_${sweep.sweepTime}_WAIT_MSS`,
        side: sweep.side,
        state: 'WAIT',
        reason: `${sweep.side} sweep detected — waiting for MSS & valid OB`
      };
    }

    const candlesSinceMss = mssCandles.filter(c => c.closeTime >= mss.mssTime).length;
    if (candlesSinceMss > cfg.smc.maxWaitCandlesAfterMss) {
      return {
        ...baseResult,
        id: `${ticker.exchange}_${ticker.symbol}_${sweep.side}_${mss.mssTime}_EXPIRED`,
        side: sweep.side,
        state: 'EXPIRED',
        reason: `Setup expired waiting for ${sweep.side} OB retest`
      };
    }

    const ret = checkRetestAndConfirmation(confCandles, ob, sweep.side);
    if (!ret.retested) {
      return {
        ...baseResult,
        id: `${ticker.exchange}_${ticker.symbol}_${sweep.side}_${mss.mssTime}_WAIT_RETEST`,
        side: sweep.side,
        state: 'WAIT',
        reason: `MSS & OB ready [${ob.low.toFixed(4)} - ${ob.high.toFixed(4)}] — waiting for OB retest`
      };
    }

    if (!ret.confirmed) {
      return {
        ...baseResult,
        id: `${ticker.exchange}_${ticker.symbol}_${sweep.side}_${mss.mssTime}_WAIT_CONF`,
        side: sweep.side,
        state: 'WAIT',
        reason: `OB retested — waiting for confirmation candle`
      };
    }

    const buffer = atr > 0 ? atr * cfg.smc.slBufferAtrMult : currentPrice * 0.002;
    let entry = ret.entryPrice;
    let sl = null;
    let tp = null;

    if (sweep.side === 'LONG') {
      sl = Math.min(ob.low, sweep.sweepPrice) - buffer;
      tp = levels.pdh > entry ? levels.pdh : entry + (entry - sl) * cfg.smc.minRiskReward;
    } else {
      sl = Math.max(ob.high, sweep.sweepPrice) + buffer;
      tp = levels.pdl < entry ? levels.pdl : entry - (sl - entry) * cfg.smc.minRiskReward;
    }

    const risk = Math.abs(entry - sl);
    const reward = Math.abs(tp - entry);
    const riskPct = entry > 0 ? risk / entry : 1;
    const rr = risk > 0 ? reward / risk : 0;

    const signalId = `${ticker.exchange}_${ticker.symbol}_${sweep.side}_${mss.mssTime}`;

    if (riskPct > cfg.smc.maxRiskPct) {
      return {
        ...baseResult,
        id: `${signalId}_REJECT_SL`,
        side: sweep.side,
        state: 'REJECT',
        entry,
        sl,
        tp,
        rr: Number(rr.toFixed(2)),
        reason: `Rejected: SL distance (${(riskPct * 100).toFixed(2)}%) exceeds max allowed`
      };
    }

    if (rr < cfg.smc.minRiskReward) {
      return {
        ...baseResult,
        id: `${signalId}_REJECT_RR`,
        side: sweep.side,
        state: 'REJECT',
        entry,
        sl,
        tp,
        rr: Number(rr.toFixed(2)),
        reason: `Rejected: R:R (${rr.toFixed(2)}) below minimum (${cfg.smc.minRiskReward})`
      };
    }

    return {
      id: signalId,
      exchange: ticker.exchange,
      exchangeLabel: ticker.exchangeLabel,
      symbol: ticker.symbol,
      side: sweep.side,
      state: 'VALID SETUP',
      entry,
      sl,
      tp,
      rr: Number(rr.toFixed(2)),
      pdh: levels.pdh,
      pdl: levels.pdl,
      reason: `Sweep + MSS + OB Retest confirmed on ${ticker.exchangeLabel}`,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    calcATR,
    evaluateSymbol
  };
})();
