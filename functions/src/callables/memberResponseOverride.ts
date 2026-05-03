import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin } from '../utils/auth';
import { writeAuditLog } from '../utils/audit';
import { validate, Schema } from '../utils/validation';
import { callableDefaults } from '../utils/options';
import { reportFailure } from '../utils/errors';
import { db, serverTimestamp } from '../utils/firestore';

interface OverrideMemberResponseInput extends Record<string, unknown> {
  eventId: string;
  memberId: string;
  status: 'attending' | 'not_attending';
  outboundPickupStopId?: string | null;
  returnDropoffStopId?: string | null;
  generalNotes?: string;
}

const overrideMemberResponseSchema: Schema = {
  eventId: { type: 'string', minLength: 1, maxLength: 200 },
  memberId: { type: 'string', minLength: 1, maxLength: 200 },
  status: { type: 'string', enum: ['attending', 'not_attending'] as const },
  outboundPickupStopId: { type: 'string', optional: true, maxLength: 200 },
  returnDropoffStopId: { type: 'string', optional: true, maxLength: 200 },
  generalNotes: { type: 'string', optional: true, maxLength: 1000 },
};

/**
 * Admin override for a single member's attendance response.
 *
 * Spec touchpoints:
 *
 * - "Allow admins to manually override a member/event response if someone
 *   confirms outside the app." (Should-have list).
 * - "Admins can override after cutoff." (Cutoff-enforcement section).
 * - The runbook tells admins to "open a member response and tap
 *   **Override**". The audit trail must mark the response as
 *   admin-overridden.
 *
 * Why a callable rather than a direct write:
 *
 * - The Firestore rules already let an admin write any memberResponse, but
 *   running through a callable keeps the audit log and the denormalised
 *   `eventTitle` / `eventDate` / `memberDisplayName` fields consistent
 *   server-side without trusting a client to populate them. It also lets
 *   us bypass cutoff enforcement deliberately and explicitly, instead of
 *   leaning on the rule layer, which is the source of truth for the user
 *   path but cannot easily express "block users after cutoff, allow admins
 *   anytime".
 */
export const overrideMemberResponse = onCall<OverrideMemberResponseInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<OverrideMemberResponseInput>(
      req.data,
      overrideMemberResponseSchema,
    );
    try {
      const eventRef = db().collection('events').doc(data.eventId);
      const memberRef = db().collection('members').doc(data.memberId);
      const responseRef = eventRef
        .collection('memberResponses')
        .doc(data.memberId);

      const [eventSnap, memberSnap, beforeSnap] = await Promise.all([
        eventRef.get(),
        memberRef.get(),
        responseRef.get(),
      ]);

      if (!eventSnap.exists) {
        throw new HttpsError('not-found', 'Event not found.');
      }
      if (!memberSnap.exists) {
        throw new HttpsError('not-found', 'Member not found.');
      }
      const event = eventSnap.data() as {
        title?: string;
        eventDate?: FirebaseFirestore.Timestamp | null;
      };
      const member = memberSnap.data() as { displayName?: string };
      const before = beforeSnap.exists
        ? (beforeSnap.data() as Record<string, unknown>)
        : null;

      const payload = {
        memberId: data.memberId,
        respondingUserId: uid,
        status: data.status,
        outboundPickupStopId: data.outboundPickupStopId ?? null,
        returnDropoffStopId: data.returnDropoffStopId ?? null,
        generalNotes: data.generalNotes ?? '',
        isAdminOverride: true,
        overriddenByAdminId: uid,
        eventId: data.eventId,
        eventTitle: event.title ?? '',
        eventDate: event.eventDate ?? null,
        memberDisplayName: member.displayName ?? data.memberId,
        updatedAt: serverTimestamp(),
        ...(before ? {} : { createdAt: serverTimestamp() }),
      };

      await responseRef.set(payload, { merge: true });

      await writeAuditLog({
        actorUserId: uid,
        action: 'override_member_response',
        entityType: 'memberResponse',
        entityPath: responseRef.path,
        before: before ?? undefined,
        after: payload,
      });

      return { ok: true };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'override_member_response',
          entityType: 'memberResponse',
          entityPath: `events/${data.eventId}/memberResponses/${data.memberId}`,
        },
        err,
      );
      throw err;
    }
  },
);
