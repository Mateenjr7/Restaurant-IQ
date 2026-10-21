import type { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { db, type PersistedDatabaseState } from './db.ts';
import { postgresStore } from './postgres-store.ts';

export interface PostgresRequestStore {
  acquireClient(): Promise<PoolClient>;
  beginRequest(client: PoolClient, database: typeof db): Promise<PersistedDatabaseState>;
  persist(client: PoolClient, database: typeof db, previous: PersistedDatabaseState): Promise<void>;
}

let requestQueue: Promise<void> = Promise.resolve();

async function acquireProcessLock() {
  const previous = requestQueue;
  let release!: () => void;
  requestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  return release;
}

function isPersistentMutation(req: Request) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false;
  return req.path !== '/api/pricing/simulate' &&
    req.path !== '/api/ai/strategic-advice';
}

async function rollbackAndRelease(client: PoolClient, releaseLock: () => void) {
  let discardClient = false;
  try {
    await client.query('ROLLBACK');
  } catch (error) {
    discardClient = true;
    console.error(`PostgreSQL rollback failed; ${postgresErrorDetails(error)}.`);
  } finally {
    client.release(discardClient);
    releaseLock();
  }
}

function postgresErrorDetails(error: unknown) {
  if (error === null || typeof error !== 'object') return 'code=unknown';
  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : 'unknown';
  const constraint = typeof record.constraint === 'string' ? record.constraint : undefined;
  const table = typeof record.table === 'string' ? record.table : undefined;
  return [`code=${code}`, ...(constraint ? [`constraint=${constraint}`] : []), ...(table ? [`table=${table}`] : [])].join(' ');
}

export function createPostgresRequestMiddleware(
  store: PostgresRequestStore = postgresStore,
  database: typeof db = db,
) {
  return function postgresRequestMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!req.path.startsWith('/api/')) {
      next();
      return;
    }

    void (async () => {
      const releaseLock = await acquireProcessLock();
      let client: PoolClient | undefined;
      let previousState: PersistedDatabaseState | undefined;
      try {
        client = await store.acquireClient();
        previousState = await store.beginRequest(client, database);
      } catch {
        if (client) await rollbackAndRelease(client, releaseLock);
        else releaseLock();
        if (!res.headersSent) {
          res.status(503).json({ error: 'Database unavailable; the request was not completed.' });
        }
        return;
      }

      let finalized = false;
      let operationStage = 'transaction';
      const originalSend = res.send.bind(res);
      res.send = ((body?: unknown) => {
        if (finalized) return originalSend(body as never);
        finalized = true;
        void (async () => {
          try {
            if (isPersistentMutation(req) && res.statusCode < 400) {
              operationStage = 'persist';
              await store.persist(client!, database, previousState!);
            } else if (isPersistentMutation(req)) {
              database.replaceState(previousState!);
              await rollbackAndRelease(client!, releaseLock);
              originalSend(body as never);
              return;
            }
            operationStage = 'commit';
            await client!.query('COMMIT');
          } catch (error) {
            console.error(`PostgreSQL request failed at ${operationStage}; ${postgresErrorDetails(error)}.`);
            database.replaceState(previousState!);
            await rollbackAndRelease(client!, releaseLock);
            if (!res.headersSent) {
              res.statusCode = 503;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              const message = operationStage === 'commit'
                ? 'The database could not confirm the transaction outcome. Check the current state before retrying.'
                : 'Database operation failed; no changes were committed.';
              originalSend(JSON.stringify({ error: message }));
            }
            return;
          }
          client!.release();
          releaseLock();
          originalSend(body as never);
        })();
        return res;
      }) as Response['send'];

      res.once('close', () => {
        if (!finalized) {
          finalized = true;
          database.replaceState(previousState!);
          void rollbackAndRelease(client!, releaseLock);
        }
      });

      next();
    })().catch(() => {
      if (!res.headersSent) {
        res.status(503).json({ error: 'Database unavailable; the request was not completed.' });
      }
    });
  };
}

export const postgresRequestMiddleware = createPostgresRequestMiddleware();
