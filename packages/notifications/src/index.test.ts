import { describe, expect, test } from 'bun:test';
import {
  buildAlertWebhookPayload,
  renderAlertTitle,
  renderAlertEmail,
  buildRfc822,
  deliverEmail,
  deliverWebhook,
  isPublicWebhookUrl,
  type AlertNotificationInput,
  type EmailTransport,
  type FetchLike,
} from './index.js';

const input = (): AlertNotificationInput => ({
  alertId: 'al_1',
  alertName: 'BTC breakout',
  symbol: 'BINANCE:BTCUSDT',
  price: 65000,
  fired: true,
  value: 65000,
  reason: 'price above 64000',
  firedAt: new Date('2026-06-26T12:00:00.000Z'),
});

describe('buildAlertWebhookPayload', () => {
  test('produces a stable, serializable payload', () => {
    expect(buildAlertWebhookPayload(input())).toEqual({
      type: 'alert.fired',
      alertId: 'al_1',
      name: 'BTC breakout',
      symbol: 'BINANCE:BTCUSDT',
      price: 65000,
      value: 65000,
      reason: 'price above 64000',
      firedAt: '2026-06-26T12:00:00.000Z',
    });
  });
});

describe('renderAlertTitle', () => {
  test('is a one-line human summary', () => {
    expect(renderAlertTitle(input())).toBe(
      'BTC breakout: BINANCE:BTCUSDT @ 65000 — price above 64000',
    );
  });
});

describe('renderAlertEmail', () => {
  test('subject is the title and body carries the details', () => {
    const e = renderAlertEmail(input());
    expect(e.subject).toBe(renderAlertTitle(input()));
    expect(e.text).toContain('BINANCE:BTCUSDT');
    expect(e.text).toContain('price above 64000');
    expect(e.text).toContain('2026-06-26T12:00:00.000Z');
  });
});

describe('buildRfc822', () => {
  test('emits CRLF headers + blank line + body', () => {
    const raw = buildRfc822('alerts@tv.local', { to: 'u@x.com', subject: 'Hi', text: 'line1\nline2' });
    expect(raw).toContain('From: alerts@tv.local\r\n');
    expect(raw).toContain('To: u@x.com\r\n');
    expect(raw).toContain('Subject: Hi\r\n');
    expect(raw).toContain('\r\n\r\nline1\r\nline2');
  });
  test('dot-stuffs lines beginning with a period', () => {
    const raw = buildRfc822('a@b', { to: 'c@d', subject: 's', text: '.hidden\nok\n.again' });
    expect(raw).toContain('\r\n..hidden\r\nok\r\n..again');
  });
});

describe('deliverEmail', () => {
  test('returns the transport result and never throws', async () => {
    const ok: EmailTransport = async () => true;
    const bad: EmailTransport = async () => {
      throw new Error('smtp down');
    };
    expect(await deliverEmail({ to: 'a@b', subject: 's', text: 't' }, ok)).toBe(true);
    expect(await deliverEmail({ to: 'a@b', subject: 's', text: 't' }, bad)).toBe(false);
  });
});

describe('isPublicWebhookUrl (SSRF guard)', () => {
  test('accepts public http(s) URLs', () => {
    expect(isPublicWebhookUrl('https://hooks.example.com/x')).toBe(true);
    expect(isPublicWebhookUrl('http://203.0.113.5/x')).toBe(true);
  });
  test('rejects loopback, private, link-local and non-http', () => {
    for (const u of [
      'http://localhost/x',
      'http://127.0.0.1/x',
      'http://10.0.0.1/x',
      'http://192.168.1.1/x',
      'http://172.16.0.1/x',
      'http://169.254.169.254/latest/meta-data', // cloud metadata
      'http://[::1]/x',
      'ftp://example.com/x',
      'not a url',
    ]) {
      expect(isPublicWebhookUrl(u)).toBe(false);
    }
  });
});

describe('deliverWebhook', () => {
  test('refuses an unsafe (private) URL without calling fetch', async () => {
    let called = false;
    const fetchImpl: FetchLike = async () => {
      called = true;
      return { ok: true, status: 200 };
    };
    const ok = await deliverWebhook('http://127.0.0.1/x', buildAlertWebhookPayload(input()), fetchImpl);
    expect(ok).toBe(false);
    expect(called).toBe(false);
  });

  test('returns true on a 2xx and posts JSON with the right headers', async () => {
    let captured: { url: string; body: string; method: string } | null = null;
    const fetchImpl: FetchLike = async (url, init) => {
      captured = { url, body: init.body, method: init.method };
      return { ok: true, status: 200 };
    };
    const ok = await deliverWebhook('https://hook.test/x', buildAlertWebhookPayload(input()), fetchImpl);
    expect(ok).toBe(true);
    expect(captured!.method).toBe('POST');
    expect(captured!.url).toBe('https://hook.test/x');
    expect(JSON.parse(captured!.body).type).toBe('alert.fired');
  });

  test('returns false on a non-2xx', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 500 });
    expect(await deliverWebhook('https://hook.test/x', buildAlertWebhookPayload(input()), fetchImpl)).toBe(
      false,
    );
  });

  test('never throws — a transport error resolves to false', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('network down');
    };
    expect(await deliverWebhook('https://hook.test/x', buildAlertWebhookPayload(input()), fetchImpl)).toBe(
      false,
    );
  });
});
