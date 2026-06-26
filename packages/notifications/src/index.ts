/**
 * Notification rendering + delivery. The payload/title builders are pure and
 * unit-tested; the transports are thin wrappers (injectable `fetch`) so the
 * dispatch logic can be tested without any network.
 */

/** The alert context a notification is built from. */
export interface AlertNotificationInput {
  readonly alertId: string;
  readonly alertName: string;
  readonly symbol: string;
  readonly price: number;
  /** The evaluator's verdict (`value`, `reason`, …). */
  readonly fired: boolean;
  readonly value: number;
  readonly reason: string;
  readonly firedAt: Date;
}

/** The JSON body POSTed to an alert's outbound webhook. */
export interface AlertWebhookPayload {
  readonly type: 'alert.fired';
  readonly alertId: string;
  readonly name: string;
  readonly symbol: string;
  readonly price: number;
  readonly value: number;
  readonly reason: string;
  readonly firedAt: string;
}

/** Build the outbound webhook JSON for a fired alert. Pure. */
export const buildAlertWebhookPayload = (input: AlertNotificationInput): AlertWebhookPayload => ({
  type: 'alert.fired',
  alertId: input.alertId,
  name: input.alertName,
  symbol: input.symbol,
  price: input.price,
  value: input.value,
  reason: input.reason,
  firedAt: input.firedAt.toISOString(),
});

/** One-line human summary of a fired alert (email subject / log line). Pure. */
export const renderAlertTitle = (input: AlertNotificationInput): string =>
  `${input.alertName}: ${input.symbol} @ ${input.price} — ${input.reason}`;

/** A plain-text email to send. */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Render a fired alert into an email subject + body. Pure. */
export const renderAlertEmail = (input: AlertNotificationInput): { subject: string; text: string } => ({
  subject: renderAlertTitle(input),
  text:
    `Your alert "${input.alertName}" fired.\n\n` +
    `Symbol: ${input.symbol}\n` +
    `Price:  ${input.price}\n` +
    `Value:  ${input.value}\n` +
    `Reason: ${input.reason}\n` +
    `Time:   ${input.firedAt.toISOString()}\n`,
});

/**
 * Build an RFC-822 message (headers + body) for SMTP: normalizes line endings
 * to CRLF and dot-stuffs lines that begin with `.` (SMTP transparency). Pure.
 */
export const buildRfc822 = (from: string, msg: EmailMessage): string => {
  const body = msg.text
    .replace(/\r?\n/g, '\r\n')
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
  const headers = [
    `From: ${from}`,
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
  ].join('\r\n');
  return `${headers}\r\n\r\n${body}`;
};

/** Sends an email; resolves to whether it succeeded. */
export type EmailTransport = (msg: EmailMessage) => Promise<boolean>;

/** Deliver an email via the given transport. Never throws (false on failure). */
export const deliverEmail = async (
  msg: EmailMessage,
  transport: EmailTransport,
): Promise<boolean> => {
  try {
    return await transport(msg);
  } catch {
    return false;
  }
};

/**
 * Best-effort SSRF guard for a user-supplied webhook URL: requires http(s) and
 * rejects loopback / link-local / private-range / metadata hosts. This is a
 * hostname-level check (it does not resolve DNS, so it can't stop DNS-rebinding);
 * a network egress policy is the real defense. Returns true when the URL looks
 * safe to POST to.
 */
export const isPublicWebhookUrl = (url: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata') return false;
  if (host === '0.0.0.0' || host === '::1' || host === '::') return false;
  // IPv4 private / loopback / link-local ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 127 || a === 10 || a === 0) return false;
    if (a === 169 && b === 254) return false; // link-local (incl. cloud metadata)
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8')) return false;
  return true;
};

/** Minimal fetch surface so transports can be unit-tested with a fake. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

/**
 * POST a webhook payload. Returns whether delivery succeeded (2xx). Never
 * throws — network/transport errors resolve to `false` so a failed delivery is
 * recorded as pending rather than aborting the caller.
 */
export const deliverWebhook = async (
  url: string,
  payload: AlertWebhookPayload,
  fetchImpl: FetchLike,
  timeoutMs = 5000,
): Promise<boolean> => {
  void timeoutMs;
  if (!isPublicWebhookUrl(url)) return false;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'tradingviu-alerts/1' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
};
