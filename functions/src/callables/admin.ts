import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin } from '../utils/auth';
import { writeAuditLog } from '../utils/audit';
import { isCanonicalLinkId } from '../utils/links';

interface SetUserRoleInput {
  userId: string;
  role: 'user' | 'helper' | 'admin';
  granted: boolean;
}

/**
 * Grant or revoke the helper / admin role for a user. Mirrors the change to
 * (a) Firebase Auth custom claims and (b) the `roles` array on the
 * users/{userId} document for easy querying.
 */
export const setUserRole = onCall<SetUserRoleInput>(async (req) => {
  const { uid } = requireAdmin(req);
  const { userId, role, granted } = req.data ?? ({} as SetUserRoleInput);
  if (!userId || !role || typeof granted !== 'boolean') {
    throw new HttpsError('invalid-argument', 'userId, role and granted are required.');
  }
  if (role === 'user') {
    throw new HttpsError('invalid-argument', '"user" role is implicit and cannot be granted/revoked.');
  }

  const auth = admin.auth();
  const userRecord = await auth.getUser(userId);
  const claims = { ...(userRecord.customClaims ?? {}) } as Record<string, boolean>;
  claims[role] = granted;
  if (!granted) delete claims[role];
  await auth.setCustomUserClaims(userId, claims);

  const userRef = admin.firestore().collection('users').doc(userId);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'User profile not found.');
    }
    const roles: string[] = (snap.data()?.roles as string[]) ?? ['user'];
    const next = new Set(roles);
    if (granted) next.add(role);
    else next.delete(role);
    next.add('user');
    tx.update(userRef, {
      roles: Array.from(next),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await writeAuditLog({
    actorUserId: uid,
    action: granted ? `grant_${role}` : `revoke_${role}`,
    entityType: 'user',
    entityPath: `users/${userId}`,
    after: { role, granted },
  });
  return { ok: true };
});

interface MemberLinkDecisionInput {
  linkId: string;
}

export const approveMemberUserLink = onCall<MemberLinkDecisionInput>(async (req) => {
  const { uid } = requireAdmin(req);
  const { linkId } = req.data ?? ({} as MemberLinkDecisionInput);
  if (!linkId) throw new HttpsError('invalid-argument', 'linkId is required.');

  const ref = admin.firestore().collection('memberUserLinks').doc(linkId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Link not found.');
  const data = snap.data() as { status: string; userId: string; memberId: string };
  if (data.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Link is not pending.');
  }
  if (!isCanonicalLinkId(linkId, data.userId, data.memberId)) {
    throw new HttpsError(
      'failed-precondition',
      'Link id does not match the canonical `${userId}_${memberId}` format.',
    );
  }

  await ref.update({
    status: 'active',
    approvedByAdminId: uid,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUserId: uid,
    action: 'approve_member_user_link',
    entityType: 'memberUserLink',
    entityPath: ref.path,
  });
  return { ok: true };
});

export const rejectMemberUserLink = onCall<MemberLinkDecisionInput>(async (req) => {
  const { uid } = requireAdmin(req);
  const { linkId } = req.data ?? ({} as MemberLinkDecisionInput);
  if (!linkId) throw new HttpsError('invalid-argument', 'linkId is required.');

  const ref = admin.firestore().collection('memberUserLinks').doc(linkId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Link not found.');

  await ref.update({
    status: 'rejected',
    approvedByAdminId: uid,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUserId: uid,
    action: 'reject_member_user_link',
    entityType: 'memberUserLink',
    entityPath: ref.path,
  });
  return { ok: true };
});
