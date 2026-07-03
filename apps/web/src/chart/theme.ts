import type { DeepPartial, Styles } from 'klinecharts';
import type { ChartType } from '@tv/layout-sync';

/**
 * Data-ink chart theme. Everything visual on the chart derives from the same
 * CSS tokens the rest of the terminal uses, so the chart reads as part of the
 * product instead of a themed third-party widget.
 */

const FALLBACK_TOKENS: Record<string, string> = {
  '--surface-0': '#0a0b0d',
  '--surface-1': '#0f1217',
  '--surface-3': '#1e232c',
  '--border': '#1d212a',
  '--text': '#ccd0d8',
  '--text-muted': '#848b97',
  '--text-faint': '#59606c',
  '--text-bright': '#f3f5f9',
  '--accent': '#2e6cff',
  '--up': '#2dbd96',
  '--down': '#f0616d',
  '--warn': '#f5b53d',
};

export const token = (name: string): string => {
  if (typeof window !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  }
  return FALLBACK_TOKENS[name] ?? '#888888';
};

/** #rrggbb + alpha (0..1) → rgba() string (tokens are plain hex). */
export const alpha = (hex: string, a: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const MONO_FONT = "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace";

/* ── Chart settings (global preferences, persisted locally) ─────────────── */

export type AxisScale = 'normal' | 'percentage' | 'log';

export interface ChartSettings {
  axis: AxisScale;
  grid: boolean;
  lastPriceLine: boolean;
  highLowMarks: boolean;
  crosshairMagnet: 'off' | 'weak' | 'strong';
  /** Keep the active drawing tool armed after finishing a drawing. */
  stayInDrawingMode: boolean;
}

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  axis: 'normal',
  grid: true,
  lastPriceLine: true,
  highLowMarks: true,
  crosshairMagnet: 'off',
  stayInDrawingMode: false,
};

const SETTINGS_KEY = 'tv_chart_settings';

export const loadChartSettings = (): ChartSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_CHART_SETTINGS;
    return { ...DEFAULT_CHART_SETTINGS, ...(JSON.parse(raw) as Partial<ChartSettings>) };
  } catch {
    return DEFAULT_CHART_SETTINGS;
  }
};

export const saveChartSettings = (settings: ChartSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
};

/* ── Styles ─────────────────────────────────────────────────────────────── */

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  candle_solid: 'Candles',
  candle_stroke: 'Hollow candles',
  ohlc: 'Bars',
  area: 'Area',
};

