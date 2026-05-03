import { createHash } from 'node:crypto';
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
      // Log a hashed key — raw keys embed user/event ids that we do not
      // want in Cloud Logging indices.
      logger.info('idempotency: replay returned stored result', {
        keyHash: hashKey(key),
      });
      return reservation.data.result as T;
    }
    if (reservation.data.status === 'failed') {
      const err = reservation.data.error ?? {
        code: 'unknown',
        message: 'previous attempt failed',
      };
      logger.warn('idempotency: replay returned stored error', {
        keyHash: hashKey(key),
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

/**
 * Encode an arbitrary idempotency key into a Firestore-safe document id.
 *
 * Strategy: sanitise the key for readability (so an operator browsing the
 * `idempotencyKeys` collection can still make sense of it) AND suffix the
 * truncated key with a SHA-256 hash of the full key. Without the hash,
 * distinct long keys that share a 1500-char prefix would collide into the
 * same document and wrongly observe each other's stored results.
 */
function encodeKey(raw: string): string {
  const safe = raw.replace(/[/\s]/g, '-');
  if (safe.length <= 1400) return safe;
  const prefix = safe.slice(0, 1400);
  return `${prefix}:${hashKey(raw)}`;
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
