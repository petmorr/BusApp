import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

import { getAdmin, makeCaller, resetEmulators } from './helpers';

beforeEach(async () => {
  await resetEmulators();
});

describe('E2E: login + profile creation + signup link request', () => {
  it('a fresh user can create their own users/{uid} profile and request a pending self-link', async () => {
    const a = getAdmin();

    // Pre-seed the member record (in real life created by an admin via the
    // CSV import script).
    const memberId = 'm-self';
    await a
      .firestore()
      .collection('members')
      .doc(memberId)
      .set({
        firstName: 'Test',
        lastName: 'User',
        displayName: 'Test User',
        primaryPhoneE164: '+447700900111',
        status: 'active',
        createdAt: a.firestore.FieldValue.serverTimestamp(),
        updatedAt: a.firestore.FieldValue.serverTimestamp(),
      });

    const user = await makeCaller('userE2E1');
    try {
      // 1. Profile creation — the rule layer requires roles=['user'] and
      //    isActive=true on the first write.
      await setDoc(doc(user.firestore, 'users', user.uid), {
        phoneE164: '+447700900111',
        displayName: 'Test User',
        roles: ['user'],
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      // 2. Self-link request: must use the canonical id and start as pending.
      const linkId = `${user.uid}_${memberId}`;
      await setDoc(doc(user.firestore, 'memberUserLinks', linkId), {
        userId: user.uid,
        memberId,
        status: 'pending',
        relationshipToUser: 'self',
        requestedDuringSignup: true,
        createdByAdminId: null,
        approvedByAdminId: null,
        approvedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Admin approves the link via the callable.
      const adminCaller = await makeCaller('adminE2E1', { admin: true });
      try {
        const result = await adminCaller.callable<{ ok: boolean }>(
          'approveMemberUserLink',
          { linkId },
        );
        expect(result).toEqual({ ok: true });
      } finally {
        await adminCaller.dispose();
      }

      // 4. The link status flips to active and the member is now readable
      //    by the user (privacy rules require an existing link doc).
      const linkSnap = await a
        .firestore()
        .collection('memberUserLinks')
        .doc(linkId)
        .get();
      expect(linkSnap.data()?.status).toBe('active');

      const memberSnap = await getDoc(doc(user.firestore, 'members', memberId));
      expect(memberSnap.data()?.displayName).toBe('Test User');
    } finally {
      await user.dispose();
    }
  });

  it('a user CANNOT create a self-link with a non-canonical id', async () => {
    const user = await makeCaller('userE2E2');
    try {
      await expect(
        setDoc(doc(user.firestore, 'memberUserLinks', 'arbitrary-id'), {
          userId: user.uid,
          memberId: 'm-other',
          status: 'pending',
          relationshipToUser: 'self',
          requestedDuringSignup: true,
          createdByAdminId: null,
          approvedByAdminId: null,
          approvedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      ).rejects.toThrow();
    } finally {
      await user.dispose();
    }
  });
});
