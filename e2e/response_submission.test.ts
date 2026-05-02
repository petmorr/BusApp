import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

import { getAdmin, makeCaller, resetEmulators } from './helpers';

// Note on Timestamp choice: docs seeded via `firebase-admin` MUST use
// `a.firestore.Timestamp.*`; docs written via the client SDK (`setDoc`)
// MUST use the JS SDK's `Timestamp`. Mixing the two raises:
//   "object of type 'Timestamp' that doesn't match the expected instance".

const eventId = 'eventE2E';
const memberId = 'm-resp';
const otherMemberId = 'm-other';

beforeEach(async () => {
  await resetEmulators();
  const a = getAdmin();

  await a.firestore().collection('events').doc(eventId).set({
    title: 'E2E Match',
    eventDate: a.firestore.Timestamp.fromDate(
      new Date(Date.now() + 86_400_000),
    ),
    // ^^ admin SDK Timestamp because we are writing through firebase-admin.
    status: 'open',
    capacityMax: 50,
    capacityNearThresholdPercent: 90,
    cutoffAt: null,
    capacityStatus: 'under',
    pendingGuestRisk: false,
    lastCapacityAlertSentAt: null,
    createdByAdminId: 'adminE2E',
    createdAt: a.firestore.FieldValue.serverTimestamp(),
    updatedAt: a.firestore.FieldValue.serverTimestamp(),
  });

  await a.firestore().collection('members').doc(memberId).set({
    firstName: 'M',
    lastName: 'R',
    displayName: 'M R',
    primaryPhoneE164: '+447700900222',
    status: 'active',
    createdAt: a.firestore.FieldValue.serverTimestamp(),
    updatedAt: a.firestore.FieldValue.serverTimestamp(),
  });
  await a.firestore().collection('members').doc(otherMemberId).set({
    firstName: 'O',
    lastName: 'X',
    displayName: 'O X',
    primaryPhoneE164: '+447700900333',
    status: 'active',
    createdAt: a.firestore.FieldValue.serverTimestamp(),
    updatedAt: a.firestore.FieldValue.serverTimestamp(),
  });
});

async function activeLink(userId: string, memberRef: string): Promise<void> {
  const a = getAdmin();
  await a
    .firestore()
    .collection('memberUserLinks')
    .doc(`${userId}_${memberRef}`)
    .set({
      userId,
      memberId: memberRef,
      status: 'active',
      relationshipToUser: 'self',
      requestedDuringSignup: false,
      createdByAdminId: 'adminE2E',
      approvedByAdminId: 'adminE2E',
      approvedAt: a.firestore.FieldValue.serverTimestamp(),
      createdAt: a.firestore.FieldValue.serverTimestamp(),
      updatedAt: a.firestore.FieldValue.serverTimestamp(),
    });
}

describe('E2E: member response submission', () => {
  it('a user with an active link can submit a member response and the trigger updates capacity', async () => {
    await activeLink('userR1', memberId);
    const a = getAdmin();
    const user = await makeCaller('userR1');
    try {
      await setDoc(
        doc(user.firestore, 'events', eventId, 'memberResponses', memberId),
        {
          memberId,
          respondingUserId: user.uid,
          status: 'attending',
          outboundPickupStopId: null,
          returnDropoffStopId: null,
          isAdminOverride: false,
          overriddenByAdminId: null,
          eventId,
          eventTitle: 'E2E Match',
          eventDate: Timestamp.fromDate(new Date(Date.now() + 86_400_000)),
          memberDisplayName: 'M R',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );

      // Wait for the capacity trigger to fan out — the recalculation
      // function writes capacityConfirmedMemberSeats etc. back to the
      // event doc.
      await waitFor(async () => {
        const snap = await a.firestore().collection('events').doc(eventId).get();
        const data = snap.data();
        return data?.capacityConfirmedMemberSeats === 1;
      });

      const eventSnap = await a.firestore().collection('events').doc(eventId).get();
      const data = eventSnap.data()!;
      expect(data.capacityConfirmedMemberSeats).toBe(1);
      expect(data.capacityApprovedTotal).toBe(1);
      expect(data.capacityStatus).toBe('under');
    } finally {
      await user.dispose();
    }
  });

  it('a user without an active link is denied at the rule layer', async () => {
    const user = await makeCaller('userR2');
    try {
      await expect(
        setDoc(
          doc(user.firestore, 'events', eventId, 'memberResponses', memberId),
          {
            memberId,
            respondingUserId: user.uid,
            status: 'attending',
            outboundPickupStopId: null,
            returnDropoffStopId: null,
            isAdminOverride: false,
            overriddenByAdminId: null,
            eventId,
            eventTitle: 'E2E Match',
            eventDate: Timestamp.fromDate(new Date(Date.now() + 86_400_000)),
            memberDisplayName: 'M R',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        ),
      ).rejects.toThrow();
    } finally {
      await user.dispose();
    }
  });

  it('a user CANNOT respond on behalf of an unrelated member', async () => {
    await activeLink('userR3', memberId);
    const user = await makeCaller('userR3');
    try {
      await expect(
        setDoc(
          doc(
            user.firestore,
            'events',
            eventId,
            'memberResponses',
            otherMemberId,
          ),
          {
            memberId: otherMemberId,
            respondingUserId: user.uid,
            status: 'attending',
            outboundPickupStopId: null,
            returnDropoffStopId: null,
            isAdminOverride: false,
            overriddenByAdminId: null,
            eventId,
            eventTitle: 'E2E Match',
            eventDate: Timestamp.fromDate(new Date(Date.now() + 86_400_000)),
            memberDisplayName: 'O X',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        ),
      ).rejects.toThrow();
    } finally {
      await user.dispose();
    }
  });
});

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 15000,
  intervalMs = 250,
): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
