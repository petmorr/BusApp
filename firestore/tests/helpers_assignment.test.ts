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
  deleteDoc,
  collectionGroup,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

import { authedDb, makeTestEnv } from './helpers';

let env: RulesTestEnvironment;
const eventId = 'event1';
const adminUid = 'adminUid';
const helperA = 'helperA';
const helperB = 'helperB';

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
      updatedByUserId: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
});

describe('event helper updates', () => {
  it('an assigned helper CAN update parkedBusLocation on the event', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'events', eventId), {
        parkedBusLocation: {
          lat: 55.86,
          lng: -4.25,
          label: 'Car park',
          notes: '',
          updatedByUserId: helperA,
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('an assigned helper CANNOT change unrelated event fields (e.g. capacityMax)', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId), {
        capacityMax: 99,
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('an UNassigned helper CANNOT update parkedBusLocation', async () => {
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

  it('an assigned helper CAN update an existing stop', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'events', eventId, 'stops', 'stop1'), {
        notes: 'changed on the day',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('an assigned helper CANNOT delete a stop (admin-only)', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(
      deleteDoc(doc(db, 'events', eventId, 'stops', 'stop1')),
    );
  });

  it('an UNassigned helper CANNOT update a stop', async () => {
    const db = authedDb(env, { uid: helperB, helper: true }).firestore();
    await assertFails(
      updateDoc(doc(db, 'events', eventId, 'stops', 'stop1'), {
        notes: 'unauthorised',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('a helper CAN run the collection-group query for their own helper docs', async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertSucceeds(
      getDocs(
        query(
          collectionGroup(db, 'helpers'),
          where('userId', '==', helperA),
        ),
      ),
    );
  });

  it("a helper CANNOT enumerate someone else's helper docs via collection group", async () => {
    const db = authedDb(env, { uid: helperA, helper: true }).firestore();
    await assertFails(
      getDocs(
        query(
          collectionGroup(db, 'helpers'),
          where('userId', '==', helperB),
        ),
      ),
    );
  });
});
