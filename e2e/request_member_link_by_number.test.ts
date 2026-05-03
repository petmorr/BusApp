import { doc, getDoc } from 'firebase/firestore';

import { getAdmin, makeCaller, resetEmulators } from './helpers';

/**
 * E2E coverage for the hardened `requestMemberLinkByNumber` callable.
 *
 * The callable deliberately returns the same generic response
 * (`{ ok: true }`) regardless of whether the member number matched,
 * whether the member was active, or whether a link already existed — so
 * a signed-in user cannot use this surface to enumerate supporters.
 *
 * The tests therefore assert side-effects on the Firestore side (with the
 * Admin SDK, bypassing rules) rather than the callable's return value.
 */
beforeEach(async () => {
  await resetEmulators();
});

describe('E2E: requestMemberLinkByNumber callable (hardened)', () => {
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
      const result = await user.callable<{ ok: boolean }>(
        'requestMemberLinkByNumber',
        { memberNumber: '042', relationshipToUser: 'self' },
      );
      expect(result).toEqual({ ok: true });

      // The canonical link doc should exist with status=pending and no
      // admin approval metadata. The linkId is not returned by the
      // callable (to avoid confirming the match client-side), so we
      // derive it the same way the callable does.
      const linkId = `${user.uid}_${memberId}`;
      const linkSnap = await a
        .firestore()
        .collection('memberUserLinks')
        .doc(linkId)
        .get();
      expect(linkSnap.exists).toBe(true);
      expect(linkSnap.data()?.status).toBe('pending');
      expect(linkSnap.data()?.requestedDuringSignup).toBe(true);
      expect(linkSnap.data()?.approvedByAdminId).toBeNull();

      // The user can still read the link doc (rules permit that), but
      // cannot yet read the member doc (status is not `active`-linked).
      const linkAsUser = await getDoc(
        doc(user.firestore, 'memberUserLinks', linkId),
      );
      expect(linkAsUser.data()?.status).toBe('pending');
    } finally {
      await user.dispose();
    }
  });

  it('returns the same generic response for an unknown member number (no enumeration oracle)', async () => {
    const user = await makeCaller('userByNumber2');
    try {
      const result = await user.callable<{ ok: boolean }>(
        'requestMemberLinkByNumber',
        { memberNumber: 'NO-SUCH-NUMBER', relationshipToUser: 'self' },
      );
      // Same shape as the success path — the attacker learns nothing.
      expect(result).toEqual({ ok: true });

      // No memberUserLink doc should be created.
      const a = getAdmin();
      const links = await a
        .firestore()
        .collection('memberUserLinks')
        .where('userId', '==', user.uid)
        .get();
      expect(links.empty).toBe(true);
    } finally {
      await user.dispose();
    }
  });

  it('returns the same generic response when the member is inactive', async () => {
    const a = getAdmin();
    const memberId = 'm-by-number-inactive';
    await a.firestore().collection('members').doc(memberId).set({
      firstName: 'Inactive',
      lastName: 'User',
      displayName: 'Inactive User',
      primaryPhoneE164: '+447700900999',
      memberNumber: '555',
      status: 'inactive',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
      updatedAt: a.firestore.FieldValue.serverTimestamp(),
    });

    const user = await makeCaller('userByNumberInactive');
    try {
      const result = await user.callable<{ ok: boolean }>(
        'requestMemberLinkByNumber',
        { memberNumber: '555', relationshipToUser: 'self' },
      );
      expect(result).toEqual({ ok: true });

      // No link should have been created for an inactive member.
      const linkSnap = await a
        .firestore()
        .collection('memberUserLinks')
        .doc(`${user.uid}_${memberId}`)
        .get();
      expect(linkSnap.exists).toBe(false);
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
      await user.callable('requestMemberLinkByNumber', {
        memberNumber: '777',
        relationshipToUser: 'self',
      });
      const linkId = `${user.uid}_${memberId}`;
      // Promote to active out-of-band, simulating an admin approval.
      await a
        .firestore()
        .collection('memberUserLinks')
        .doc(linkId)
        .update({ status: 'active' });

      await user.callable('requestMemberLinkByNumber', {
        memberNumber: '777',
        relationshipToUser: 'self',
      });
      const snap = await a
        .firestore()
        .collection('memberUserLinks')
        .doc(linkId)
        .get();
      expect(snap.data()?.status).toBe('active');
    } finally {
      await user.dispose();
    }
  });

  it('rejected links are STICKY — the callable does NOT reopen them to pending', async () => {
    const a = getAdmin();
    const memberId = 'm-by-number-rejected';
    await a.firestore().collection('members').doc(memberId).set({
      firstName: 'Rejected',
      lastName: 'User',
      displayName: 'Rejected User',
      primaryPhoneE164: '+447700900444',
      memberNumber: '888',
      status: 'active',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
      updatedAt: a.firestore.FieldValue.serverTimestamp(),
    });

    const user = await makeCaller('userByNumberRejected');
    try {
      // Seed an already-rejected link (as if an admin had previously
      // rejected this request).
      const linkId = `${user.uid}_${memberId}`;
      await a
        .firestore()
        .collection('memberUserLinks')
        .doc(linkId)
        .set({
          userId: user.uid,
          memberId,
          status: 'rejected',
          relationshipToUser: 'self',
          requestedDuringSignup: true,
          createdByAdminId: null,
          approvedByAdminId: 'someAdmin',
          approvedAt: a.firestore.FieldValue.serverTimestamp(),
          createdAt: a.firestore.FieldValue.serverTimestamp(),
          updatedAt: a.firestore.FieldValue.serverTimestamp(),
        });

      // The callable must return the same generic response — no hint to
      // the user that their link was rejected.
      const result = await user.callable<{ ok: boolean }>(
        'requestMemberLinkByNumber',
        { memberNumber: '888', relationshipToUser: 'self' },
      );
      expect(result).toEqual({ ok: true });

      // The link must remain rejected.
      const snap = await a
        .firestore()
        .collection('memberUserLinks')
        .doc(linkId)
        .get();
      expect(snap.data()?.status).toBe('rejected');
      expect(snap.data()?.approvedByAdminId).toBe('someAdmin');
    } finally {
      await user.dispose();
    }
  });

  it('writes an audit-log entry for every outcome class', async () => {
    const a = getAdmin();
    const memberId = 'm-by-number-audited';
    await a.firestore().collection('members').doc(memberId).set({
      firstName: 'Audited',
      lastName: 'User',
      displayName: 'Audited User',
      primaryPhoneE164: '+447700900555',
      memberNumber: '999',
      status: 'active',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
      updatedAt: a.firestore.FieldValue.serverTimestamp(),
    });

    const user = await makeCaller('userByNumberAudited');
    try {
      // Successful creation.
      await user.callable('requestMemberLinkByNumber', {
        memberNumber: '999',
        relationshipToUser: 'self',
      });
      // Unknown number.
      await user.callable('requestMemberLinkByNumber', {
        memberNumber: 'NOPE',
        relationshipToUser: 'self',
      });

      const audits = await a
        .firestore()
        .collection('auditLogs')
        .where('actorUserId', '==', user.uid)
        .where('action', '==', 'request_member_link_by_number')
        .get();
      const outcomes = audits.docs
        .map((d) => (d.data().after as { outcome?: string }).outcome)
        .sort();
      expect(outcomes).toEqual(['created', 'unknown_number']);
    } finally {
      await user.dispose();
    }
  });
});
