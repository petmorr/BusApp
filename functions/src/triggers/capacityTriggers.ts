import {
  onDocumentWritten,
  Change,
  FirestoreEvent,
} from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { recalculateEventCapacity } from '../utils/recalculateEventCapacity';
import { classify } from '../utils/errors';

/**
 * Trigger handlers wrap recalculation in a classify() so that:
 *
 *   - Permanent errors (invalid argument, not found) are logged and
 *     swallowed — re-running won't help and we don't want to keep retrying
 *     forever.
 *   - Transient errors (Firestore unavailable, internal) are re-thrown so
 *     the platform retries the trigger automatically.
 *
 * Recalculation itself is idempotent: it always reads the current state and
 * writes the same derived totals, so duplicate invocations only cost a
 * couple of reads + a write.
 */
async function safeRecalc(eventId: string, source: string): Promise<void> {
  try {
    await recalculateEventCapacity(eventId);
  } catch (err) {
    const c = classify(err);
    logger.error('capacity recalculation failed', {
      source,
      eventId,
      classification: c.classification,
      code: c.httpsCode,
      retryable: c.retryable,
      message: c.message,
    });
    if (c.retryable) throw err;
  }
}

export const onMemberResponseWrite = onDocumentWritten(
  'events/{eventId}/memberResponses/{memberId}',
  async (event) => {
    await safeRecalc(event.params.eventId, 'memberResponseWrite');
  },
);

export const onGuestRequestWrite = onDocumentWritten(
  'events/{eventId}/guestRequests/{guestRequestId}',
  async (event) => {
    await safeRecalc(event.params.eventId, 'guestRequestWrite');
  },
);

export const onEventCapacityWrite = onDocumentWritten(
  'events/{eventId}',
  async (
    event: FirestoreEvent<Change<any> | undefined, { eventId: string }>,
  ) => {
    if (!event.data) return;
    const before = event.data.before?.data();
    const after = event.data.after?.data();
    if (!after) return;

    const capacityChanged =
      !before ||
      before.capacityMax !== after.capacityMax ||
      before.capacityNearThresholdPercent !==
        after.capacityNearThresholdPercent;
    if (capacityChanged) {
      await safeRecalc(event.params.eventId, 'eventCapacityWrite');
    }
  },
);
