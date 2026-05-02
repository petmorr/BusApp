import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin } from '../utils/auth';
import { writeAuditLog } from '../utils/audit';
import { isCanonicalLinkId } from '../utils/links';
import { validate, Schema } from '../utils/validation';
import { callableDefaults } from '../utils/options';
import { reportFailure } from '../utils/errors';

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
      const auth = admin.auth();
      const userRecord = await auth.getUser(data.userId);
      const claims = { ...(userRecord.customClaims ?? {}) } as Record<string, boolean>;
      claims[data.role] = data.granted;
      if (!data.granted) delete claims[data.role];
      await auth.setCustomUserClaims(data.userId, claims);

      const userRef = admin.firestore().collection('users').doc(data.userId);
      await admin.firestore().runTransaction(async (tx) => {
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
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      const ref = admin.firestore().collection('memberUserLinks').doc(data.linkId);
      // Transaction so two admins cannot both flip a pending link to active
      // and overwrite each other's approver id.
      await admin.firestore().runTransaction(async (tx) => {
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
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

export const rejectMemberUserLink = onCall<MemberLinkDecisionInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<MemberLinkDecisionInput>(req.data, memberLinkDecisionSchema);
    try {
      const ref = admin.firestore().collection('memberUserLinks').doc(data.linkId);
      await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'Link not found.');
        tx.update(ref, {
          status: 'rejected',
          approvedByAdminId: uid,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
