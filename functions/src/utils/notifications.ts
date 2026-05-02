import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { NotificationType } from '../types/domain';

interface SendArgs {
  eventId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  targetUserIds: string[];
  sentByUserId: string;
  data?: Record<string, string>;
}

/**
 * Persist a notifications/{notificationId} record and send the FCM payload to
 * every device token registered for the target users. Records the final
 * delivery status for audit/troubleshooting.
 */
export async function sendNotificationToUsers(args: SendArgs): Promise<string> {
  const db = admin.firestore();
  const messaging = admin.messaging();

  const targetUserIds = uniq(args.targetUserIds);
  const notificationRef = db.collection('notifications').doc();
  const baseRecord = {
    eventId: args.eventId,
    type: args.type,
    title: args.title,
    body: args.body,
    targetUserIds,
    sentByUserId: args.sentByUserId,
    status: 'queued' as const,
    data: args.data ?? {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: null,
  };
  await notificationRef.set(baseRecord);

  if (targetUserIds.length === 0) {
    await notificationRef.update({
      status: 'sent',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return notificationRef.id;
  }

  const tokens = await loadFcmTokens(targetUserIds);
  if (tokens.length === 0) {
    logger.info('sendNotificationToUsers: no tokens for target users', {
      notificationId: notificationRef.id,
      targetUserIds,
    });
    await notificationRef.update({
      status: 'sent',
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return notificationRef.id;
  }

  let failureCount = 0;
  // sendEachForMulticast handles up to 500 tokens per call.
  for (const batch of chunk(tokens, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title: args.title, body: args.body },
      data: { ...(args.data ?? {}), type: args.type },
    });
    failureCount += response.failureCount;
  }

  const status =
    failureCount === 0
      ? 'sent'
      : failureCount === tokens.length
        ? 'failed'
        : 'partial_failure';
  await notificationRef.update({
    status,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return notificationRef.id;
}

async function loadFcmTokens(userIds: string[]): Promise<string[]> {
  const db = admin.firestore();
  const tokens: string[] = [];
  // Firestore "in" supports up to 30 values; loop in chunks.
  for (const userId of userIds) {
    const snap = await db
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
