import { logger } from 'firebase-functions/v2';
import { db, timestampNow, Timestamp } from './firestore';

/**
 * Lightweight idempotency guard backed by Firestore.
 *
 * A function that may run more than once for the "same" logical request can
 * call `withIdempotency(key, ttlMs, fn)`. The first invocation reserves
 * `idempotencyKeys/{key}`; concurrent or retried invocations with the same
 * key short-circuit and return the previously stored result without
 * re-executing the body.
 *
 * Usage example:
 *
 *     const key = `notify:${eventId}:${type}:${requestId}`;
 *     return withIdempotency(key, 24 * 60 * 60 * 1000, async () => sendIt());
 *
 * Notes:
 *
 * - We use a transaction to make the "reserve or read" decision atomic.
 * - The body's resolved value is JSON-serialised and stored on the key so
 *   later replays can return the same response shape.
 * - Records older than `ttlMs` are treated as expired. A periodic cleanup
 *   function (out of scope for the MVP) can purge them; in the meantime
 *   they are harmless.
 */

export interface IdempotencyRecord<T> {
  status: 'in_progress' | 'completed' | 'failed';
  result?: T;
  error?: { code: string; message: string };
  createdAt: Timestamp;
  completedAt: Timestamp | null;
}

export async function withIdempotency<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) throw new Error('withIdempotency requires a non-empty key.');
  const firestore = db();
  const ref = firestore.collection('idempotencyKeys').doc(encodeKey(key));
  const now = timestampNow();

  const reservation = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() as IdempotencyRecord<T>;
      const age = now.toMillis() - data.createdAt.toMillis();
      if (age < ttlMs) {
        return { kind: 'replay' as const, data };
      }
    }
    tx.set(ref, {
      status: 'in_progress',
      result: null,
      error: null,
      createdAt: now,
      completedAt: null,
    });
    return { kind: 'fresh' as const };
  });

  if (reservation.kind === 'replay') {
    if (reservation.data.status === 'completed') {
      logger.info('idempotency: replay returned stored result', { key });
      return reservation.data.result as T;
    }
    if (reservation.data.status === 'failed') {
      const err = reservation.data.error ?? {
        code: 'unknown',
        message: 'previous attempt failed',
      };
      logger.warn('idempotency: replay returned stored error', {
        key,
        code: err.code,
      });
      throw new IdempotencyReplayError(err.code, err.message);
    }
    // status === 'in_progress': another invocation is still running. Return
    // a soft error so the caller can retry once the first run finishes.
    throw new IdempotencyReplayError(
      'aborted',
      'Another invocation with the same idempotency key is in progress.',
    );
  }

  try {
    const result = await fn();
    await ref.set(
      {
        status: 'completed',
        result: result ?? null,
        completedAt: timestampNow(),
      },
      { merge: true },
    );
    return result;
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'internal';
    const message = (err as Error).message ?? String(err);
    await ref.set(
      {
        status: 'failed',
        error: { code, message },
        completedAt: timestampNow(),
      },
      { merge: true },
    );
    throw err;
  }
}

export class IdempotencyReplayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IdempotencyReplayError';
  }
}

/** Encode arbitrary input into a Firestore-safe document id. */
function encodeKey(raw: string): string {
  // Firestore document ids must not contain "/". Strip and replace anything
  // unsafe with `-`. We deliberately keep `:` because it's allowed and helps
  // human readability of the keys.
  return raw.replace(/[/\s]/g, '-').slice(0, 1500);
}
