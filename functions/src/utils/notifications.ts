import { logger } from 'firebase-functions/v2';
import { NotificationType } from '../types/domain';
import { db, messaging, serverTimestamp } from './firestore';

interface SendArgs {
  eventId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  targetUserIds: string[];
  sentByUserId: string;
  data?: Record<string, string>;
  /**
   * Optional deterministic id. When provided, repeated calls with the same
   * id are deduplicated: the first call writes the notifications/{id}
   * record and dispatches FCM, subsequent calls observe the existing
   * record and return without re-sending. This protects against duplicate
   * sends when a callable is retried by the platform or by a user
   * tapping a button twice. Without an idempotencyKey, every call writes
   * a fresh document (existing behaviour).
   */
  idempotencyKey?: string;
}

/**
 * Persist a notifications/{notificationId} record and send the FCM payload to
 * every device token registered for the target users. Records the final
 * delivery status for audit/troubleshooting.
 *
 * Side-effect failure policy:
 *
 * - Database write failure: bubble up. The caller is expected to surface the
 *   error and let the platform retry (callable returns 500; trigger retries).
 * - FCM partial delivery: the notifications/{id} record is updated to
 *   `partial_failure` so operators can see which sends did not succeed,
 *   but the function returns success. Per-token failures are not
 *   actionable from the caller's perspective.
 * - FCM total failure: the record is set to `failed` and the function
 *   returns success rather than throwing, again because the failure is
 *   already auditable in Firestore and re-running the callable would
 *   produce duplicate notifications. Operators should investigate via
 *   the runbook (`docs/runbooks/notifications.md`).
 */
export async function sendNotificationToUsers(args: SendArgs): Promise<string> {
  const firestore = db();

  const targetUserIds = uniq(args.targetUserIds);
  const notifId = args.idempotencyKey
    ? encodeId(args.idempotencyKey)
    : firestore.collection('notifications').doc().id;
  const notificationRef = firestore.collection('notifications').doc(notifId);

  if (args.idempotencyKey) {
    const existing = await notificationRef.get();
    if (existing.exists) {
      logger.info('sendNotificationToUsers: idempotent replay, skipping send', {
        notificationId: notifId,
        type: args.type,
      });
      return notifId;
    }
  }

  await notificationRef.set({
    eventId: args.eventId,
    type: args.type,
    title: args.title,
    body: args.body,
    targetUserIds,
    sentByUserId: args.sentByUserId,
    status: 'queued' as const,
    data: args.data ?? {},
    idempotencyKey: args.idempotencyKey ?? null,
    createdAt: serverTimestamp(),
    sentAt: null,
  });

  if (targetUserIds.length === 0) {
    await notificationRef.update({
      status: 'sent',
      sentAt: serverTimestamp(),
    });
    return notifId;
  }

  const tokens = await loadFcmTokens(targetUserIds);
  if (tokens.length === 0) {
    logger.info('sendNotificationToUsers: no tokens for target users', {
      notificationId: notifId,
      targetUserIds,
    });
    await notificationRef.update({
      status: 'sent',
      sentAt: serverTimestamp(),
    });
    return notifId;
  }

  let failureCount = 0;
  try {
    for (const batch of chunk(tokens, 500)) {
      const response = await messaging().sendEachForMulticast({
        tokens: batch,
        notification: { title: args.title, body: args.body },
        data: { ...(args.data ?? {}), type: args.type },
      });
      failureCount += response.failureCount;
    }
  } catch (err) {
    // The emulator does not support FCM; treat the entire batch as failed
    // and persist the status so audit/runbook investigation can pick it up.
    logger.warn('sendNotificationToUsers: FCM dispatch threw', {
      notificationId: notifId,
      message: (err as Error)?.message,
    });
    await notificationRef.update({
      status: 'failed',
      failureCount: tokens.length,
      tokenCount: tokens.length,
      sentAt: serverTimestamp(),
    });
    return notifId;
  }

  const status =
    failureCount === 0
      ? 'sent'
      : failureCount === tokens.length
        ? 'failed'
        : 'partial_failure';
  await notificationRef.update({
    status,
    failureCount,
    tokenCount: tokens.length,
    sentAt: serverTimestamp(),
  });
  return notifId;
}

async function loadFcmTokens(userIds: string[]): Promise<string[]> {
  const firestore = db();
  const tokens: string[] = [];
  for (const userId of userIds) {
    const snap = await firestore
      .collection('users')
      .doc(userId)
      .collection('fcmTokens')
      .get();
    snap.forEach((doc) => {
      const data = doc.data() as { token?: string };
      if (data.token) tokens.push(data.token);
    });
  }
  return uniq(tokens);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function encodeId(raw: string): string {
  return raw.replace(/[/\s]/g, '-').slice(0, 1500);
}
