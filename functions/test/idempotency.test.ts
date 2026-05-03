/**
 * Unit tests for withIdempotency.
 *
 * Firestore is mocked with a simple in-memory Map so no emulator is needed.
 * fakeTimeMs controls what timestampNow() returns so TTL expiry can be
 * simulated without real-time delays.
 */

type FakeDoc = Record<string, unknown>;

let fakeStore: Map<string, FakeDoc>;
let fakeTimeMs = 0;

jest.mock('../src/utils/firestore', () => ({
  db: () => ({
    collection: (_name: string) => ({
      doc: (id: string) => ({
        __id: id,
        async set(data: FakeDoc, opts?: { merge?: boolean }) {
          const prev = opts?.merge ? (fakeStore.get(id) ?? {}) : {};
          fakeStore.set(id, { ...prev, ...data });
        },
      }),
    }),
    runTransaction: async (
      fn: (tx: {
        get: (ref: { __id: string }) => Promise<{
          exists: boolean;
          data: () => FakeDoc | undefined;
        }>;
        set: (ref: { __id: string }, data: FakeDoc) => void;
      }) => Promise<unknown>,
    ) => {
      return fn({
        get: async (ref: { __id: string }) => {
          const data = fakeStore.get(ref.__id);
          return { exists: data !== undefined, data: () => data };
        },
        set: (ref: { __id: string }, data: FakeDoc) => {
          fakeStore.set(ref.__id, data);
        },
      });
    },
  }),
  timestampNow: () => {
    const ms = fakeTimeMs;
    return { toMillis: () => ms };
  },
  serverTimestamp: () => ({ __server: true }),
}));

// eslint-disable-next-line import/first -- mocks must be declared first.
import { withIdempotency, IdempotencyReplayError } from '../src/utils/idempotency';

describe('withIdempotency', () => {
  beforeEach(() => {
    fakeStore = new Map();
    fakeTimeMs = 0;
  });

  it('throws when key is empty', async () => {
    await expect(
      withIdempotency('', 60_000, async () => 'result'),
    ).rejects.toThrow('non-empty key');
  });

  it('runs the function and returns its result on a fresh key', async () => {
    const fn = jest.fn().mockResolvedValue('hello');
    const result = await withIdempotency('fresh-key', 60_000, fn);
    expect(result).toBe('hello');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stores a completed record after a successful run', async () => {
    await withIdempotency('store-key', 60_000, async () => 42);
    const stored = fakeStore.get('store-key');
    expect(stored?.status).toBe('completed');
    expect(stored?.result).toBe(42);
  });

  it('replays the stored result without re-running fn for a completed record', async () => {
    // Pre-populate a completed record within TTL (createdAt = 0, ttl = 60 000).
    fakeStore.set('replay-key', {
      status: 'completed',
      result: 'cached',
      createdAt: { toMillis: () => 0 },
      completedAt: { toMillis: () => 0 },
    });
    fakeTimeMs = 1_000; // within 60 000 ms TTL

    const fn = jest.fn().mockResolvedValue('fresh');
    const result = await withIdempotency('replay-key', 60_000, fn);

    expect(result).toBe('cached');
    expect(fn).not.toHaveBeenCalled();
  });

  it('re-runs fn when the existing record has expired', async () => {
    fakeStore.set('expire-key', {
      status: 'completed',
      result: 'old',
      createdAt: { toMillis: () => 0 },
      completedAt: { toMillis: () => 0 },
    });
    fakeTimeMs = 5_000; // beyond the 2 000 ms TTL below

    const fn = jest.fn().mockResolvedValue('new');
    const result = await withIdempotency('expire-key', 2_000, fn);

    expect(result).toBe('new');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws IdempotencyReplayError for a replayed failed record', async () => {
    fakeStore.set('failed-key', {
      status: 'failed',
      error: { code: 'not-found', message: 'gone' },
      createdAt: { toMillis: () => 0 },
      completedAt: { toMillis: () => 0 },
    });
    fakeTimeMs = 500; // within TTL

    const fn = jest.fn();
    const promise = withIdempotency('failed-key', 60_000, fn);

    await expect(promise).rejects.toBeInstanceOf(IdempotencyReplayError);
    await expect(promise).rejects.toMatchObject({ code: 'not-found' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('throws IdempotencyReplayError(aborted) for an in_progress record', async () => {
    fakeStore.set('running-key', {
      status: 'in_progress',
      createdAt: { toMillis: () => 0 },
      completedAt: null,
    });
    fakeTimeMs = 100;

    const fn = jest.fn();
    await expect(
      withIdempotency('running-key', 60_000, fn),
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('stores a failed record and rethrows when fn throws', async () => {
    const boom = new Error('something broke');
    const fn = jest.fn().mockRejectedValue(boom);

    await expect(
      withIdempotency('throw-key', 60_000, fn),
    ).rejects.toBe(boom);

    const stored = fakeStore.get('throw-key');
    expect(stored?.status).toBe('failed');
    expect((stored?.error as { message: string }).message).toBe('something broke');
  });

  it('sanitises slashes and spaces in the key', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await withIdempotency('a/b c', 60_000, fn);
    // The key stored in Firestore should not contain raw slashes or spaces.
    const keys = Array.from(fakeStore.keys());
    expect(keys.every((k) => !k.includes('/') && !k.includes(' '))).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('suffixes long keys with a hash to avoid Firestore id collisions', async () => {
    const longKey = 'x'.repeat(1500);
    const fn = jest.fn().mockResolvedValue('big');
    await withIdempotency(longKey, 60_000, fn);
    const keys = Array.from(fakeStore.keys());
    // Stored key should be truncated and suffixed with :<hash>
    expect(keys[0]).toMatch(/^x{1400}:[0-9a-f]{32}$/);
  });

  it('returns null result correctly on replay', async () => {
    fakeStore.set('null-key', {
      status: 'completed',
      result: null,
      createdAt: { toMillis: () => 0 },
      completedAt: { toMillis: () => 0 },
    });
    fakeTimeMs = 100;

    const fn = jest.fn().mockResolvedValue('should-not-run');
    const result = await withIdempotency('null-key', 60_000, fn);
    expect(result).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('IdempotencyReplayError', () => {
  it('has the correct name and exposes the code', () => {
    const err = new IdempotencyReplayError('aborted', 'in progress');
    expect(err.name).toBe('IdempotencyReplayError');
    expect(err.code).toBe('aborted');
    expect(err.message).toBe('in progress');
    expect(err).toBeInstanceOf(Error);
  });
});
