import type { Bar } from '@tv/data-types';
import type { Interval } from '@tv/core';

export interface StreamKey {
  provider: string;
  ticker: string;
  interval: Interval;
}

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'down' | 'idle';

export type StreamEvent =
  | { kind: 'update'; bar: Bar }
  | { kind: 'close'; bar: Bar }
  | { kind: 'status'; status: StreamStatus; message?: string };

export type StreamEventHandler = (event: StreamEvent) => void;

export interface Stream {
  start(onEvent: StreamEventHandler): void;
  stop(): void;
}
