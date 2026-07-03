import type { ReactNode } from 'react';

/**
 * The terminal's icon set. One family, one grid (20×20), one stroke weight —
 * hand-drawn so drawing tools read like the thing they draw, not the nearest
 * generic glyph. Anchor dots mark clickable points the way the chart does.
 */

export interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 16, className, sw = 1.3, children }: IconProps & { sw?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const Dot = ({ x, y }: { x: number; y: number }) => (
  <circle cx={x} cy={y} r={1.4} fill="currentColor" stroke="none" />
);

/* ── Cursor + drawing tools ─────────────────────────────────────────────── */

export const IconCursor = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3v4.2M10 12.8V17M3 10h4.2M12.8 10H17" />
    <Dot x={10} y={10} />
  </Svg>
);

export const IconTrendLine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.6 14.6 15.4 5.4" />
    <Dot x={4.2} y={15.2} />
    <Dot x={15.8} y={4.8} />
  </Svg>
);

export const IconRay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.4 14.6 17.5 4.4" />
    <Dot x={5} y={15} />
  </Svg>
);

export const IconExtendedLine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 15.9 17.5 4.1" />
    <Dot x={7.2} y={12.2} />
    <Dot x={12.8} y={7.8} />
  </Svg>
);

export const IconHorizontalLine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 10h15" />
    <Dot x={10} y={10} />
  </Svg>
);

export const IconHorizontalRay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 10h12.5" />
    <Dot x={5} y={10} />
  </Svg>
);

export const IconVerticalLine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.5v15" />
    <Dot x={10} y={10} />
  </Svg>
);

export const IconCrossLine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2.5v15M2.5 10h15" opacity={0.9} />
    <Dot x={10} y={10} />
  </Svg>
);

export const IconArrowTool = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 16 15.4 4.6M15.4 4.6h-4.6M15.4 4.6v4.6" />
  </Svg>
);

export const IconPriceLine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 10h9" />
    <rect x={12} y={7.2} width={5.5} height={5.6} rx={1} />
  </Svg>
);

export const IconParallelChannel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12.6 13.4 4.4M6.6 15.6 17 7.4" />
    <Dot x={3} y={13.2} />
    <Dot x={13.8} y={4} />
  </Svg>
);

export const IconFlatTopBottom = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11.5 17 5.5M3 15.5h14" />
  </Svg>
);

export const IconRegression = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.6 13.4 17.4 7.4" strokeDasharray="2.4 2.2" />
    <path d="M2.6 9.4 17.4 3.4M2.6 17.4 17.4 11.4" />
  </Svg>
);

export const IconPitchfork = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 17.5V7.5M5.5 3v3.8a4.5 4.5 0 0 0 9 0V3M10 7.5V3" />
  </Svg>
);

export const IconFibRetracement = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4.2h14M3 8.2h8.5M3 12.2h11M3 16.2h14" />
  </Svg>
);

export const IconFibExtension = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5h14M3 15h14M3 10h6.5" />
    <path d="M12.5 13.5 17 9" />
    <Dot x={12} y={14} />
  </Svg>
);

export const IconRect = (p: IconProps) => (
  <Svg {...p}>
    <rect x={3.8} y={5.8} width={12.4} height={8.4} />
    <Dot x={3.8} y={5.8} />
    <Dot x={16.2} y={14.2} />
  </Svg>
);

export const IconEllipse = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx={10} cy={10} rx={7.2} ry={5} />
  </Svg>
);

export const IconTriangle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.2 16.8 15.4H3.2Z" />
  </Svg>
);

export const IconText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5.5V4h10v1.5M10 4v12M8 16h4" />
  </Svg>
);

export const IconCallout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 4.5h11a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H9.5L6 17v-3.5H4.5A1.5 1.5 0 0 1 3 12V6a1.5 1.5 0 0 1 1.5-1.5Z" />
  </Svg>
);

export const IconPriceLabel = (p: IconProps) => (
  <Svg {...p}>
    <rect x={4.2} y={4.8} width={11.6} height={6} rx={1.2} />
    <path d="M10 10.8V16" />
    <Dot x={10} y={16.6} />
  </Svg>
);

export const IconPriceRange = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 3.5h9M5.5 16.5h9M10 6v8M10 6 8 8.2M10 6l2 2.2M10 14l-2-2.2M10 14l2-2.2" />
  </Svg>
);

export const IconDateRange = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 5.5v9M16.5 5.5v9M6 10h8M6 10l2.2-2M6 10l2.2 2M14 10l-2.2-2M14 10l-2.2 2" />
  </Svg>
);

export const IconLongPosition = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 16h14M4.5 12.5 10 7l2.5 2.5L17 5M17 5h-4M17 5v4" />
  </Svg>
);

