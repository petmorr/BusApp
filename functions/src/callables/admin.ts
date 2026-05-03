import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin, requireAuth } from '../utils/auth';
import { writeAuditLog } from '../utils/audit';
import { isCanonicalLinkId } from '../utils/links';
import { validate, Schema } from '../utils/validation';
import { callableDefaults } from '../utils/options';
import { reportFailure } from '../utils/errors';
import { enforceRateLimit } from '../utils/rateLimit';
import { authAdmin, db, serverTimestamp } from '../utils/firestore';

interface SetUserRoleInput extends Record<string, unknown> {
  userId: string;
  role: 'helper' | 'admin';
  granted: boolean;
}

const setUserRoleSchema: Schema = {
  userId: { type: 'string', minLength: 1, maxLength: 200 },
  role: { type: 'string', enum: ['helper', 'admin'] as const },
  granted: { type: 'boolean' },
};

/**
 * Grant or revoke the helper / admin role for a user. Mirrors the change to
 * (a) Firebase Auth custom claims and (b) the `roles` array on the
 * users/{userId} document for easy querying.
 */
export const setUserRole = onCall<SetUserRoleInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<SetUserRoleInput>(req.data, setUserRoleSchema);
    try {
      const auth = authAdmin();
      const userRecord = await auth.getUser(data.userId);
      const claims = { ...(userRecord.customClaims ?? {}) } as Record<string, boolean>;
      claims[data.role] = data.granted;
      if (!data.granted) delete claims[data.role];
      await auth.setCustomUserClaims(data.userId, claims);

      const userRef = db().collection('users').doc(data.userId);
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) {
          throw new HttpsError('not-found', 'User profile not found.');
        }
        const roles: string[] = (snap.data()?.roles as string[]) ?? ['user'];
        const next = new Set(roles);
        if (data.granted) next.add(data.role);
        else next.delete(data.role);
        next.add('user');
        tx.update(userRef, {
          roles: Array.from(next),
          updatedAt: serverTimestamp(),
        });
      });

      await writeAuditLog({
        actorUserId: uid,
        action: data.granted ? `grant_${data.role}` : `revoke_${data.role}`,
        entityType: 'user',
        entityPath: `users/${data.userId}`,
        after: { role: data.role, granted: data.granted },
      });
      return { ok: true };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'set_user_role',
          entityType: 'user',
          entityPath: `users/${data.userId}`,
          extra: { role: data.role, granted: data.granted },
        },
        err,
      );
      throw err;
    }
  },
);

interface MemberLinkDecisionInput extends Record<string, unknown> {
  linkId: string;
}

const memberLinkDecisionSchema: Schema = {
  linkId: { type: 'string', minLength: 1, maxLength: 400 },
};

export const approveMemberUserLink = onCall<MemberLinkDecisionInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<MemberLinkDecisionInput>(req.data, memberLinkDecisionSchema);
    try {
      const ref = db().collection('memberUserLinks').doc(data.linkId);
      // Transaction so two admins cannot both flip a pending link to active
      // and overwrite each other's approver id.
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'Link not found.');
        const linkData = snap.data() as {
          status: string;
          userId: string;
          memberId: string;
        };
        if (linkData.status !== 'pending') {
          throw new HttpsError('failed-precondition', 'Link is not pending.');
        }
        if (!isCanonicalLinkId(data.linkId, linkData.userId, linkData.memberId)) {
          throw new HttpsError(
            'failed-precondition',
            'Link id does not match the canonical `${userId}_${memberId}` format.',
          );
        }
        tx.update(ref, {
          status: 'active',
          approvedByAdminId: uid,
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await writeAuditLog({
        actorUserId: uid,
        action: 'approve_member_user_link',
        entityType: 'memberUserLink',
        entityPath: ref.path,
      });
      return { ok: true };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'approve_member_user_link',
          entityType: 'memberUserLink',
          entityPath: `memberUserLinks/${data.linkId}`,
        },
        err,
      );
      throw err;
    }
  },
);

interface RequestMemberLinkInput extends Record<string, unknown> {
  memberNumber: string;
  relationshipToUser: 'self' | 'child' | 'dependent' | 'other';
}

const requestMemberLinkSchema: Schema = {
  memberNumber: { type: 'string', minLength: 1, maxLength: 50 },
  relationshipToUser: {
    type: 'string',
    enum: ['self', 'child', 'dependent', 'other'] as const,
  },
};

/**
 * Lets a signed-in user request a *pending* link to a supporter without
 * needing to read the (admin-only) members directory client-side. The
 * Firestore rules deliberately deny `list` on members to non-admins for
 * privacy reasons, so the lookup-by-number is performed here with admin
 * privileges. The created link is always `pending` and must be approved
 * by an admin via `approveMemberUserLink` before the user gains read
 * access to that member.
 *
 * Privacy + abuse-resistance posture (deliberate trade-offs):
 *
 * - **Indistinguishable outcomes.** The caller sees the same generic
 *   response whether the member number is unknown, matches an inactive
 *   record, matches an already-rejected link, or produces a fresh
 *   pending link. This closes an enumeration oracle: otherwise a
 *   signed-in attacker could walk the member-number space and infer
 *   which numbers correspond to real, active supporters.
 * - **Per-uid rate limit.** A Firestore-backed fixed-window counter
 *   throttles lookups to a small number per window per user. This
 *   makes a meaningful enumeration attack impractical even under the
 *   generic-response regime.
 * - **Sticky rejections.** Once an admin rejects a link, the callable
 *   refuses to flip it back to `pending`. The user receives the same
 *   generic "submitted" response; only an admin can re-open the link.
 *   This preserves the meaning of a rejection as an explicit admin
 *   decision rather than a transient state.
 * - **Always audit-log.** Every invocation writes an audit entry
 *   describing the *outcome class* (created / updated-pending / already-
 *   active / sticky-reject / unknown-number / member-inactive) without
 *   logging the raw member number, so admins can investigate abuse
 *   without the log itself becoming a PII store.
 */