export function buildChartStyles(chartType: ChartType, settings: ChartSettings): DeepPartial<Styles> {
  const up = token('--up');
  const down = token('--down');
  const accent = token('--accent');
  const text = token('--text');
  const textMuted = token('--text-muted');
  const textFaint = token('--text-faint');
  const textBright = token('--text-bright');
  const surface3 = token('--surface-3');
  const hairline = alpha('#aab4c8', 0.07);

  return {
    grid: {
      show: settings.grid,
      horizontal: { color: hairline, size: 1, style: 'dashed' as never, dashedValue: [1, 4] },
      vertical: { color: hairline, size: 1, style: 'dashed' as never, dashedValue: [1, 4] },
    },
    candle: {
      type: chartType as never,
      bar: {
        upColor: up,
        downColor: down,
        noChangeColor: textFaint,
        upBorderColor: up,
        downBorderColor: down,
        noChangeBorderColor: textFaint,
        upWickColor: up,
        downWickColor: down,
        noChangeWickColor: textFaint,
      },
      area: {
        lineSize: 1.5,
        lineColor: accent,
        value: 'close',
        backgroundColor: [
          { offset: 0, color: alpha(token('--accent'), 0.0) },
          { offset: 1, color: alpha(token('--accent'), 0.12) },
        ],
      },
      priceMark: {
        show: true,
        high: { show: settings.highLowMarks, color: textMuted, textSize: 10, textFamily: MONO_FONT },
        low: { show: settings.highLowMarks, color: textMuted, textSize: 10, textFamily: MONO_FONT },
        last: {
          show: settings.lastPriceLine,
          upColor: up,
          downColor: down,
          noChangeColor: textFaint,
          line: { show: settings.lastPriceLine, style: 'dashed' as never, size: 1, dashedValue: [3, 3] },
          text: {
            show: settings.lastPriceLine,
            style: 'fill' as never,
            size: 11,
            paddingLeft: 5,
            paddingTop: 3,
            paddingRight: 5,
            paddingBottom: 3,
            borderRadius: 2,
            color: '#ffffff',
            family: MONO_FONT,
            weight: 'normal',
          },
        },
      },
      tooltip: {
        showRule: 'always' as never,
        showType: 'standard' as never,
        custom: [
          { title: 'open', value: '{open}' },
          { title: 'high', value: '{high}' },
          { title: 'low', value: '{low}' },
          { title: 'close', value: '{close}' },
          { title: 'volume', value: '{volume}' },
        ],
        defaultValue: '—',
        text: { size: 11, family: MONO_FONT, color: textMuted, marginLeft: 10, marginTop: 6, marginRight: 6 },
      },
    },
    indicator: {
      ohlc: { upColor: alpha(up, 0.7), downColor: alpha(down, 0.7), noChangeColor: textFaint },
      bars: [{ style: 'fill' as never, borderStyle: 'solid' as never, borderSize: 1, borderDashedValue: [2, 2], upColor: alpha(up, 0.45), downColor: alpha(down, 0.45), noChangeColor: alpha(token('--text-faint'), 0.45) }],
      lines: [
        { style: 'solid' as never, smooth: false, size: 1, dashedValue: [2, 2], color: '#e8b64c' },
        { style: 'solid' as never, smooth: false, size: 1, dashedValue: [2, 2], color: '#5aa7f0' },
        { style: 'solid' as never, smooth: false, size: 1, dashedValue: [2, 2], color: '#c77ff0' },
        { style: 'solid' as never, smooth: false, size: 1, dashedValue: [2, 2], color: '#4cc9b8' },
        { style: 'solid' as never, smooth: false, size: 1, dashedValue: [2, 2], color: '#f06e9c' },
      ],
      circles: [{ style: 'fill' as never, borderStyle: 'solid' as never, borderSize: 1, borderDashedValue: [2, 2], upColor: alpha(up, 0.6), downColor: alpha(down, 0.6), noChangeColor: textFaint }],
      lastValueMark: { show: false },
      tooltip: {
        showRule: 'always' as never,
        showType: 'standard' as never,
        showName: true,
        showParams: true,
        defaultValue: '—',
        text: { size: 11, family: MONO_FONT, color: textMuted, marginLeft: 10, marginTop: 4, marginRight: 6 },
      },
    },
    xAxis: {
      show: true,
      size: 'auto',
      axisLine: { show: true, color: token('--border'), size: 1 },
      tickLine: { show: false, size: 1, length: 3, color: token('--border') },
      tickText: { show: true, color: textFaint, family: MONO_FONT, weight: 'normal', size: 10, marginStart: 6, marginEnd: 4 },
    },
    yAxis: {
      show: true,
      size: 'auto',
      type: settings.axis as never,
      position: 'right' as never,
      inside: false,
      reverse: false,
      axisLine: { show: true, color: token('--border'), size: 1 },
      tickLine: { show: false, size: 1, length: 3, color: token('--border') },
      tickText: { show: true, color: textFaint, family: MONO_FONT, weight: 'normal', size: 10, marginStart: 4, marginEnd: 6 },
    },
    separator: { size: 1, color: token('--border'), fill: true, activeBackgroundColor: alpha(token('--accent'), 0.12) },
    crosshair: {
      show: true,
      horizontal: {
        show: true,
        line: { show: true, style: 'dashed' as never, dashedValue: [3, 3], size: 1, color: alpha('#aab4c8', 0.45) },
        text: {
          show: true,
          style: 'fill' as never,
          color: textBright,
          size: 11,
          family: MONO_FONT,
          weight: 'normal',
          borderStyle: 'solid' as never,
          borderDashedValue: [2, 2],
          borderSize: 1,
          borderColor: token('--border-strong'),
          borderRadius: 2,
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 3,
          paddingBottom: 3,
          backgroundColor: surface3,
        },
      },
      vertical: {
        show: true,
        line: { show: true, style: 'dashed' as never, dashedValue: [3, 3], size: 1, color: alpha('#aab4c8', 0.45) },
        text: {
          show: true,
          style: 'fill' as never,
          color: textBright,
          size: 11,
          family: MONO_FONT,
          weight: 'normal',
          borderStyle: 'solid' as never,
          borderDashedValue: [2, 2],
          borderSize: 1,
          borderColor: token('--border-strong'),
          borderRadius: 2,
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 3,
          paddingBottom: 3,
          backgroundColor: surface3,
        },
      },
    },
    overlay: {
      point: {
        color: accent,
        borderColor: alpha(token('--accent'), 0.35),
        borderSize: 1,
        radius: 4,
        activeColor: accent,
        activeBorderColor: alpha(token('--accent'), 0.35),
        activeBorderSize: 2,
        activeRadius: 5,
      },
      line: { style: 'solid' as never, smooth: false, color: accent, size: 1, dashedValue: [2, 2] },
      rect: {
        style: 'fill' as never,
        color: alpha(token('--accent'), 0.12),
        borderColor: accent,
        borderSize: 1,
        borderRadius: 0,
        borderStyle: 'solid' as never,
        borderDashedValue: [2, 2],
      },
      polygon: { style: 'fill' as never, color: alpha(token('--accent'), 0.12), borderColor: accent, borderSize: 1, borderStyle: 'solid' as never, borderDashedValue: [2, 2] },
      circle: { style: 'stroke' as never, color: alpha(token('--accent'), 0.12), borderColor: accent, borderSize: 1, borderStyle: 'solid' as never, borderDashedValue: [2, 2] },
      arc: { style: 'solid' as never, color: accent, size: 1, dashedValue: [2, 2] },
      text: {
        style: 'fill' as never,
        color: text,
        size: 12,
        family: MONO_FONT,
        weight: 'normal',
        borderStyle: 'solid' as never,
        borderDashedValue: [2, 2],
        borderSize: 0,
        borderRadius: 2,
        borderColor: accent,
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: 'transparent',
      },
    },
  };
}

/* ── Precision ──────────────────────────────────────────────────────────── */

const decimalsOf = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const s = String(value);
  const i = s.indexOf('.');
  return i === -1 ? 0 : Math.min(s.length - i - 1, 8);
};

/**
 * Infer display precision from the data itself — symbols carry no tick size,
 * and hardcoding 2 decimals butchers sub-dollar assets.
 */
export function inferPrecision(closes: readonly number[]): number {
  let max = 0;
  const n = Math.min(closes.length, 60);
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = decimalsOf(closes[i]!);
    if (d > max) max = d;
  }
  if (max > 0) return Math.min(max, 8);
  return 2;
}
