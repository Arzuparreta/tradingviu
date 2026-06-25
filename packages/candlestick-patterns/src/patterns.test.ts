import { describe, expect, test } from 'bun:test';
import type { Bar } from '@tv/data-types';
import {
  doji,
  marubozuBull,
  marubozuBear,
  spinningTop,
  hammer,
  hangingMan,
  invertedHammer,
  shootingStar,
} from './single.js';
import {
  bullishEngulfing,
  bearishEngulfing,
  bullishHarami,
  bearishHarami,
  piercingLine,
  darkCloudCover,
  tweezerBottom,
  tweezerTop,
} from './double.js';
import {
  morningStar,
  eveningStar,
  threeWhiteSoldiers,
  threeBlackCrows,
  threeInsideUp,
  threeInsideDown,
} from './triple.js';
import { allPatterns, findPattern, detectAll, PATTERNS } from './registry.js';

let t = 1_700_000_000;
const b = (open: number, high: number, low: number, close: number): Bar => ({
  time: (t += 60),
  open,
  high,
  low,
  close,
  volume: 0,
});

// Lead-in helpers: three plain bars trending down / up so context patterns fire.
const downLead = (): Bar[] => [
  b(121, 121.5, 119.5, 120),
  b(117, 117.5, 114.5, 115),
  b(112, 112.5, 109.5, 110),
];
const upLead = (): Bar[] => [
  b(99, 100.5, 98.5, 100),
  b(104, 105.5, 103.5, 105),
  b(109, 110.5, 108.5, 110),
];

describe('single-bar patterns', () => {
  test('doji', () => {
    expect(doji([b(100, 101, 99, 100)], 0)).toBe(true);
    expect(doji([b(100, 106, 94, 104)], 0)).toBe(false);
  });

  test('marubozu', () => {
    expect(marubozuBull([b(100, 110, 100, 110)], 0)).toBe(true);
    expect(marubozuBear([b(110, 110, 100, 100)], 0)).toBe(true);
    expect(marubozuBull([b(110, 110, 100, 100)], 0)).toBe(false);
  });

  test('spinning top', () => {
    expect(spinningTop([b(100, 106, 94, 102)], 0)).toBe(true);
    expect(spinningTop([b(100, 110, 100, 110)], 0)).toBe(false); // marubozu, not a top
  });

  test('hammer vs hanging man (same shape, different trend)', () => {
    const shape = b(109, 110.5, 104, 110); // small body up top, long lower shadow
    const downBars = [...downLead(), shape];
    const upBars = [...upLead(), shape];
    expect(hammer(downBars, 3)).toBe(true);
    expect(hangingMan(downBars, 3)).toBe(false);
    expect(hangingMan(upBars, 3)).toBe(true);
    expect(hammer(upBars, 3)).toBe(false);
  });

  test('inverted hammer vs shooting star (same shape, different trend)', () => {
    const shape = b(105, 111, 104.5, 106); // small body at bottom, long upper shadow
    const downBars = [...downLead(), shape];
    const upBars = [...upLead(), shape];
    expect(invertedHammer(downBars, 3)).toBe(true);
    expect(shootingStar(downBars, 3)).toBe(false);
    expect(shootingStar(upBars, 3)).toBe(true);
    expect(invertedHammer(upBars, 3)).toBe(false);
  });
});

