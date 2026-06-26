import net from 'node:net';
import { loadEnv } from '@tv/core';
import { buildRfc822, type EmailMessage, type EmailTransport } from '@tv/notifications';

/**
 * A tiny SMTP client over a raw socket — enough to relay a plain-text message
 * through an unauthenticated relay like Mailpit (the dev mail catcher in
 * docker-compose). No auth, no STARTTLS; intended for a trusted local/self-host
 * relay. Resolves to whether the message was accepted; never rejects.
 */
const smtpSend = (
  host: string,
  port: number,
  from: string,
  msg: EmailMessage,
): Promise<boolean> =>
  new Promise((resolve) => {
    // Each step waits for the server's reply code, then sends the next command.
    const steps: { cmd?: string; expect: number }[] = [
      { expect: 220 }, // greeting
      { cmd: 'EHLO tradingviu', expect: 250 },
      { cmd: `MAIL FROM:<${from}>`, expect: 250 },
      { cmd: `RCPT TO:<${msg.to}>`, expect: 250 },
      { cmd: 'DATA', expect: 354 },
      { cmd: `${buildRfc822(from, msg)}\r\n.`, expect: 250 },
      { cmd: 'QUIT', expect: 221 },
    ];

    let i = 0;
    let buf = '';
    let settled = false;
    const socket = net.createConnection({ host, port });
    socket.setEncoding('utf8');
    socket.setTimeout(8000);

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* already closed */
      }
      resolve(ok);
    };

    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
    socket.on('close', () => finish(false)); // closed before QUIT acknowledged

    socket.on('data', (chunk: string) => {
      buf += chunk;
      // SMTP replies are line(s) ending CRLF; the final line is "NNN " (space).
      const idx = buf.lastIndexOf('\r\n');
      if (idx === -1) return;
      const lines = buf.slice(0, idx).split('\r\n');
      const finalLine = lines[lines.length - 1] ?? '';
      if (!/^\d{3} /.test(finalLine)) return; // multiline continuation; wait
      buf = '';
      const code = Number(finalLine.slice(0, 3));
      const step = steps[i];
      if (!step || code !== step.expect) return finish(false);
      i += 1;
      const next = steps[i];
      if (!next) return finish(true); // QUIT acknowledged
      if (next.cmd !== undefined) socket.write(`${next.cmd}\r\n`);
    });
  });

let cached: EmailTransport | null | undefined;

/**
 * The configured SMTP email transport, or null when SMTP is not configured
 * (no `SMTP_HOST`) — in which case email channels are simply not delivered.
 * Memoized.
 */
export const getEmailTransport = (): EmailTransport | null => {
  if (cached !== undefined) return cached;
  const env = loadEnv();
  if (!env.SMTP_HOST) {
    cached = null;
    return cached;
  }
  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;
  const from = env.EMAIL_FROM ?? 'alerts@tradingviu.localhost';
  cached = (msg) => smtpSend(host, port, from, msg);
  return cached;
};
