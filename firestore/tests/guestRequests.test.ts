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
} from 'firebase/firestore';

import { authedDb, makeTestEnv } from './helpers';

let env: RulesTestEnvironment;
const eventId = 'event1';
const userA = 'userA';
const userB = 'userB';
const admin = 'adminUid';

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
      createdByAdminId: admin,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
});

const guestId = 'g1';
function pendingGuest(byUid: string) {
  return {
    guestName: 'Guest',
    requestedByUserId: byUid,
    linkedMemberId: null,
    initialPickupStopId: 'stop1',
    status: 'pending' as const,
    decisionByAdminId: null,
    decisionAt: null,
    eventId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

describe('guestRequests', () => {
  it('a user CAN create a pending guest request for themselves', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'events', eventId, 'guestRequests', guestId), pendingGuest(userA)),
    );
  });

  it('a user CANNOT create a guest request that names another user as the requester', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      setDoc(doc(db, 'events', eventId, 'guestRequests', guestId), pendingGuest(userB)),
    );
  });

  it('a user CANNOT create an already-approved guest request', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      setDoc(doc(db, 'events', eventId, 'guestRequests', guestId), {
        ...pendingGuest(userA),
        status: 'approved',
      }),
    );
  });

  it('the requester CAN edit their own pending guest request', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'events', eventId, 'guestRequests', guestId),
        pendingGuest(userA),
      );
    });
    const db = authedDb(env, { uid: userA }).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'events', eventId, 'guestRequests', guestId), {
        guestName: 'Updated Guest',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('the requester CAN cancel their own pending guest request', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'events', eventId, 'guestRequests', guestId),
        pendingGuest(userA),
      );
    });
    const db = authedDb(env, { uid: userA }).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'events', eventId, 'guestRequests', guestId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('the requester CANNOT self-approve their own pending guest request', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'events', eventId, 'guestRequests', guestId),
        pendingGuest(userA),
      );
    });
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'guestRequests', guestId), {
        status: 'approved',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('a different user CANNOT edit someone else\'s pending guest request', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'events', eventId, 'guestRequests', guestId),
        pendingGuest(userA),
      );
    });
    const db = authedDb(env, { uid: userB }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'guestRequests', guestId), {
        guestName: 'Hijack',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('a user CANNOT edit their own already-approved guest request', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'events', eventId, 'guestRequests', guestId), {
        ...pendingGuest(userA),
        status: 'approved',
        decisionByAdminId: admin,
        decisionAt: serverTimestamp(),
      });
    });
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'guestRequests', guestId), {
        guestName: 'Sneak',
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