describe('two-bar patterns', () => {
  test('bullish / bearish engulfing', () => {
    const bull = [...downLead(), b(110, 110.5, 105.5, 106), b(105, 111.5, 104.5, 111)];
    expect(bullishEngulfing(bull, 4)).toBe(true);
    const bear = [...upLead(), b(110, 115.5, 109.5, 114), b(115, 115.5, 108.5, 109)];
    expect(bearishEngulfing(bear, 4)).toBe(true);
    // engulfing without the trend context does not fire
    const flat = [
      b(100, 101, 99, 100),
      b(100, 101, 99, 100),
      b(100, 101, 99, 100),
      b(110, 110.5, 105.5, 106),
      b(105, 111.5, 104.5, 111),
    ];
    expect(bullishEngulfing(flat, 4)).toBe(false);
  });

  test('bullish / bearish harami', () => {
    const bull = [...downLead(), b(110, 110.5, 99.5, 100), b(102, 108.5, 101.5, 108)];
    expect(bullishHarami(bull, 4)).toBe(true);
    const bear = [...upLead(), b(100, 110.5, 99.5, 110), b(108, 108.5, 101.5, 102)];
    expect(bearishHarami(bear, 4)).toBe(true);
  });

  test('piercing line / dark cloud cover', () => {
    const pierce = [...downLead(), b(110, 110.5, 100.5, 101), b(100, 107.5, 99.5, 107)];
    expect(piercingLine(pierce, 4)).toBe(true);
    const cloud = [...upLead(), b(101, 110.5, 100.5, 110), b(111, 111.5, 103.5, 104)];
    expect(darkCloudCover(cloud, 4)).toBe(true);
  });

  test('tweezer bottom / top (shared extreme)', () => {
    const bottom = [...downLead(), b(110, 110.5, 104, 106), b(106, 109.5, 104, 109)];
    expect(tweezerBottom(bottom, 4)).toBe(true);
    const top = [...upLead(), b(106, 112, 105.5, 110), b(110, 112, 106.5, 107)];
    expect(tweezerTop(top, 4)).toBe(true);
  });
});

describe('three-bar patterns', () => {
  test('morning / evening star', () => {
    const morning = [
      ...downLead(),
      b(110, 110.5, 99.5, 100),
      b(98, 99, 96, 97),
      b(98, 107.5, 97.5, 107),
    ];
    expect(morningStar(morning, 5)).toBe(true);
    const evening = [
      ...upLead(),
      b(100, 110.5, 99.5, 110),
      b(112, 114, 111, 113),
      b(112, 112.5, 102.5, 103),
    ];
    expect(eveningStar(evening, 5)).toBe(true);
  });

  test('three white soldiers / black crows', () => {
    const soldiers = [
      b(100, 100.5, 99, 100),
      b(99, 99.5, 98, 98),
      b(97, 97.5, 96, 96),
      b(96, 102.5, 95.5, 102),
      b(100, 105.5, 99.5, 105),
      b(103, 108.5, 102.5, 108),
    ];
    expect(threeWhiteSoldiers(soldiers, 5)).toBe(true);
    const crows = [
      b(100, 101, 99.5, 100),
      b(101, 102, 100.5, 102),
      b(103, 104, 102.5, 104),
      b(104, 104.5, 97.5, 98),
      b(100, 100.5, 93.5, 94),
      b(96, 96.5, 89.5, 90),
    ];
    expect(threeBlackCrows(crows, 5)).toBe(true);
  });

  test('three inside up / down', () => {
    const up = [
      ...downLead(),
      b(110, 110.5, 99.5, 100),
      b(102, 108.5, 101.5, 108),
      b(107, 112.5, 106.5, 112),
    ];
    expect(threeInsideUp(up, 5)).toBe(true);
    const down = [
      ...upLead(),
      b(100, 110.5, 99.5, 110),
      b(108, 108.5, 101.5, 102),
      b(103, 103.5, 97.5, 98),
    ];
    expect(threeInsideDown(down, 5)).toBe(true);
  });
});

describe('registry', () => {
  test('catalog covers every detector with unique ids', () => {
    const entries = allPatterns();
    expect(entries.length).toBe(PATTERNS.length);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    expect(findPattern('hammer')?.name).toBe('Hammer');
    expect(findPattern('nope')).toBeUndefined();
  });

  test('detectAll finds a hammer in a downtrend and tags it', () => {
    const bars = [...downLead(), b(109, 110.5, 104, 110)];
    const matches = detectAll(bars);
    const hit = matches.find((m) => m.id === 'hammer');
    expect(hit).toBeDefined();
    expect(hit?.index).toBe(3);
    expect(hit?.startIndex).toBe(3);
    expect(hit?.direction).toBe('bullish');
    expect(hit?.time).toBe(bars[3]!.time);
  });

  test('detectAll honors the id filter', () => {
    const bars = [...downLead(), b(109, 110.5, 104, 110)];
    const onlyDoji = detectAll(bars, { ids: ['doji'] });
    expect(onlyDoji.every((m) => m.id === 'doji')).toBe(true);
  });
});
