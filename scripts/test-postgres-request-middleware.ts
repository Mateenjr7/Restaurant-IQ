import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { RestaurantDatabase } from '../server/db.ts';
import {
  createPostgresRequestMiddleware,
  type PostgresRequestStore,
} from '../server/postgres-request-middleware.ts';

type FailureMode = 'query' | 'rollback' | 'commit-applied';

class SimulatedClient {
  public readonly queries: string[] = [];
  public releaseArgument: boolean | Error | undefined;
  public releaseCount = 0;
  public pendingState: ReturnType<RestaurantDatabase['snapshotState']> | undefined;
  public durableState: ReturnType<RestaurantDatabase['snapshotState']>;
  public failureMode: FailureMode | undefined;

  constructor(initialState: ReturnType<RestaurantDatabase['snapshotState']>) {
    this.durableState = structuredClone(initialState);
  }

  async query(query: string) {
    this.queries.push(query);
    if (query === 'COMMIT' && this.pendingState) {
      this.durableState = structuredClone(this.pendingState);
    }
    if (query === 'COMMIT' && this.failureMode === 'commit-applied') {
      this.failureMode = undefined;
      throw Object.assign(new Error('simulated acknowledgement loss'), { code: 'SIMULATED_COMMIT_ACK' });
    }
    if (query === 'PERSIST' && (this.failureMode === 'query' || this.failureMode === 'rollback')) {
      throw Object.assign(new Error('simulated persistence query failure'), { code: 'SIMULATED_QUERY' });
    }
    if (query === 'ROLLBACK' && this.failureMode === 'rollback') {
      throw Object.assign(new Error('simulated rollback failure'), { code: 'SIMULATED_ROLLBACK' });
    }
    return {};
  }

  release(discard?: boolean | Error) {
    this.releaseCount += 1;
    this.releaseArgument = discard;
  }
}

class SimulatedResponse extends EventEmitter {
  public statusCode = 200;
  public headersSent = false;
  public readonly headers = new Map<string, string>();
  public sentBody: unknown;
  private resolveSent!: () => void;
  public readonly sent = new Promise<void>((resolve) => {
    this.resolveSent = resolve;
  });

  send(body?: unknown) {
    this.sentBody = body;
    this.headersSent = true;
    this.resolveSent();
    return this;
  }

  json(body: unknown) {
    return this.send(JSON.stringify(body));
  }

  setHeader(name: string, value: string) {
    this.headers.set(name, value);
    return this;
  }
}

function setup(failureMode?: FailureMode) {
  const database = new RestaurantDatabase('', '', { memoryOnly: true });
  const originalState = database.snapshotState();
  const client = new SimulatedClient(originalState);
  client.failureMode = failureMode;
  let persistCount = 0;
  const simulatedStore = {
    acquireClient: async () => client as unknown as PoolClient,
    beginRequest: async (_client: PoolClient) => {
      const state = structuredClone(client.durableState);
      database.replaceState(state);
      return state;
    },
    persist: async () => {
      persistCount += 1;
      await client.query('PERSIST');
      client.pendingState = database.snapshotState();
    },
  };
  const middleware = createPostgresRequestMiddleware(
    simulatedStore as unknown as PostgresRequestStore,
    database,
  );
  return { database, originalState, client, middleware, getPersistCount: () => persistCount };
}

async function invoke(
  middleware: ReturnType<typeof createPostgresRequestMiddleware>,
  method: 'GET' | 'POST' = 'POST',
  mutation?: () => void,
) {
  const response = new SimulatedResponse();
  middleware(
    { path: '/api/test', method } as Request,
    response as unknown as Response,
    () => {
      mutation?.();
      response.send('success');
    },
  );
  await response.sent;
  return response;
}

async function main() {
  const log = console.error;
  const loggedErrors: string[] = [];
  console.error = (...values: unknown[]) => loggedErrors.push(values.join(' '));
  try {
    const queryFailure = setup('query');
    const beforeRounding = queryFailure.database.policy.roundingStep;
    const failedResponse = await invoke(
      queryFailure.middleware,
      'POST',
      () => { queryFailure.database.policy.roundingStep += 1; },
    );
    assert.equal(failedResponse.statusCode, 503);
    assert.equal(queryFailure.database.policy.roundingStep, beforeRounding);
    assert(queryFailure.client.queries.includes('ROLLBACK'));
    assert(!queryFailure.client.queries.includes('COMMIT'));
    assert.equal(queryFailure.client.releaseCount, 1);

    const rollbackFailure = setup('rollback');
    const rollbackResponse = await invoke(
      rollbackFailure.middleware,
      'POST',
      () => { rollbackFailure.database.policy.roundingStep += 1; },
    );
    assert.equal(rollbackResponse.statusCode, 503);
    assert.equal(rollbackFailure.client.releaseArgument, true);
    assert.equal(rollbackFailure.client.releaseCount, 1);
    assert.equal(rollbackFailure.database.policy.roundingStep, rollbackFailure.originalState.policy.roundingStep);

    const commitFailure = setup('commit-applied');
    const initialRounding = commitFailure.database.policy.roundingStep;
    const ambiguousResponse = await invoke(
      commitFailure.middleware,
      'POST',
      () => { commitFailure.database.policy.roundingStep += 1; },
    );
    const ambiguousBody = JSON.parse(String(ambiguousResponse.sentBody)) as { error: string };
    assert.equal(ambiguousResponse.statusCode, 503);
    assert.match(ambiguousBody.error, /outcome/);
    assert(!JSON.stringify(ambiguousBody).includes('SIMULATED'));
    assert.equal(commitFailure.getPersistCount(), 1);
    assert.equal(commitFailure.client.queries.filter((query) => query === 'PERSIST').length, 1);
    assert.equal(commitFailure.client.queries.filter((query) => query === 'COMMIT').length, 1);
    assert.equal(commitFailure.database.policy.roundingStep, initialRounding);
    assert.equal(commitFailure.client.releaseCount, 1);

    let subsequentReadValue: number | undefined;
    const readResponse = await invoke(
      commitFailure.middleware,
      'GET',
      () => { subsequentReadValue = commitFailure.database.policy.roundingStep; },
    );
    assert.equal(readResponse.sentBody, 'success');
    assert.equal(subsequentReadValue, initialRounding + 1);
    assert.equal(commitFailure.getPersistCount(), 1);

    const success = setup();
    const successValue = success.database.policy.roundingStep;
    const successResponse = await invoke(
      success.middleware,
      'POST',
      () => { success.database.policy.roundingStep += 1; },
    );
    assert.equal(successResponse.sentBody, 'success');
    assert.equal(success.client.queries.filter((query) => query === 'COMMIT').length, 1);
    assert.equal(success.client.releaseArgument, undefined);
    assert.equal(success.client.releaseCount, 1);
    assert.equal(success.database.policy.roundingStep, successValue + 1);

    assert(loggedErrors.every((entry) =>
      !entry.includes('simulated persistence query failure') &&
      !entry.includes('simulated rollback failure') &&
      !entry.includes('simulated acknowledgement loss')));
    console.log('PostgreSQL middleware simulations: 7/7 passed (fake client/store; no PostgreSQL connection).');
  } finally {
    console.error = log;
  }
}

main().catch(() => {
  console.error('PostgreSQL middleware simulations failed.');
  process.exitCode = 1;
});
