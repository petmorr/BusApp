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
  collection,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';

import { authedDb, makeTestEnv, memberUserLinkId } from './helpers';

let env: RulesTestEnvironment;
const adminUid = 'adminUid';
const userA = 'userA';
const userB = 'userB';
const memberId = 'm1';

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
    await setDoc(doc(db, 'members', memberId), {
      firstName: 'A',
      lastName: 'M',
      displayName: 'A M',
      primaryPhoneE164: '+447700900000',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'members', 'm2'), {
      firstName: 'B',
      lastName: 'N',
      displayName: 'B N',
      primaryPhoneE164: '+447700900001',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'memberUserLinks', memberUserLinkId(userA, memberId)), {
      userId: userA,
      memberId,
      status: 'active',
      relationshipToUser: 'self',
      requestedDuringSignup: false,
      createdByAdminId: adminUid,
      approvedByAdminId: adminUid,
      approvedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'auditLogs', 'log1'), {
      actorUserId: adminUid,
      action: 'created',
      entityType: 'event',
      entityPath: 'events/x',
      createdAt: serverTimestamp(),
    });
  });
});

describe('member directory privacy', () => {
  it('admin CAN list the full member directory', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertSucceeds(getDocs(collection(db, 'members')));
  });

  it('a regular user CANNOT list the full member directory', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDocs(collection(db, 'members')));
  });

  it('a user CAN read a member they have a link to', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertSucceeds(getDoc(doc(db, 'members', memberId)));
  });

  it('a user CANNOT read an unrelated member', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDoc(doc(db, 'members', 'm2')));
  });

  it('a user with no link CANNOT read any member', async () => {
    const db = authedDb(env, { uid: userB }).firestore();
    await assertFails(getDoc(doc(db, 'members', memberId)));
  });
});

describe('member-user-link admin-only operations', () => {
  it('a regular user CAN create a pending self-link with the canonical id', async () => {
    const db = authedDb(env, { uid: userB }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'memberUserLinks', memberUserLinkId(userB, 'm2')), {
        userId: userB,
        memberId: 'm2',
        status: 'pending',
        relationshipToUser: 'self',
        requestedDuringSignup: true,
        createdByAdminId: null,
        approvedByAdminId: null,
        approvedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('a user CANNOT create a self-link with a non-canonical id', async () => {
    const db = authedDb(env, { uid: userB }).firestore();
    await assertFails(
      setDoc(doc(db, 'memberUserLinks', 'arbitrary-id'), {
        userId: userB,
        memberId: 'm2',
        status: 'pending',
        relationshipToUser: 'self',
        requestedDuringSignup: true,
        createdByAdminId: null,
        approvedByAdminId: null,
        approvedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('a user CANNOT create an already-active link bypassing admin approval', async () => {
    const db = authedDb(env, { uid: userB }).firestore();
    await assertFails(
      setDoc(doc(db, 'memberUserLinks', memberUserLinkId(userB, 'm2')), {
        userId: userB,
        memberId: 'm2',
        status: 'active',
        relationshipToUser: 'self',
        requestedDuringSignup: true,
        createdByAdminId: null,
        approvedByAdminId: null,
        approvedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('a user CANNOT activate their own pending link (admin only)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'memberUserLinks', memberUserLinkId(userB, 'm2')),
        {
          userId: userB,
          memberId: 'm2',
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
    });
    const db = authedDb(env, { uid: userB }).firestore();
    await assertFails(
      setDoc(doc(db, 'memberUserLinks', memberUserLinkId(userB, 'm2')), {
        userId: userB,
        memberId: 'm2',
        status: 'active',
        relationshipToUser: 'self',
        requestedDuringSignup: true,
        createdByAdminId: null,
        approvedByAdminId: adminUid,
        approvedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

describe('admin-only collections', () => {
  it('a regular user CANNOT read auditLogs', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(getDoc(doc(db, 'auditLogs', 'log1')));
  });

  it('an admin CAN read auditLogs', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertSucceeds(getDoc(doc(db, 'auditLogs', 'log1')));
  });

  it('nobody (not even admin) can write auditLogs from a client', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'auditLogs', 'log2'), {
        actorUserId: adminUid,
        action: 'x',
        entityType: 'event',
        entityPath: 'events/x',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('nobody can write notifications from a client', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertFails(
      setDoc(doc(db, 'notifications', 'n1'), {
        eventId: null,
        type: 'attendance_request',
        title: 't',
        body: 'b',
        targetUserIds: [],
        sentByUserId: adminUid,
        status: 'queued',
        createdAt: serverTimestamp(),
        sentAt: null,
      }),
    );
  });

  it('a regular user CANNOT create or delete an event', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      setDoc(doc(db, 'events', 'newEvent'), {
        title: 'sneak',
        eventDate: new Date(),
        status: 'open',
        capacityMax: 1,
        capacityNearThresholdPercent: 90,
        cutoffAt: null,
        capacityStatus: 'under',
        pendingGuestRisk: false,
        lastCapacityAlertSentAt: null,
        createdByAdminId: userA,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('an admin CAN create and delete an event', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'events', 'newEvent'), {
        title: 'admin-event',
        eventDate: new Date(),
        status: 'draft',
        capacityMax: 50,
        capacityNearThresholdPercent: 90,
        cutoffAt: null,
        capacityStatus: 'under',
        pendingGuestRisk: false,
        lastCapacityAlertSentAt: null,
        createdByAdminId: adminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(deleteDoc(doc(db, 'events', 'newEvent')));
  });
});
