import type { Bar } from '@tv/data-types';
import { BacktestSettingsSchema, StrategyConfigSchema } from './types.js';
import type {
  BacktestResult,
  BacktestSettings,
  BacktestStats,
  BacktestTrade,
  EquityPoint,
  StrategyConfig,
} from './types.js';
import { generateSignals } from './strategies.js';

interface OpenPosition {
  side: 'long' | 'short';
  qty: number;
  entryEff: number;
  entryIndex: number;
  entryTime: number;
  entryFee: number;
}

const emptyStats = (initialCapital: number): BacktestStats => ({
  initialCapital,
  finalEquity: initialCapital,
  netProfit: 0,
  netProfitPct: 0,
  buyHoldReturnPct: 0,
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  winRate: 0,
  grossProfit: 0,
  grossLoss: 0,
  profitFactor: null,
  avgTrade: 0,
  avgWin: 0,
  avgLoss: 0,
  largestWin: 0,
  largestLoss: 0,
  maxDrawdown: 0,
  maxDrawdownPct: 0,
  longTrades: 0,
  shortTrades: 0,
  avgBarsHeld: 0,
  exposurePct: 0,
  sharpe: 0,
});

const computeStats = (
  initialCapital: number,
  trades: readonly BacktestTrade[],
  equity: readonly EquityPoint[],
  bars: ReadonlyArray<Bar>,
  barsInPosition: number,
): BacktestStats => {
  const finalEquity = equity.length > 0 ? equity[equity.length - 1]!.equity : initialCapital;
  const netProfit = finalEquity - initialCapital;

  let grossProfit = 0;
  let grossLoss = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  let longTrades = 0;
  let shortTrades = 0;
  let largestWin = 0;
  let largestLoss = 0;
  let barsHeldSum = 0;
  for (const t of trades) {
    if (t.side === 'long') longTrades++;
    else shortTrades++;
    barsHeldSum += t.barsHeld;
    if (t.pnl > 0) {
      winningTrades++;
      grossProfit += t.pnl;
      if (t.pnl > largestWin) largestWin = t.pnl;
    } else if (t.pnl < 0) {
      losingTrades++;
      grossLoss += -t.pnl;
      if (t.pnl < largestLoss) largestLoss = t.pnl;
    }
  }
  const totalTrades = trades.length;

  // Max drawdown over the equity curve.
  let peak = initialCapital;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  for (const point of equity) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak - point.equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
    const ddPct = peak > 0 ? dd / peak : 0;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
  }

  // Per-bar Sharpe of the equity curve.
  const returns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1]!.equity;
    if (prev !== 0) returns.push(equity[i]!.equity / prev - 1);
  }
  let sharpe = 0;
  if (returns.length > 1) {
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    sharpe = std > 0 ? mean / std : 0;
  }

  const firstClose = bars[0]?.close ?? 0;
  const lastClose = bars[bars.length - 1]?.close ?? 0;
  const buyHoldReturnPct = firstClose > 0 ? lastClose / firstClose - 1 : 0;

  return {
    initialCapital,
    finalEquity,
    netProfit,
    netProfitPct: initialCapital > 0 ? netProfit / initialCapital : 0,
    buyHoldReturnPct,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: totalTrades > 0 ? winningTrades / totalTrades : 0,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    avgTrade: totalTrades > 0 ? netProfit / totalTrades : 0,
    avgWin: winningTrades > 0 ? grossProfit / winningTrades : 0,
    avgLoss: losingTrades > 0 ? -grossLoss / losingTrades : 0,
    largestWin,
    largestLoss,
    maxDrawdown,
    maxDrawdownPct,
    longTrades,
    shortTrades,
    avgBarsHeld: totalTrades > 0 ? barsHeldSum / totalTrades : 0,
    exposurePct: bars.length > 0 ? barsInPosition / bars.length : 0,
    sharpe,
  };
};

/**
 * Run a deterministic backtest over a precomputed `signals` array (one desired
 * position in `{-1, 0, 1}` per bar). The signal at bar *i* is acted on at bar
 * *i+1*'s open (no look-ahead). Positions are sized as `positionPct` of current
 * equity; entries and exits pay `feeBps` commission and cross `slippageBps` of
 * slippage. With shorts disabled a bearish signal simply flattens. Pure: a
 * function of the bars, signals, and settings only. The result has no
 * `strategy` attached — {@link runBacktest} adds one for built-in strategies.
 */
