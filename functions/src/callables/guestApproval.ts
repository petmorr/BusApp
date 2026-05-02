import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin } from '../utils/auth';
import { sendNotificationToUsers } from '../utils/notifications';
import { writeAuditLog } from '../utils/audit';
import { validate } from '../utils/validation';
import { callableDefaults } from '../utils/options';
import { withIdempotency } from '../utils/idempotency';
import { reportFailure } from '../utils/errors';
import { db, serverTimestamp } from '../utils/firestore';

interface DecisionInput extends Record<string, unknown> {
  eventId: string;
  guestRequestId: string;
  /**
   * Optional client-supplied idempotency key. When the same key is replayed
   * the function returns the previously stored result instead of running
   * the decision a second time. Recommended for production clients.
   */
  idempotencyKey?: string;
}

const decisionSchema = {
  eventId: { type: 'string' as const, minLength: 1, maxLength: 200 },
  guestRequestId: { type: 'string' as const, minLength: 1, maxLength: 200 },
  idempotencyKey: { type: 'string' as const, optional: true, maxLength: 200 },
};

async function setGuestStatus(
  uid: string,
  input: DecisionInput,
  status: 'approved' | 'rejected',
): Promise<{ ok: true; status: 'approved' | 'rejected' }> {
  const firestore = db();
  const ref = firestore
    .collection('events')
    .doc(input.eventId)
    .collection('guestRequests')
    .doc(input.guestRequestId);

  // Single transaction:
  //   1. Read the guest request.
  //   2. Reject if it has already been decided (failed-precondition).
  //   3. Write the new decision + admin id + server-time decisionAt.
  // This closes the race where two admins could both press Approve at the
  // same moment, otherwise the second write would silently overwrite the
  // first decision (and any audit-log split-brain that follows).
  const before = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Guest request not found.');
    }
    const data = snap.data() as { status: string; requestedByUserId: string; guestName: string };
    if (data.status !== 'pending') {
      throw new HttpsError(
        'failed-precondition',
        `Guest request is already ${data.status}.`,
      );
    }
    tx.update(ref, {
      status,
      decisionByAdminId: uid,
      decisionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return data;
  });

  await writeAuditLog({
    actorUserId: uid,
    action: status === 'approved' ? 'approve_guest_request' : 'reject_guest_request',
    entityType: 'guestRequest',
    entityPath: ref.path,
    before,
    after: { ...before, status },
  });

  // Notification id is deterministic so a retry of this callable does not
  // produce a second push for the same decision.
  const notificationId = `guest-decision:${ref.path}:${status}`;
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
    idempotencyKey: notificationId,
  });

  return { ok: true, status };
}

export const approveGuestRequest = onCall<DecisionInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<DecisionInput>(req.data, decisionSchema);
    const key = data.idempotencyKey
      ? `guest-approve:${data.eventId}:${data.guestRequestId}:${data.idempotencyKey}`
      : `guest-approve:${data.eventId}:${data.guestRequestId}`;
    try {
      return await withIdempotency(key, 24 * 60 * 60 * 1000, () =>
        setGuestStatus(uid, data, 'approved'),
      );
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'approve_guest_request',
          entityType: 'guestRequest',
          entityPath: `events/${data.eventId}/guestRequests/${data.guestRequestId}`,
        },
        err,
      );
      throw err;
    }
  },
);

export const rejectGuestRequest = onCall<DecisionInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<DecisionInput>(req.data, decisionSchema);
    const key = data.idempotencyKey
      ? `guest-reject:${data.eventId}:${data.guestRequestId}:${data.idempotencyKey}`
      : `guest-reject:${data.eventId}:${data.guestRequestId}`;
    try {
      return await withIdempotency(key, 24 * 60 * 60 * 1000, () =>
        setGuestStatus(uid, data, 'rejected'),
      );
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'reject_guest_request',
          entityType: 'guestRequest',
          entityPath: `events/${data.eventId}/guestRequests/${data.guestRequestId}`,
        },
        err,
      );
      throw err;
    }
  },
);
