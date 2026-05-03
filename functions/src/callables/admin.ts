import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin, requireAuth } from '../utils/auth';
import { writeAuditLog } from '../utils/audit';
import { isCanonicalLinkId } from '../utils/links';
import { validate, Schema } from '../utils/validation';
import { callableDefaults } from '../utils/options';
import { reportFailure } from '../utils/errors';
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
 */
export const requestMemberLinkByNumber = onCall<RequestMemberLinkInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAuth(req);
    const data = validate<RequestMemberLinkInput>(
      req.data,
      requestMemberLinkSchema,
    );
    try {
      const membersSnap = await db()
        .collection('members')
        .where('memberNumber', '==', data.memberNumber)
        .limit(1)
        .get();
      if (membersSnap.empty) {
        throw new HttpsError(
          'not-found',
          'No supporter with that member number was found. Please ask an admin to add you to the supporters list first.',
        );
      }
      const memberDoc = membersSnap.docs[0];
      const memberId = memberDoc.id;
      const memberStatus =
        (memberDoc.data() as { status?: string }).status ?? 'active';
      if (memberStatus !== 'active') {
        throw new HttpsError(
          'failed-precondition',
          'That supporter record is not active.',
        );
      }
      const linkId = `${uid}_${memberId}`;
      const linkRef = db().collection('memberUserLinks').doc(linkId);
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(linkRef);
        if (snap.exists) {
          const linkData = snap.data() as { status?: string };
          if (linkData.status === 'active') {
            // Idempotent: re-requesting an already-active link is a no-op.
            return;
          }
          if (linkData.status === 'pending') {
            // Refresh the relationship + timestamp.
            tx.update(linkRef, {
              relationshipToUser: data.relationshipToUser,
              updatedAt: serverTimestamp(),
            });
            return;
          }
          // For inactive / rejected, re-open as pending.
          tx.update(linkRef, {
            status: 'pending',
            relationshipToUser: data.relationshipToUser,
            requestedDuringSignup: true,
            approvedByAdminId: null,
            approvedAt: null,
            updatedAt: serverTimestamp(),
          });
          return;
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
      });
      return { ok: true, linkId };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'request_member_link_by_number',
          entityType: 'memberUserLink',
          entityPath: 'memberUserLinks',
          extra: { memberNumber: '[REDACTED]' },
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
      await db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'Link not found.');
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
