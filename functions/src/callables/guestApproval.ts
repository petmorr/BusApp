import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin } from '../utils/auth';
import { sendNotificationToUsers } from '../utils/notifications';
import { writeAuditLog } from '../utils/audit';

interface DecisionInput {
  eventId: string;
  guestRequestId: string;
  reason?: string;
}

async function setGuestStatus(
  uid: string,
  input: DecisionInput,
  status: 'approved' | 'rejected',
): Promise<void> {
  if (!input.eventId || !input.guestRequestId) {
    throw new HttpsError('invalid-argument', 'eventId and guestRequestId are required.');
  }
  const db = admin.firestore();
  const ref = db
    .collection('events')
    .doc(input.eventId)
    .collection('guestRequests')
    .doc(input.guestRequestId);

  const before = (await ref.get()).data();
  if (!before) {
    throw new HttpsError('not-found', 'Guest request not found.');
  }
  if (before.status !== 'pending') {
    throw new HttpsError(
      'failed-precondition',
      `Guest request is already ${before.status}.`,
    );
  }

  await ref.update({
    status,
    decisionByAdminId: uid,
    decisionAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUserId: uid,
    action: status === 'approved' ? 'approve_guest_request' : 'reject_guest_request',
    entityType: 'guestRequest',
    entityPath: ref.path,
    before,
    after: { ...before, status },
  });

  await sendNotificationToUsers({
    eventId: input.eventId,
    type: status === 'approved' ? 'guest_approved' : 'guest_rejected',
    title: status === 'approved' ? 'Guest seat approved' : 'Guest seat rejected',
    body:
      status === 'approved'
        ? `Your guest "${before.guestName}" has been approved.`
        : `Your guest "${before.guestName}" was not approved.`,
    targetUserIds: [before.requestedByUserId],
    sentByUserId: uid,
    data: { eventId: input.eventId, screen: 'event_detail' },
  });
}

export const approveGuestRequest = onCall<DecisionInput>(async (req) => {
  const { uid } = requireAdmin(req);
  await setGuestStatus(uid, req.data, 'approved');
  return { ok: true };
});

export const rejectGuestRequest = onCall<DecisionInput>(async (req) => {
  const { uid } = requireAdmin(req);
  await setGuestStatus(uid, req.data, 'rejected');
  return { ok: true };
});
