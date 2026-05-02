/**
 * Aggregate "deny path" coverage for the P0 production-hardening list.
 *
 * The other suites in this directory exercise positive paths and the most
 * common denial cases per collection. This file focuses purely on the
 * critical *negative* paths called out in the production hardening review:
 *
 *   1. Unlinked member response write — must fail.
 *   2. Unauthorized guest decision (approve/reject as a non-admin) — must
 *      fail at the rule layer (the callable is the only legitimate path).
 *   3. Helper updating non-allowed event fields — must fail.
 *   4. Non-admin access to admin collections (auditLogs, notifications,
 *      members listing, memberUserLinks listing).
 *
 * Keeping them in their own file makes it easy for a reviewer to verify the
 * P0 deny-path coverage in one read.
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
  updateDoc,
  collection,
  getDocs,
} from 'firebase/firestore';

import { authedDb, makeTestEnv, memberUserLinkId } from './helpers';

let env: RulesTestEnvironment;

const eventId = 'event1';
const adminUid = 'adminUid';
const helperA = 'helperA';
const helperB = 'helperB';
const userA = 'userA';
const userB = 'userB';
const memberLinked = 'm-linked';
const memberOther = 'm-other';

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
    await setDoc(
      doc(db, 'memberUserLinks', memberUserLinkId(userA, memberLinked)),
      {
        userId: userA,
        memberId: memberLinked,
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
    await setDoc(doc(db, 'members', memberLinked), {
      firstName: 'L',
      lastName: 'M',
      displayName: 'L M',
      primaryPhoneE164: '+447700900000',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'members', memberOther), {
      firstName: 'O',
      lastName: 'M',
      displayName: 'O M',
      primaryPhoneE164: '+447700900111',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(
      doc(db, 'events', eventId, 'guestRequests', 'guestX'),
      {
        guestName: 'Guest X',
        requestedByUserId: userA,
        linkedMemberId: null,
        initialPickupStopId: 'stop1',
        status: 'pending',
        decisionByAdminId: null,
        decisionAt: null,
        eventId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
    await setDoc(doc(db, 'auditLogs', 'log1'), {
      actorUserId: adminUid,
      action: 'noop',
      entityType: 'event',
      entityPath: 'events/x',
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'notifications', 'n1'), {
      eventId,
      type: 'attendance_request',
      title: 't',
      body: 'b',
      targetUserIds: [userA],
      sentByUserId: adminUid,
      status: 'sent',
      createdAt: serverTimestamp(),
      sentAt: serverTimestamp(),
    });
  });
});

describe('P0 deny paths — coverage matrix', () => {
  it('1. unlinked member response write is denied', async () => {
    const db = authedDb(env, { uid: userB }).firestore();
    await assertFails(
      setDoc(doc(db, 'events', eventId, 'memberResponses', memberLinked), {
        memberId: memberLinked,
        respondingUserId: userB,
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
      }),
    );
  });

  it('1b. linked member response write is allowed (positive control)', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'events', eventId, 'memberResponses', memberLinked), {
        memberId: memberLinked,
        respondingUserId: userA,
        status: 'attending',
        outboundPickupStopId: null,
        returnDropoffStopId: null,
        isAdminOverride: false,
        overriddenByAdminId: null,
        eventId,
        eventTitle: 'E',
        eventDate: new Date(Date.now() + 86_400_000),
        memberDisplayName: 'L M',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('2. a non-admin CANNOT directly approve a guest request (must use callable)', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'guestRequests', 'guestX'), {
        status: 'approved',
        decisionByAdminId: userA,
        decisionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('2b. a helper CANNOT directly approve a guest request', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'guestRequests', 'guestX'), {
        status: 'approved',
        decisionByAdminId: helperA,
        decisionAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('3. a helper CANNOT update event fields outside parkedBusLocation/updatedAt', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId), {
        title: 'sneaky retitle',
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'events', eventId), {
        capacityMax: 1,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(doc(db, 'events', eventId), {
        cutoffAt: new Date(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('3b. an unassigned helper CANNOT update parkedBusLocation', async () => {
    const db = authedDb(env, { uid: helperB, helper: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId), {
        parkedBusLocation: {
          lat: 0,
          lng: 0,
          updatedByUserId: helperB,
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('4. a non-admin CANNOT read auditLogs', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDocs(collection(db, 'auditLogs')));
  });

  it('4b. a non-admin CANNOT list notifications collection', async () => {
    // Notifications are queryable only via per-user filter (rule has its
    // own clause). Listing without the filter should be denied.
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDocs(collection(db, 'notifications')));
  });

  it('4c. a non-admin CANNOT list the members collection', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDocs(collection(db, 'members')));
  });

  it('4d. a non-admin CANNOT list memberUserLinks collection', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDocs(collection(db, 'memberUserLinks')));
  });

  it('4e. a helper CANNOT read auditLogs even on assigned events', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(getDocs(collection(db, 'auditLogs')));
  });
});
