import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import { createBrokerAdapter } from '@tv/broker-adapters';
import {
  BrokerCredentialsSchema,
  CreateBrokerConnectionSchema,
  NotFoundError,
  PlaceBrokerOrderSchema,
  UpdateBrokerConnectionSchema,
  ValidationError,
  loadEnv,
  tryGetTenant,
  type BrokerCredentials,
  type TenantContext,
} from '@tv/core';
import { brokerConnections } from '@tv/db/schema';
import { ulid } from 'ulid';
import {
  decryptCredentialPayload,
  encryptCredentialPayload,
} from '../services/credential-vault.js';

const publicConnection = (row: typeof brokerConnections.$inferSelect) => ({
  id: row.id,
  broker: row.broker,
  label: row.label,
  accountId: row.accountId,
  status: row.status,
  lastSyncAt: row.lastSyncAt,
  createdAt: row.createdAt,
});

const loadConnection = async (
  db: ReturnType<typeof import('@tv/db').createDb>,
  tenant: TenantContext,
  id: string,
) => {
  const [row] = await db
    .select()
    .from(brokerConnections)
    .where(
      and(
        eq(brokerConnections.id, id),
        eq(brokerConnections.tenantId, tenant.tenantId),
        eq(brokerConnections.userId, tenant.userId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError('Broker connection not found');
  return row;
};

const loadCredentials = async (encrypted: string): Promise<BrokerCredentials> => {
  const raw = await decryptCredentialPayload(encrypted, loadEnv().CRED_ENC_KEY);
  return BrokerCredentialsSchema.parse(raw);
};

export const brokerRoutes = new Hono()
  .get('/brokers/connections', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const rows = await db
      .select()
      .from(brokerConnections)
      .where(
        and(
          eq(brokerConnections.tenantId, tenant.tenantId),
          eq(brokerConnections.userId, tenant.userId),
        ),
      )
      .orderBy(desc(brokerConnections.createdAt));
    return c.json({ connections: rows.map(publicConnection) });
  })
  .post('/brokers/connections', zValidator('json', CreateBrokerConnectionSchema), async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const body = c.req.valid('json');
    const id = ulid();
    const credentials = await encryptCredentialPayload(
      { broker: body.broker, credentials: body.credentials },
      loadEnv().CRED_ENC_KEY,
    );
    await db.insert(brokerConnections).values({
      id,
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      broker: body.broker,
      label: body.label ?? `${body.broker} ${body.environment}`,
      accountId:
        body.accountId ?? (body.broker === 'ibkr' ? (body.credentials.accountId ?? null) : null),
      credentialsEncrypted: credentials,
      status: 'connected',
    });
    return c.json({ id });
  })
  .patch(
    '/brokers/connections/:id',
    zValidator('json', UpdateBrokerConnectionSchema),
    async (c) => {
      const db = c.get('db');
      const tenant = tryGetTenant() as TenantContext;
      const id = c.req.param('id');
      await loadConnection(db, tenant, id);
      const body = c.req.valid('json');
      await db
        .update(brokerConnections)
        .set({
          ...(body.label !== undefined ? { label: body.label } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        })
        .where(and(eq(brokerConnections.id, id), eq(brokerConnections.tenantId, tenant.tenantId)));
      return c.json({ ok: true });
    },
  )
  .delete('/brokers/connections/:id', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    await loadConnection(db, tenant, id);
    await db
      .delete(brokerConnections)
      .where(and(eq(brokerConnections.id, id), eq(brokerConnections.tenantId, tenant.tenantId)));
    return c.json({ ok: true });
  })
  .post('/brokers/connections/:id/test', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const row = await loadConnection(db, tenant, id);
    const adapter = createBrokerAdapter(await loadCredentials(row.credentialsEncrypted));
    const health = await adapter.healthCheck();
    await db
      .update(brokerConnections)
      .set({ status: health.ok ? 'connected' : 'error', lastSyncAt: new Date() })
      .where(and(eq(brokerConnections.id, id), eq(brokerConnections.tenantId, tenant.tenantId)));
    return c.json({ health });
  })
  .get('/brokers/connections/:id/accounts', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const row = await loadConnection(db, tenant, id);
    const adapter = createBrokerAdapter(await loadCredentials(row.credentialsEncrypted));
    const accounts = await adapter.getAccounts();
    await db
      .update(brokerConnections)
      .set({ lastSyncAt: new Date(), status: 'connected' })
      .where(and(eq(brokerConnections.id, id), eq(brokerConnections.tenantId, tenant.tenantId)));
    return c.json({ accounts });
  })
  .get('/brokers/connections/:id/positions', async (c) => {
    const db = c.get('db');
    const tenant = tryGetTenant() as TenantContext;
    const id = c.req.param('id');
    const row = await loadConnection(db, tenant, id);
    const accountId = c.req.query('accountId') ?? row.accountId ?? undefined;
    const adapter = createBrokerAdapter(await loadCredentials(row.credentialsEncrypted));
    const positions = await adapter.getPositions(accountId);
    return c.json({ positions });
  })
  .post(
    '/brokers/connections/:id/orders',
    zValidator('json', PlaceBrokerOrderSchema),
    async (c) => {
      const db = c.get('db');
      const tenant = tryGetTenant() as TenantContext;
      const id = c.req.param('id');
      const row = await loadConnection(db, tenant, id);
      const body = c.req.valid('json');
      if (body.type === 'limit' && body.limitPrice === undefined) {
        throw new ValidationError('Limit broker orders require limitPrice');
      }
      const adapter = createBrokerAdapter(await loadCredentials(row.credentialsEncrypted));
      const order = await adapter.placeOrder(body, row.accountId ?? undefined);
      return c.json({ order });
    },
  );
