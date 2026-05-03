import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db, serverTimestamp, timestampNow } from './firestore';

/**
 * Minimal, dependency-free per-key rate limiter backed by Firestore.
 *
 * Use case: callables that accept a user-supplied lookup value (e.g.
 * `memberNumber`) need a rate limit so an attacker cannot enumerate the
 * value space. The callable's per-user rate is more important than
 * microsecond-accurate accounting, so we use a fixed-window counter with
 * a jittered window that is cheap to reason about:
 *
 *   rateLimits/{key}
 *     windowStartMs: number  // epoch ms at which the current window began
 *     count:         number  // calls observed in the current window
 *     updatedAt:     Timestamp
 *
 * A single transaction reads the doc, decides whether we are still in the
 * window, and either increments the counter or resets it. If the counter
 * would exceed `max`, we throw `resource-exhausted` which Firebase surfaces
 * to the client as an HTTP 429.
 *
 * Limits:
 *
 * - Fixed-window counters are coarser than token-bucket but perfectly fine
 *   for the "don't let one user enumerate 10k member numbers" use case.
 * - The doc is updated on every call, so the limit is Firestore-bound,
 *   which is more than sufficient here (we are rate-limiting humans, not
 *   high-throughput services).
 * - The caller is responsible for composing a key that is specific enough
 *   to avoid collisions across callables (e.g.
 *   `requestMemberLinkByNumber:${uid}`).
 */
export interface RateLimitOptions {
  /** Stable identifier for the limited subject (e.g. "cb:uid"). */
  key: string;
  /** Maximum number of calls permitted in the window. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export async function enforceRateLimit(opts: RateLimitOptions): Promise<void> {
  if (!opts.key) throw new Error('enforceRateLimit requires a non-empty key.');
  if (opts.max <= 0 || opts.windowMs <= 0) {
    throw new Error('enforceRateLimit requires positive max + windowMs.');
  }

  const ref = db().collection('rateLimits').doc(encodeKey(opts.key));
  const nowMs = Date.now();

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStartMs?: number; count?: number })
      : undefined;
    const windowStartMs = data?.windowStartMs ?? 0;
    const count = data?.count ?? 0;

    const inWindow = nowMs - windowStartMs < opts.windowMs;
    const nextCount = inWindow ? count + 1 : 1;
    const nextWindowStart = inWindow ? windowStartMs : nowMs;

    if (nextCount > opts.max) {
      const retryAfterMs = opts.windowMs - (nowMs - windowStartMs);
      // Log the hashed key rather than the raw key, which would contain
      // the subject uid. Hashed keys are still enough to correlate
      // repeat-offender log lines across invocations.
      logger.warn('rate limit exceeded', {
        keyHash: hashKey(opts.key),
        max: opts.max,
        windowMs: opts.windowMs,
        retryAfterMs,
      });
      throw new HttpsError(
        'resource-exhausted',
        'Too many requests. Please wait a moment and try again.',
      );
    }

    tx.set(
      ref,
      {
        windowStartMs: nextWindowStart,
        count: nextCount,
        updatedAt: serverTimestamp(),
        lastObservedAt: timestampNow(),
      },
      { merge: true },
    );
  });
}

function encodeKey(raw: string): string {
  return raw.replace(/[/\s]/g, '-').slice(0, 1500);
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}
