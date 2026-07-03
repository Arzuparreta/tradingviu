/**
 * Curated indicator catalog over klinecharts built-ins. `pane: 'main'` renders
 * stacked on the price pane; `pane: 'sub'` gets its own pane below.
 * The persisted layout stores plain ids (Panel.indicators).
 */

export interface IndicatorDef {
  id: string;
  label: string;
  pane: 'main' | 'sub';
}

export const INDICATORS: IndicatorDef[] = [
  { id: 'MA', label: 'Moving Average', pane: 'main' },
  { id: 'EMA', label: 'Exponential MA', pane: 'main' },
  { id: 'SMA', label: 'Smoothed MA', pane: 'main' },
  { id: 'BOLL', label: 'Bollinger Bands', pane: 'main' },
  { id: 'SAR', label: 'Parabolic SAR', pane: 'main' },
  { id: 'BBI', label: 'Bull/Bear Index', pane: 'main' },
  { id: 'VOL', label: 'Volume', pane: 'sub' },
  { id: 'MACD', label: 'MACD', pane: 'sub' },
  { id: 'RSI', label: 'RSI', pane: 'sub' },
  { id: 'KDJ', label: 'Stochastic (KDJ)', pane: 'sub' },
  { id: 'WR', label: 'Williams %R', pane: 'sub' },
  { id: 'CCI', label: 'CCI', pane: 'sub' },
  { id: 'DMI', label: 'DMI / ADX', pane: 'sub' },
  { id: 'OBV', label: 'On-Balance Volume', pane: 'sub' },
  { id: 'ROC', label: 'Rate of Change', pane: 'sub' },
  { id: 'MTM', label: 'Momentum', pane: 'sub' },
  { id: 'TRIX', label: 'TRIX', pane: 'sub' },
  { id: 'AO', label: 'Awesome Oscillator', pane: 'sub' },
  { id: 'PSY', label: 'Psychological Line', pane: 'sub' },
];

export const INDICATOR_MAP: Record<string, IndicatorDef> = Object.fromEntries(
  INDICATORS.map((d) => [d.id, d]),
);

export const MAIN_INDICATORS = INDICATORS.filter((d) => d.pane === 'main');
export const SUB_INDICATORS = INDICATORS.filter((d) => d.pane === 'sub');
