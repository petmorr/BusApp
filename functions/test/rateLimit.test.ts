import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Unit tests for the rate-limiter. We inject a fake Firestore via the
 * module mock so the test doesn't need the real emulator.
 */

let fakeStore: Map<string, Record<string, unknown>>;

jest.mock('../src/utils/firestore', () => ({
  db: () => ({
    collection: (_name: string) => ({
      doc: (id: string) => ({ __id: id }),
    }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: unknown) => Promise<unknown>;
        set: (ref: unknown, value: unknown, opts?: unknown) => void;
      }) => Promise<unknown>,
    ): Promise<unknown> => {
      return fn({
        get: async (ref: unknown) => {
          const id = (ref as { __id: string }).__id;
          const record = fakeStore.get(id);
          return {
            exists: record !== undefined,
            data: () => record,
          };
        },
        set: (ref: unknown, value: unknown, _opts?: unknown) => {
          const id = (ref as { __id: string }).__id;
          const prev = fakeStore.get(id) ?? {};
          fakeStore.set(id, { ...prev, ...(value as Record<string, unknown>) });
        },
      });
    },
  }),
  serverTimestamp: () => ({ __server: true }),
  timestampNow: () => ({ __now: true }),
}));

import { enforceRateLimit } from '../src/utils/rateLimit';

describe('enforceRateLimit', () => {
  beforeEach(() => {
    fakeStore = new Map();
  });

  it('permits calls up to the max, then rejects with resource-exhausted', async () => {
    const opts = { key: 'user:abc', max: 3, windowMs: 60_000 };
    await enforceRateLimit(opts);
    await enforceRateLimit(opts);
    await enforceRateLimit(opts);
    await expect(enforceRateLimit(opts)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
  });

  it('resets the counter after the window elapses', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const opts = { key: 'user:win', max: 2, windowMs: 1_000 };
    await enforceRateLimit(opts);
    await enforceRateLimit(opts);
    await expect(enforceRateLimit(opts)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    // Advance past the window — next call should succeed again.
    jest.setSystemTime(new Date('2026-01-01T00:00:02Z'));
    await expect(enforceRateLimit(opts)).resolves.toBeUndefined();
    jest.useRealTimers();
  });

  it('scopes the counter per key', async () => {
    const a = { key: 'user:A', max: 1, windowMs: 60_000 };
    const b = { key: 'user:B', max: 1, windowMs: 60_000 };
    await enforceRateLimit(a);
    await enforceRateLimit(b);
    await expect(enforceRateLimit(a)).rejects.toBeInstanceOf(HttpsError);
    await expect(enforceRateLimit(b)).rejects.toBeInstanceOf(HttpsError);
  });

  it('rejects malformed options', async () => {
    await expect(
      enforceRateLimit({ key: '', max: 1, windowMs: 1 }),
    ).rejects.toThrow();
    await expect(
      enforceRateLimit({ key: 'x', max: 0, windowMs: 1 }),
    ).rejects.toThrow();
    await expect(
      enforceRateLimit({ key: 'x', max: 1, windowMs: 0 }),
    ).rejects.toThrow();
  });
});
