# SMC Signal Engine (Binance & Bybit Futures)

Multi-exchange Smart Money Concepts signal scanner implementing:
1. High Volume + Liquidity + Volatility Watchlist Filter
2. Previous Day High / Low (`PDH` / `PDL`) Liquidity Sweep
3. Market Structure Shift (`MSS`) with Displacement
4. Order Block (`OB`) Retest & Confirmation
5. Risk/Reward, SL/TP & State Machine (`WATCH`, `WAIT`, `VALID SETUP`, `REJECT`, `EXPIRED`)

Each detected card and log entry explicitly tags the source exchange (`BINANCE` or `BYBIT`).

> Disclaimer: For research, backtesting, and paper trading only. Not financial advice.