export const requestMemberLinkByNumber = onCall<RequestMemberLinkInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAuth(req);
    const data = validate<RequestMemberLinkInput>(
      req.data,
      requestMemberLinkSchema,
    );

    // Per-uid rate limit. Keep the window short and the cap low — the
    // legitimate workflow is "user types their number once at signup",
    // so anything beyond a handful of calls per hour is almost certainly
    // enumeration or a client bug.
    await enforceRateLimit({
      key: `requestMemberLinkByNumber:${uid}`,
      max: 10,
      windowMs: 60 * 60 * 1000,
    });

    type Outcome =
      | 'created'
      | 'updated_pending'
      | 'already_active'
      | 'sticky_rejected'
      | 'unknown_number'
      | 'member_inactive';

    let outcome: Outcome;
    let linkId: string | null = null;

    try {
      const membersSnap = await db()
        .collection('members')
        .where('memberNumber', '==', data.memberNumber)
        .limit(1)
        .get();

      if (membersSnap.empty) {
        outcome = 'unknown_number';
      } else {
        const memberDoc = membersSnap.docs[0];
        const memberId = memberDoc.id;
        const memberStatus =
          (memberDoc.data() as { status?: string }).status ?? 'active';

        if (memberStatus !== 'active') {
          outcome = 'member_inactive';
        } else {
          linkId = `${uid}_${memberId}`;
          const linkRef = db().collection('memberUserLinks').doc(linkId);
          outcome = await db().runTransaction(async (tx): Promise<Outcome> => {
            const snap = await tx.get(linkRef);
            if (snap.exists) {
              const linkData = snap.data() as { status?: string };
              if (linkData.status === 'active') {
                return 'already_active';
              }
              if (linkData.status === 'rejected') {
                // Sticky: a rejection is an explicit admin decision. The user
                // must contact an admin to re-open. We intentionally do NOT
                // mutate the doc so the rejection metadata is preserved.
                return 'sticky_rejected';
              }
              if (linkData.status === 'pending') {
                tx.update(linkRef, {
                  relationshipToUser: data.relationshipToUser,
                  updatedAt: serverTimestamp(),
                });
                return 'updated_pending';
              }
              // Any other status (e.g. "inactive") — re-open as pending.
              tx.update(linkRef, {
                status: 'pending',
                relationshipToUser: data.relationshipToUser,
                requestedDuringSignup: true,
                approvedByAdminId: null,
                approvedAt: null,
                updatedAt: serverTimestamp(),
              });
              return 'updated_pending';
            }
            tx.set(linkRef, {
              userId: uid,
              memberId,
              status: 'pending',
              relationshipToUser: data.relationshipToUser,
              requestedDuringSignup: true,
              createdByAdminId: null,
              approvedByAdminId: null,
              approvedAt: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            return 'created';
          });
        }
      }

      // Always audit-log, but never log the raw member number — we log the
      // outcome class so operators can detect enumeration patterns (many
      // `unknown_number` entries from one uid) without the audit log itself
      // becoming a privacy risk.
      await writeAuditLog({
        actorUserId: uid,
        action: 'request_member_link_by_number',
        entityType: 'memberUserLink',
        entityPath: linkId ? `memberUserLinks/${linkId}` : 'memberUserLinks',
        after: { outcome },
      });

      // Indistinguishable response across all outcomes. The client's UI
      // says "If that member number matched, an admin will review it."
      return { ok: true };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'request_member_link_by_number',
          entityType: 'memberUserLink',
          entityPath: 'memberUserLinks',
        },
        err,
      );
      throw err;
    }
  },
);

export const rejectMemberUserLink = onCall<MemberLinkDecisionInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<MemberLinkDecisionInput>(req.data, memberLinkDecisionSchema);
    try {
      const ref = db().collection('memberUserLinks').doc(data.linkId);
      // Enforce the same invariants as approveMemberUserLink: the link
      // must exist, be pending, and use the canonical id. Rejecting a
      // non-pending link (already active / already rejected) should be a
      // conflict, not a silent state flip.
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'Link not found.');
        const linkData = snap.data() as {
          status: string;
          userId: string;
          memberId: string;
        };
        if (linkData.status !== 'pending') {
          throw new HttpsError('failed-precondition', 'Link is not pending.');
        }
        if (!isCanonicalLinkId(data.linkId, linkData.userId, linkData.memberId)) {
          throw new HttpsError(
            'failed-precondition',
            'Link id does not match the canonical `${userId}_${memberId}` format.',
          );
        }
        tx.update(ref, {
          status: 'rejected',
          approvedByAdminId: uid,
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await writeAuditLog({
        actorUserId: uid,
        action: 'reject_member_user_link',
        entityType: 'memberUserLink',
        entityPath: ref.path,
      });
      return { ok: true };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'reject_member_user_link',
          entityType: 'memberUserLink',
          entityPath: `memberUserLinks/${data.linkId}`,
        },
        err,
      );
      throw err;
    }
  },
);
