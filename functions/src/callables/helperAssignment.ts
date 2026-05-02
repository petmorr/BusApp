import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { requireAdmin } from '../utils/auth';
import { writeAuditLog } from '../utils/audit';
import { validate, Schema } from '../utils/validation';
import { callableDefaults } from '../utils/options';
import { reportFailure } from '../utils/errors';

interface HelperAssignmentInput extends Record<string, unknown> {
  eventId: string;
  userId: string;
}

const helperAssignmentSchema: Schema = {
  eventId: { type: 'string', minLength: 1, maxLength: 200 },
  userId: { type: 'string', minLength: 1, maxLength: 200 },
};

export const assignEventHelper = onCall<HelperAssignmentInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<HelperAssignmentInput>(req.data, helperAssignmentSchema);
    try {
      await admin
        .firestore()
        .collection('events')
        .doc(data.eventId)
        .collection('helpers')
        .doc(data.userId)
        .set({
          userId: data.userId,
          assignedByAdminId: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      await writeAuditLog({
        actorUserId: uid,
        action: 'assign_event_helper',
        entityType: 'event',
        entityPath: `events/${data.eventId}/helpers/${data.userId}`,
        after: { userId: data.userId },
      });
      return { ok: true };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'assign_event_helper',
          entityType: 'event',
          entityPath: `events/${data.eventId}/helpers/${data.userId}`,
        },
        err,
      );
      throw err;
    }
  },
);

export const unassignEventHelper = onCall<HelperAssignmentInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<HelperAssignmentInput>(req.data, helperAssignmentSchema);
    try {
      await admin
        .firestore()
        .collection('events')
        .doc(data.eventId)
        .collection('helpers')
        .doc(data.userId)
        .delete();
      await writeAuditLog({
        actorUserId: uid,
        action: 'unassign_event_helper',
        entityType: 'event',
        entityPath: `events/${data.eventId}/helpers/${data.userId}`,
      });
      return { ok: true };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'unassign_event_helper',
          entityType: 'event',
          entityPath: `events/${data.eventId}/helpers/${data.userId}`,
        },
        err,
      );
      throw err;
    }
  },
);
