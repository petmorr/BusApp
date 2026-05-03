import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin } from '../utils/auth';
import { writeAuditLog } from '../utils/audit';
import { validate, Schema } from '../utils/validation';
import { callableDefaults } from '../utils/options';
import { reportFailure } from '../utils/errors';
import { authAdmin, db, serverTimestamp } from '../utils/firestore';

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
      // Validate the event exists. Without this check an admin typo (or
      // forged input bypassing UI validation) would silently create a
      // helper doc under a non-existent event id, which cannot be cleaned
      // up through the UI.
      const eventSnap = await db()
        .collection('events')
        .doc(data.eventId)
        .get();
      if (!eventSnap.exists) {
        throw new HttpsError('not-found', 'Event not found.');
      }

      // Validate the target user exists in Auth and holds the helper
      // custom claim. The Firestore rules rely on `isHelper()` (custom
      // claim), so assigning an arbitrary uid here would create an
      // assignment the user cannot actually exercise — worse, it would
      // look to admins like the assignment was valid. Failing loudly
      // forces the admin to grant the helper role first.
      const userRecord = await authAdmin()
        .getUser(data.userId)
        .catch(() => {
          throw new HttpsError(
            'failed-precondition',
            'Target user does not exist.',
          );
        });
      const claims = (userRecord.customClaims ?? {}) as Record<string, boolean>;
      if (claims.helper !== true && claims.admin !== true) {
        throw new HttpsError(
          'failed-precondition',
          'Target user does not have the helper role. Grant the helper role before assigning.',
        );
      }

      await db()
        .collection('events')
        .doc(data.eventId)
        .collection('helpers')
        .doc(data.userId)
        .set({
          userId: data.userId,
          assignedByAdminId: uid,
          createdAt: serverTimestamp(),
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
      await db()
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