export const simulate = (
  bars: ReadonlyArray<Bar>,
  signals: readonly number[],
  settingsInput: Partial<BacktestSettings> = {},
): BacktestResult => {
  const settings = BacktestSettingsSchema.parse(settingsInput);
  const { initialCapital, feeBps, slippageBps, allowShort, positionPct } = settings;
  const feeRate = feeBps / 10_000;
  const slip = slippageBps / 10_000;

  if (bars.length === 0) {
    return {
      settings,
      barCount: 0,
      startTime: 0,
      endTime: 0,
      trades: [],
      equityCurve: [],
      stats: emptyStats(initialCapital),
    };
  }

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let realizedPnl = 0;
  let position: OpenPosition | null = null;
  let barsInPosition = 0;

  const closePosition = (
    pos: OpenPosition,
    exitPriceRaw: number,
    exitIndex: number,
    exitTime: number,
    reason: 'signal' | 'end',
  ): void => {
    const exitEff = pos.side === 'long' ? exitPriceRaw * (1 - slip) : exitPriceRaw * (1 + slip);
    const exitFee = pos.qty * exitEff * feeRate;
    const gross =
      pos.side === 'long'
        ? pos.qty * (exitEff - pos.entryEff)
        : pos.qty * (pos.entryEff - exitEff);
    realizedPnl += gross - exitFee;
    const pnl = gross - pos.entryFee - exitFee;
    trades.push({
      side: pos.side,
      entryIndex: pos.entryIndex,
      entryTime: pos.entryTime,
      entryPrice: pos.entryEff,
      exitIndex,
      exitTime,
      exitPrice: exitEff,
      qty: pos.qty,
      pnl,
      pnlPct: pos.qty * pos.entryEff !== 0 ? pnl / (pos.qty * pos.entryEff) : 0,
      barsHeld: exitIndex - pos.entryIndex,
      exitReason: reason,
    });
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;
    // Desired position is the signal known at the *previous* bar's close.
    let desired: number = i >= 1 ? signals[i - 1] ?? 0 : 0;
    if (desired === -1 && !allowShort) desired = 0;
    const currentSide: number = position ? (position.side === 'long' ? 1 : -1) : 0;

    if (desired !== currentSide) {
      if (position) {
        closePosition(position, bar.open, i, bar.time, 'signal');
        position = null;
      }
      if (desired !== 0) {
        const side: 'long' | 'short' = desired === 1 ? 'long' : 'short';
        const entryEff = side === 'long' ? bar.open * (1 + slip) : bar.open * (1 - slip);
        const equityNow = Math.max(0, initialCapital + realizedPnl);
        const qty = entryEff > 0 ? (equityNow * positionPct) / entryEff : 0;
        if (qty > 0) {
          const entryFee = qty * entryEff * feeRate;
          realizedPnl -= entryFee;
          position = { side, qty, entryEff, entryIndex: i, entryTime: bar.time, entryFee };
        }
      }
    }

    if (position) barsInPosition++;
    const unrealized = position
      ? position.side === 'long'
        ? position.qty * (bar.close - position.entryEff)
        : position.qty * (position.entryEff - bar.close)
      : 0;
    equityCurve.push({ time: bar.time, equity: initialCapital + realizedPnl + unrealized });
  }

  // Force-close any open position at the last bar's close.
  if (position) {
    const last = bars[bars.length - 1]!;
    closePosition(position, last.close, bars.length - 1, last.time, 'end');
    position = null;
    const lastPoint = equityCurve[equityCurve.length - 1]!;
    equityCurve[equityCurve.length - 1] = {
      time: lastPoint.time,
      equity: initialCapital + realizedPnl,
    };
  }

  return {
    settings,
    barCount: bars.length,
    startTime: bars[0]!.time,
    endTime: bars[bars.length - 1]!.time,
    trades,
    equityCurve,
    stats: computeStats(initialCapital, trades, equityCurve, bars, barsInPosition),
  };
};

/**
 * Run a deterministic backtest of a built-in strategy over `bars`: generate the
 * strategy's signals, then {@link simulate}. The result carries the resolved
 * `strategy` config.
 */
export const runBacktest = (
  bars: ReadonlyArray<Bar>,
  strategyInput: StrategyConfig,
  settingsInput: Partial<BacktestSettings> = {},
): BacktestResult => {
  const strategy = StrategyConfigSchema.parse(strategyInput);
  const signals = generateSignals(bars, strategy);
  return { ...simulate(bars, signals, settingsInput), strategy };
};