export const IconShortPosition = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h14M4.5 7.5 10 13l2.5-2.5L17 15M17 15h-4M17 15v-4" />
  </Svg>
);

/* ── Drawing meta controls ──────────────────────────────────────────────── */

export const IconMagnet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 4.5v6a4 4 0 0 0 8 0v-6" strokeWidth={2.4} />
    <path d="M4.9 3.5h2.2v4.2H4.9ZM12.9 3.5h2.2v4.2h-2.2Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3h4l.6 5.2 2 1.8H5.4l2-1.8L8 3ZM10 10v6.5" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z" />
    <circle cx={10} cy={10} r={2.2} />
  </Svg>
);

export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4l12 12M8.3 5.4C8.8 5.2 9.4 5 10 5c4.5 0 7.5 5 7.5 5a13.3 13.3 0 0 1-2.1 2.7M12 13.5c-.6.3-1.3.5-2 .5-4.5 0-7.5-5-7.5-5a13 13 0 0 1 2.6-3" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x={5} y={9} width={10} height={7.5} rx={1.5} />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Svg>
);

export const IconUnlock = (p: IconProps) => (
  <Svg {...p}>
    <rect x={5} y={9} width={10} height={7.5} rx={1.5} />
    <path d="M7 9V6.5a3 3 0 0 1 5.8-1" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 5.5h13M8 5.5V4h4v1.5M5.5 5.5l.8 10a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.8-10M8.3 8.5v5M11.7 8.5v5" />
  </Svg>
);

export const IconUndo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7.5 4.5 4 8l3.5 3.5" />
    <path d="M4 8h7.5a4.5 4.5 0 0 1 0 9H8" />
  </Svg>
);

export const IconRedo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12.5 4.5 16 8l-3.5 3.5" />
    <path d="M16 8H8.5a4.5 4.5 0 0 0 0 9H12" />
  </Svg>
);

export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h2L8 4h4l1.5 2h2A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-7Z" />
    <circle cx={10} cy={11} r={3} />
  </Svg>
);

export const IconSliders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h14M3 10h14M3 14h14" opacity={0.85} />
    <circle cx={7.5} cy={6} r={1.7} fill="var(--surface-1, #0f1217)" />
    <circle cx={12.5} cy={10} r={1.7} fill="var(--surface-1, #0f1217)" />
    <circle cx={6} cy={14} r={1.7} fill="var(--surface-1, #0f1217)" />
  </Svg>
);

export const IconIndicator = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 11.5h3L8 5l4 10 2.5-6.5h3" />
  </Svg>
);

/* ── Chart types ────────────────────────────────────────────────────────── */

export const IconCandles = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 2.5V5M6 15v2.5M14 4.5V7M14 13v2.5" />
    <rect x={4.2} y={5} width={3.6} height={10} fill="currentColor" stroke="none" rx={0.6} />
    <rect x={12.2} y={7} width={3.6} height={6} fill="currentColor" stroke="none" rx={0.6} />
  </Svg>
);

export const IconHollowCandles = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 2.5V5M6 15v2.5M14 4.5V7M14 13v2.5" />
    <rect x={4.4} y={5} width={3.2} height={10} rx={0.6} />
    <rect x={12.4} y={7} width={3.2} height={6} rx={0.6} />
  </Svg>
);

export const IconBarsOHLC = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3v14M6 6H3.4M6 12h2.6M14 4v12M14 8h-2.6M14 14h2.6" />
  </Svg>
);

export const IconArea = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 14.5 8 9l3 3 6-7" />
    <path d="M3 14.5 8 9l3 3 6-7V16H3v-1.5Z" fill="currentColor" stroke="none" opacity={0.18} />
  </Svg>
);

/* ── Layout grids ───────────────────────────────────────────────────────── */

const cell = (x: number, y: number, w: number, h: number, key?: string) => (
  <rect key={key} x={x} y={y} width={w} height={h} rx={0.8} />
);

export const IconGrid1 = (p: IconProps) => <Svg {...p}>{cell(3.5, 4.5, 13, 11)}</Svg>;
export const IconGrid2 = (p: IconProps) => (
  <Svg {...p}>
    {cell(3.5, 4.5, 6, 11)}
    {cell(10.5, 4.5, 6, 11)}
  </Svg>
);
export const IconGrid4 = (p: IconProps) => (
  <Svg {...p}>
    {cell(3.5, 4.5, 6, 5)}
    {cell(10.5, 4.5, 6, 5)}
    {cell(3.5, 10.5, 6, 5)}
    {cell(10.5, 10.5, 6, 5)}
  </Svg>
);
export const IconGrid8 = (p: IconProps) => (
  <Svg {...p} sw={1.1}>
    {[0, 1, 2, 3].map((i) => cell(2.5 + i * 3.9, 4.5, 3.1, 5, `t${i}`))}
    {[0, 1, 2, 3].map((i) => cell(2.5 + i * 3.9, 10.5, 3.1, 5, `b${i}`))}
  </Svg>
);
export const IconGrid16 = (p: IconProps) => (
  <Svg {...p} sw={1}>
    {[0, 1, 2, 3].flatMap((r) =>
      [0, 1, 2, 3].map((c) => cell(2.5 + c * 3.9, 2.6 + r * 3.9, 3.1, 3.1, `c${r}-${c}`)),
    )}
  </Svg>
);

