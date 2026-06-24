#!/usr/bin/env bun
import { createDb } from '@tv/db';
import { tenants, users, plans, exchanges, symbols, tenantMembers } from '@tv/db/schema';
import { signup } from '@tv/auth';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';

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
  create-super-admin --email <e> --password <p>   create the first super admin (if none exists)
  tenant list                                      list all tenants
  tenant create --slug <s> --name <n> --owner <email>   create tenant + owner user
  tenant suspend --id <id>                         suspend a tenant
  tenant set-plan --id <id> --plan <code>          change tenant plan
  plan list                                        list plans
  plan show --code <code>                          show plan quotas
  exchange list                                    list exchanges
  symbol list --limit <n>                          list symbols
  symbol search --q <q>                            search symbols
  user list                                        list users
  health                                           check DB connection
`);
};

try {
  switch (cmd) {
    case 'create-super-admin': {
      const email = arg('email');
      const password = arg('password');
      if (!email || !password) throw new Error('email and password required');
      const r = await signup(db, { email, password });
      console.log('created', r);
      break;
    }
    case 'tenant':
      if (args[0] === 'list') {
        const rows = await db.select().from(tenants);
        print(rows);
      } else if (args[0] === 'create') {
        const slug = arg('slug');
        const name = arg('name');
        const owner = arg('owner');
        if (!slug || !name || !owner) throw new Error('slug, name, owner required');
        const [u] = await db.select().from(users).where(eq(users.email, owner.toLowerCase()));
        if (!u) throw new Error(`owner user not found: ${owner}`);
        const tid = ulid();
        await db.insert(tenants).values({ id: tid, slug, name, planCode: 'free' });
        await db.insert(tenantMembers).values({ id: ulid(), tenantId: tid, userId: u.id, role: 'owner', acceptedAt: new Date() });
        console.log('created tenant', tid);
      } else if (args[0] === 'suspend') {
        const id = arg('id');
        if (!id) throw new Error('id required');
        await db.update(tenants).set({ status: 'suspended' }).where(eq(tenants.id, id));
        console.log('suspended', id);
      } else if (args[0] === 'set-plan') {
        const id = arg('id');
        const planCode = arg('plan');
        if (!id || !planCode) throw new Error('id and plan required');
        await db.update(tenants).set({ planCode }).where(eq(tenants.id, id));
        console.log('plan updated', id, planCode);
      } else {
        help();
      }
      break;
    case 'plan':
      if (args[0] === 'list') {
        const rows = await db.select().from(plans);
        print(rows);
      } else if (args[0] === 'show') {
        const code = arg('code');
        if (!code) throw new Error('code required');
        const [row] = await db.select().from(plans).where(eq(plans.code, code));
        print(row);
      } else {
        help();
      }
      break;
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
        const filtered = rows.filter((r) =>
          r.ticker.toLowerCase().includes(q.toLowerCase()) || r.name.toLowerCase().includes(q.toLowerCase()),
        );
        print(filtered);
      } else {
        help();
      }
      break;
    case 'user':
      if (args[0] === 'list') {
        const rows = await db.select().from(users);
        print(rows.map((u) => ({ id: u.id, email: u.email, globalRole: u.globalRole, displayName: u.displayName, createdAt: u.createdAt })));
      } else {
        help();
      }
      break;
    case 'health': {
      const r = await db.execute<{ now: string }>("SELECT NOW()::text AS now");
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
