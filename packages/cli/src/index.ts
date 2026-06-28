#!/usr/bin/env bun
import { createDb } from '@tv/db';
import { users, exchanges, symbols } from '@tv/db/schema';
import { ensureOwner, signup } from '@tv/auth';
import { loadEnv } from '@tv/core';

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb({ url });

const [, , cmd, ...args] = process.argv;

const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return undefined;
};

const print = (data: unknown) => console.log(JSON.stringify(data, null, 2));

const help = () => {
  console.log(`tvctl — tradingviu operator CLI

Commands:
  create-owner --email <e> --password <p>   create the owner account (first signup)
  ensure-owner [--email <e> --password <p>]  create or repair the owner login
  exchange list                             list exchanges
  symbol list --limit <n>                   list symbols
  symbol search --q <q>                     search symbols
  user list                                 list users
  health                                    check DB connection
`);
};

try {
  switch (cmd) {
    case 'create-owner': {
      const email = arg('email');
      const password = arg('password');
      if (!email || !password) throw new Error('email and password required');
      const r = await signup(db, { email, password });
      console.log('created', r);
      break;
    }
    case 'ensure-owner': {
      const email = arg('email') ?? process.env.OWNER_EMAIL ?? 'owner@tradingviu.local';
      const password = arg('password') ?? process.env.OWNER_PASSWORD;
      if (!password) throw new Error('password required: pass --password or set OWNER_PASSWORD');
      const r = await ensureOwner(db, { email, password, displayName: 'Owner' });
      console.log('owner account ready', r);
      break;
    }
    case 'exchange':
      if (args[0] === 'list') {
        const rows = await db.select().from(exchanges);
        print(rows);
      } else {
        help();
      }
      break;
    case 'symbol':
      if (args[0] === 'list') {
        const limit = parseInt(arg('limit') ?? '20', 10);
        const rows = await db.select().from(symbols).limit(limit);
        print(rows);
      } else if (args[0] === 'search') {
        const q = arg('q');
        if (!q) throw new Error('q required');
        const rows = await db.select().from(symbols).limit(20);
        const filtered = rows.filter(
          (r) =>
            r.ticker.toLowerCase().includes(q.toLowerCase()) ||
            r.name.toLowerCase().includes(q.toLowerCase()),
        );
        print(filtered);
      } else {
        help();
      }
      break;
    case 'user':
      if (args[0] === 'list') {
        const rows = await db.select().from(users);
        print(
          rows.map((u) => ({
            id: u.id,
            email: u.email,
            displayName: u.displayName,
            createdAt: u.createdAt,
          })),
        );
      } else {
        help();
      }
      break;
    case 'health': {
      const r = await db.execute<{ now: string }>('SELECT NOW()::text AS now');
      console.log('db ok', r[0]?.now);
      break;
    }
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      help();
      break;
    default:
      help();
      process.exit(1);
  }
} catch (e) {
  console.error('error:', e instanceof Error ? e.message : String(e));
  process.exit(1);
}

process.exit(0);
