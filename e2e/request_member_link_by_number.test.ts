import { doc, getDoc } from 'firebase/firestore';

import { getAdmin, makeCaller, resetEmulators } from './helpers';

beforeEach(async () => {
  await resetEmulators();
});

describe('E2E: requestMemberLinkByNumber callable', () => {
  it('creates a pending self-link when the member number resolves', async () => {
    const a = getAdmin();
    const memberId = 'm-by-number-1';
    await a.firestore().collection('members').doc(memberId).set({
      firstName: 'Lookup',
      lastName: 'User',
      displayName: 'Lookup User',
      primaryPhoneE164: '+447700900222',
      memberNumber: '042',
      status: 'active',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
      updatedAt: a.firestore.FieldValue.serverTimestamp(),
    });

    const user = await makeCaller('userByNumber1');
    try {
      const result = await user.callable<{ ok: boolean; linkId: string }>(
        'requestMemberLinkByNumber',
        { memberNumber: '042', relationshipToUser: 'self' },
      );
      expect(result.ok).toBe(true);
      expect(result.linkId).toBe(`${user.uid}_${memberId}`);

      // The created doc must be `pending`, requestedDuringSignup=true, and
      // never auto-approve.
      const linkSnap = await a
        .firestore()
        .collection('memberUserLinks')
        .doc(result.linkId)
        .get();
      expect(linkSnap.data()?.status).toBe('pending');
      expect(linkSnap.data()?.requestedDuringSignup).toBe(true);
      expect(linkSnap.data()?.approvedByAdminId).toBeNull();

      // The user still cannot read the member doc until an admin approves
      // the link (privacy rules require status === active for some surfaces;
      // the rule allows reads on the link doc itself for the requester).
      const linkAsUser = await getDoc(
        doc(user.firestore, 'memberUserLinks', result.linkId),
      );
      expect(linkAsUser.data()?.status).toBe('pending');
    } finally {
      await user.dispose();
    }
  });

  it('rejects an unknown member number with `not-found`', async () => {
    const user = await makeCaller('userByNumber2');
    try {
      await expect(
        user.callable('requestMemberLinkByNumber', {
          memberNumber: 'NO-SUCH-NUMBER',
          relationshipToUser: 'self',
        }),
      ).rejects.toThrow();
    } finally {
      await user.dispose();
    }
  });

  it('is idempotent — re-running on an already-active link does not change status', async () => {
    const a = getAdmin();
    const memberId = 'm-by-number-3';
    await a.firestore().collection('members').doc(memberId).set({
      firstName: 'Idempotent',
      lastName: 'User',
      displayName: 'Idempotent User',
      primaryPhoneE164: '+447700900333',
      memberNumber: '777',
      status: 'active',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
      updatedAt: a.firestore.FieldValue.serverTimestamp(),
    });

    const user = await makeCaller('userByNumber3');
    try {
      const first = await user.callable<{ linkId: string }>(
        'requestMemberLinkByNumber',
        { memberNumber: '777', relationshipToUser: 'self' },
      );
      // Promote it to active out-of-band, simulating an admin approval.
      await a
        .firestore()
        .collection('memberUserLinks')
        .doc(first.linkId)
        .update({ status: 'active' });

      // Re-running should not flip the link back to pending.
      await user.callable('requestMemberLinkByNumber', {
        memberNumber: '777',
        relationshipToUser: 'self',
      });
      const snap = await a
        .firestore()
        .collection('memberUserLinks')
        .doc(first.linkId)
        .get();
      expect(snap.data()?.status).toBe('active');
    } finally {
      await user.dispose();
    }
  });
});
