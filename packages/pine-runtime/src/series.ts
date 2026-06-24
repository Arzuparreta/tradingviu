/**
 * Series math over bar-aligned arrays. `null` represents Pine's `na`.
 * Every function returns an array the same length as the input, with leading
 * `null`s while the indicator warms up — matching Pine semantics.
 */

export type Series = (number | null)[];

const isNum = (x: number | null | undefined): x is number => x !== null && x !== undefined && Number.isFinite(x);

/** Simple moving average. */
export const sma = (src: readonly (number | null)[], len: number): Series => {
  const out: Series = new Array(src.length).fill(null);
  if (len <= 0) return out;
  for (let i = 0; i < src.length; i++) {
    if (i < len - 1) continue;
    let sum = 0;
    let ok = true;
    for (let j = i - len + 1; j <= i; j++) {
      const v = src[j];
      if (!isNum(v)) { ok = false; break; }
      sum += v;
    }
    out[i] = ok ? sum / len : null;
  }
  return out;
};

/** Wilder's running moving average (RMA / SMMA). Seeds with the SMA of the first `len`. */
export const rma = (src: readonly (number | null)[], len: number): Series => {
  const out: Series = new Array(src.length).fill(null);
  if (len <= 0) return out;
  const alpha = 1 / len;
  let prev: number | null = null;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (prev === null) {
      // Seed once we have `len` consecutive numeric values ending at i.
      if (i >= len - 1) {
        let sum = 0;
        let ok = true;
        for (let j = i - len + 1; j <= i; j++) {
          const s = src[j];
          if (!isNum(s)) { ok = false; break; }
          sum += s;
        }
        if (ok) { prev = sum / len; out[i] = prev; }
      }
    } else if (isNum(v)) {
      prev = alpha * v + (1 - alpha) * prev;
      out[i] = prev;
    } else {
      out[i] = prev;
    }
  }
  return out;
};

/** Exponential moving average. Seeds with the SMA of the first `len`. */
export const ema = (src: readonly (number | null)[], len: number): Series => {
  const out: Series = new Array(src.length).fill(null);
  if (len <= 0) return out;
  const alpha = 2 / (len + 1);
  let prev: number | null = null;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (prev === null) {
      if (i >= len - 1) {
        let sum = 0;
        let ok = true;
        for (let j = i - len + 1; j <= i; j++) {
          const s = src[j];
          if (!isNum(s)) { ok = false; break; }
          sum += s;
        }
        if (ok) { prev = sum / len; out[i] = prev; }
      }
    } else if (isNum(v)) {
      prev = alpha * v + (1 - alpha) * prev;
      out[i] = prev;
    } else {
      out[i] = prev;
    }
  }
  return out;
};

/** Linearly weighted moving average (most recent bar weighted highest). */
export const wma = (src: readonly (number | null)[], len: number): Series => {
  const out: Series = new Array(src.length).fill(null);
  if (len <= 0) return out;
  const denom = (len * (len + 1)) / 2;
  for (let i = len - 1; i < src.length; i++) {
    let sum = 0;
    let ok = true;
    for (let k = 0; k < len; k++) {
      const v = src[i - len + 1 + k];
      if (!isNum(v)) { ok = false; break; }
      sum += v * (k + 1);
    }
    out[i] = ok ? sum / denom : null;
  }
  return out;
};

/** First difference: src[i] - src[i-1]. */
export const change = (src: readonly (number | null)[]): Series => {
  const out: Series = new Array(src.length).fill(null);
  for (let i = 1; i < src.length; i++) {
    const a = src[i];
    const b = src[i - 1];
    out[i] = isNum(a) && isNum(b) ? a - b : null;
  }
  return out;
};

/** Relative Strength Index (Wilder, via RMA). */
export const rsi = (src: readonly (number | null)[], len: number): Series => {
  const ch = change(src);
  const gain = ch.map((v) => (isNum(v) ? Math.max(v, 0) : null));
  const loss = ch.map((v) => (isNum(v) ? Math.max(-v, 0) : null));
  const avgGain = rma(gain, len);
  const avgLoss = rma(loss, len);
  return avgGain.map((g, i) => {
    const l = avgLoss[i];
    if (!isNum(g) || !isNum(l)) return null;
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  });
};

/** Population standard deviation over a trailing window. */
export const stdev = (src: readonly (number | null)[], len: number): Series => {
  const out: Series = new Array(src.length).fill(null);
  if (len <= 0) return out;
  for (let i = len - 1; i < src.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = i - len + 1; j <= i; j++) {
      const v = src[j];
      if (!isNum(v)) { ok = false; break; }
      sum += v;
    }
    if (!ok) continue;
    const mean = sum / len;
    let varSum = 0;
    for (let j = i - len + 1; j <= i; j++) varSum += (src[j] as number - mean) ** 2;
    out[i] = Math.sqrt(varSum / len);
  }
  return out;
};

/** Highest value over a trailing window. */
export const highest = (src: readonly (number | null)[], len: number): Series => {
  const out: Series = new Array(src.length).fill(null);
  for (let i = len - 1; i < src.length; i++) {
    let max = -Infinity;
    let ok = true;
    for (let j = i - len + 1; j <= i; j++) {
      const v = src[j];
      if (!isNum(v)) { ok = false; break; }
      if (v > max) max = v;
    }
    out[i] = ok ? max : null;
  }
  return out;
};

/** Lowest value over a trailing window. */
export const lowest = (src: readonly (number | null)[], len: number): Series => {
  const out: Series = new Array(src.length).fill(null);
  for (let i = len - 1; i < src.length; i++) {
    let min = Infinity;
    let ok = true;
    for (let j = i - len + 1; j <= i; j++) {
      const v = src[j];
      if (!isNum(v)) { ok = false; break; }
      if (v < min) min = v;
    }
    out[i] = ok ? min : null;
  }
  return out;
};

/** True range, then Average True Range (RMA of TR). */
export const atr = (high: readonly number[], low: readonly number[], close: readonly number[], len: number): Series => {
  const tr: Series = new Array(high.length).fill(null);
  for (let i = 0; i < high.length; i++) {
    const h = high[i]!;
    const l = low[i]!;
    if (i === 0) {
      tr[i] = h - l;
    } else {
      const pc = close[i - 1]!;
      tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
  }
  return rma(tr, len);
};
