import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin } from '../utils/auth';
import { writeAuditLog } from '../utils/audit';

interface HelperAssignmentInput {
  eventId: string;
  userId: string;
}

export const assignEventHelper = onCall<HelperAssignmentInput>(async (req) => {
  const { uid } = requireAdmin(req);
  const { eventId, userId } = req.data ?? ({} as HelperAssignmentInput);
  if (!eventId || !userId) {
    throw new HttpsError('invalid-argument', 'eventId and userId are required.');
  }

  await admin
    .firestore()
    .collection('events')
    .doc(eventId)
    .collection('helpers')
    .doc(userId)
    .set({
      userId,
      assignedByAdminId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  await writeAuditLog({
    actorUserId: uid,
    action: 'assign_event_helper',
    entityType: 'event',
    entityPath: `events/${eventId}/helpers/${userId}`,
    after: { userId },
  });
  return { ok: true };
});

export const unassignEventHelper = onCall<HelperAssignmentInput>(async (req) => {
  const { uid } = requireAdmin(req);
  const { eventId, userId } = req.data ?? ({} as HelperAssignmentInput);
  if (!eventId || !userId) {
    throw new HttpsError('invalid-argument', 'eventId and userId are required.');
  }
  await admin
    .firestore()
    .collection('events')
    .doc(eventId)
    .collection('helpers')
    .doc(userId)
    .delete();
  await writeAuditLog({
    actorUserId: uid,
    action: 'unassign_event_helper',
    entityType: 'event',
    entityPath: `events/${eventId}/helpers/${userId}`,
  });
  return { ok: true };
});
