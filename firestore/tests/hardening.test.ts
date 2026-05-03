/**
 * Regression tests for the P2 security-hardening round:
 *
 *   - /members read requires an ACTIVE link (not merely an existing link).
 *   - /events/{eventId}/memberResponses read requires an ACTIVE link.
 *   - /events/{eventId}/stops helper updates are restricted to a narrow
 *     field allow-list (notes, scheduledAt, isActive, updatedAt,
 *     updatedByUserId) — no more, no less.
 *   - /rateLimits and /idempotencyKeys are admin-read-only and fully
 *     client-write-denied.
 */

import {
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
  collection,
  getDocs,
} from 'firebase/firestore';

import { authedDb, makeTestEnv, memberUserLinkId } from './helpers';

let env: RulesTestEnvironment;

const eventId = 'event1';
const adminUid = 'adminUid';
const helperA = 'helperA';
const userA = 'userA';
const memberActive = 'm-active';
const memberPending = 'm-pending';
const memberRejected = 'm-rejected';

beforeAll(async () => {
  env = await makeTestEnv();
});
afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, 'events', eventId), {
      title: 'E',
      eventDate: new Date(Date.now() + 86_400_000),
      status: 'open',
      capacityMax: 50,
      capacityNearThresholdPercent: 90,
      cutoffAt: null,
      capacityStatus: 'under',
      pendingGuestRisk: false,
      lastCapacityAlertSentAt: null,
      parkedBusLocation: null,
      createdByAdminId: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'events', eventId, 'helpers', helperA), {
      userId: helperA,
      assignedByAdminId: adminUid,
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'events', eventId, 'stops', 'stop1'), {
      name: 'Stop 1',
      type: 'outbound_pickup',
      sequence: 1,
      isActive: true,
      scheduledAt: null,
      notes: '',
      location: { lat: 0, lng: 0 },
      updatedByUserId: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const [memberId, status] of [
      [memberActive, 'active'],
      [memberPending, 'active'],
      [memberRejected, 'active'],
    ] as const) {
      await setDoc(doc(db, 'members', memberId), {
        firstName: memberId,
        lastName: 'X',
        displayName: `${memberId} X`,
        primaryPhoneE164: '+447700900000',
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await setDoc(
      doc(db, 'memberUserLinks', memberUserLinkId(userA, memberActive)),
      {
        userId: userA,
        memberId: memberActive,
        status: 'active',
        relationshipToUser: 'self',
        requestedDuringSignup: false,
        createdByAdminId: adminUid,
        approvedByAdminId: adminUid,
        approvedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
    await setDoc(
      doc(db, 'memberUserLinks', memberUserLinkId(userA, memberPending)),
      {
        userId: userA,
        memberId: memberPending,
        status: 'pending',
        relationshipToUser: 'self',
        requestedDuringSignup: true,
        createdByAdminId: null,
        approvedByAdminId: null,
        approvedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
    await setDoc(
      doc(db, 'memberUserLinks', memberUserLinkId(userA, memberRejected)),
      {
        userId: userA,
        memberId: memberRejected,
        status: 'rejected',
        relationshipToUser: 'self',
        requestedDuringSignup: true,
        createdByAdminId: null,
        approvedByAdminId: adminUid,
        approvedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );

    await setDoc(
      doc(db, 'events', eventId, 'memberResponses', memberActive),
      {
        memberId: memberActive,
        respondingUserId: userA,
        status: 'attending',
        outboundPickupStopId: null,
        returnDropoffStopId: null,
        isAdminOverride: false,
        overriddenByAdminId: null,
        eventId,
        eventTitle: 'E',
        eventDate: new Date(Date.now() + 86_400_000),
        memberDisplayName: 'X',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
    await setDoc(
      doc(db, 'events', eventId, 'memberResponses', memberPending),
      {
        memberId: memberPending,
        respondingUserId: adminUid,
        status: 'attending',
        outboundPickupStopId: null,
        returnDropoffStopId: null,
        isAdminOverride: true,
        overriddenByAdminId: adminUid,
        eventId,
        eventTitle: 'E',
        eventDate: new Date(Date.now() + 86_400_000),
        memberDisplayName: 'P',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );

    await setDoc(doc(db, 'rateLimits', 'rl1'), {
      windowStartMs: 0,
      count: 1,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'idempotencyKeys', 'idem1'), {
      status: 'completed',
      createdAt: serverTimestamp(),
      completedAt: serverTimestamp(),
    });
  });
});

describe('P2 hardening: members read requires ACTIVE link', () => {
  it('active link → member read OK', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertSucceeds(getDoc(doc(db, 'members', memberActive)));
  });

  it('pending link → member read DENIED', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDoc(doc(db, 'members', memberPending)));
  });

  it('rejected link → member read DENIED', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDoc(doc(db, 'members', memberRejected)));
  });
});

describe('P2 hardening: memberResponses read requires ACTIVE link', () => {
  it('active link → response read OK', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertSucceeds(
      getDoc(doc(db, 'events', eventId, 'memberResponses', memberActive)),
    );
  });

  it('pending link → response read DENIED', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      getDoc(doc(db, 'events', eventId, 'memberResponses', memberPending)),
    );
  });
});

describe('P2 hardening: helper stop updates are restricted to a field allow-list', () => {
  it('helper CAN update notes + scheduledAt + isActive', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'events', eventId, 'stops', 'stop1'), {
        notes: 'note',
        scheduledAt: new Date(),
        isActive: false,
        updatedAt: serverTimestamp(),
        updatedByUserId: helperA,
      }),
    );
  });

  it('helper CANNOT rename a stop', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'stops', 'stop1'), {
        name: 'sneaky rename',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('helper CANNOT change stop type', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'stops', 'stop1'), {
        type: 'event_pickup',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('helper CANNOT change sequence', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'stops', 'stop1'), {
        sequence: 99,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('helper CANNOT relocate a stop', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'stops', 'stop1'), {
        location: { lat: 10, lng: 10 },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('admin CAN do any stop update', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'events', eventId, 'stops', 'stop1'), {
        name: 'Renamed by admin',
        type: 'event_pickup',
        sequence: 2,
        location: { lat: 1, lng: 2 },
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('P2 hardening: internal Firestore collections are client-locked', () => {
  it('a non-admin CANNOT read rateLimits', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDocs(collection(db, 'rateLimits')));
  });

  it('an admin CAN read rateLimits for observability', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertSucceeds(getDocs(collection(db, 'rateLimits')));
  });

  it('no client (even admin) can WRITE rateLimits', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'rateLimits', 'rl-new'), {
        count: 1,
        windowStartMs: 0,
      }),
    );
  });

  it('a non-admin CANNOT read idempotencyKeys', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDocs(collection(db, 'idempotencyKeys')));
  });

  it('no client (even admin) can WRITE idempotencyKeys', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'idempotencyKeys', 'idem-new'), {
        status: 'completed',
      }),
    );
  });
});