/* ── Transport / replay ─────────────────────────────────────────────────── */

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 4.5v11l9-5.5-9-5.5Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.5v11M13 4.5v11" strokeWidth={2.2} />
  </Svg>
);

export const IconStepBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 4.5v11" />
    <path d="M15 4.5v11l-7.5-5.5L15 4.5Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconStepForward = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 4.5v11" />
    <path d="M5 4.5v11l7.5-5.5L5 4.5Z" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconReplay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.2A6.5 6.5 0 1 1 3.6 12" />
    <path d="M4 3.5v4.7h4.7" />
  </Svg>
);

/* ── App chrome ─────────────────────────────────────────────────────────── */

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx={9} cy={9} r={5.5} />
    <path d="m13.2 13.2 3.8 3.8" />
  </Svg>
);

export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3a4.8 4.8 0 0 0-4.8 4.8c0 4-1.7 5.4-1.7 5.4h13s-1.7-1.4-1.7-5.4A4.8 4.8 0 0 0 10 3ZM8.3 16a1.8 1.8 0 0 0 3.4 0" />
  </Svg>
);

export const IconBellPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3a4.8 4.8 0 0 0-4.8 4.8c0 4-1.7 5.4-1.7 5.4h13s-1.7-1.4-1.7-5.4A4.8 4.8 0 0 0 10 3ZM8.3 16a1.8 1.8 0 0 0 3.4 0" />
    <path d="M10 6.2v4M8 8.2h4" />
  </Svg>
);

export const IconCompass = (p: IconProps) => (
  <Svg {...p}>
    <circle cx={10} cy={10} r={7.2} />
    <path d="m13 7-1.8 4.2L7 13l1.8-4.2L13 7Z" />
  </Svg>
);

export const IconWorkspace = (p: IconProps) => (
  <Svg {...p}>
    <rect x={3} y={3.5} width={14} height={13} rx={1.5} />
    <path d="M3 8h14M8.5 8v8.5" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h3M13 6.5l3.5 3.5-3.5 3.5M16.5 10H8" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m7.5 5.5 4.5 4.5-4.5 4.5" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 10.5 4 4L16 6" />
  </Svg>
);

export const IconPanelRight = (p: IconProps) => (
  <Svg {...p}>
    <rect x={3} y={3.5} width={14} height={13} rx={1.5} />
    <path d="M12.5 3.5v13" />
  </Svg>
);

export const IconPanelBottom = (p: IconProps) => (
  <Svg {...p}>
    <rect x={3} y={3.5} width={14} height={13} rx={1.5} />
    <path d="M3 12h14" />
  </Svg>
);

export const IconBookmark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 3.5h9V17L10 13.8 5.5 17V3.5Z" />
  </Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5L9.7 5.3" />
    <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l1.3-1.3" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x={7} y={7} width={9.5} height={9.5} rx={1.5} />
    <path d="M4.5 12.5h-1V4.5A1 1 0 0 1 4.5 3.5H12.5v1" />
  </Svg>
);

export const IconNews = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4.5h12a0 0 0 0 1 0 0V14a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V4.5Z" />
    <path d="M7 8h6M7 11h6M16 7v7a1.5 1.5 0 0 0 1.5-1.5" opacity={0.9} />
  </Svg>
);

export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x={3.5} y={4.5} width={13} height={12} rx={1.5} />
    <path d="M3.5 8.5h13M7 3v3M13 3v3" />
  </Svg>
);

export const IconMail = (p: IconProps) => (
  <Svg {...p}>
    <rect x={3} y={4.5} width={14} height={11} rx={1.5} />
    <path d="m3.5 6 6.5 5 6.5-5" />
  </Svg>
);

export const IconBarChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 16.5v-5M10 16.5V5.5M15.5 16.5V9" strokeWidth={2} />
  </Svg>
);

export const IconLandmark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 16.5h14M4.5 14v-6M8.2 14V8M11.8 14V8M15.5 14V8M3 7.5 10 3l7 4.5H3Z" />
  </Svg>
);

export const IconBolt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 2.5 4.5 11H9l-1 6.5L14.5 9H10l1-6.5Z" />
  </Svg>
);

export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="m10 3 2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7L10 3Z" />
  </Svg>
);
