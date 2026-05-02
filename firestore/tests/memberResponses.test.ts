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
} from 'firebase/firestore';

import {
  authedDb,
  makeTestEnv,
  memberUserLinkId,
} from './helpers';

let env: RulesTestEnvironment;

const eventId = 'event1';
const memberLinked = 'm-linked';
const memberOther = 'm-other';
const memberPending = 'm-pending';
const userA = 'userA';
const userB = 'userB';
const adminUid = 'adminUid';

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
    // Active link: userA → memberLinked
    await setDoc(doc(db, 'memberUserLinks', memberUserLinkId(userA, memberLinked)), {
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
    });
    // Pending link: userA → memberPending
    await setDoc(doc(db, 'memberUserLinks', memberUserLinkId(userA, memberPending)), {
      userId: userA,
      memberId: memberPending,
      status: 'pending',
      relationshipToUser: 'child',
      requestedDuringSignup: true,
      createdByAdminId: null,
      approvedByAdminId: null,
      approvedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // Open event
    await setDoc(doc(db, 'events', eventId), {
      title: 'Test event',
      eventDate: new Date(Date.now() + 86_400_000),
      status: 'open',
      capacityMax: 50,
      capacityNearThresholdPercent: 90,
      cutoffAt: null,
      capacityStatus: 'under',
      pendingGuestRisk: false,
      lastCapacityAlertSentAt: null,
      createdByAdminId: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // Members
    await setDoc(doc(db, 'members', memberLinked), {
      firstName: 'L',
      lastName: 'Member',
      displayName: 'L Member',
      primaryPhoneE164: '+447700900111',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'members', memberOther), {
      firstName: 'O',
      lastName: 'Other',
      displayName: 'O Other',
      primaryPhoneE164: '+447700900222',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
});

function buildResponsePayload(memberId: string, respondingUserId: string) {
  return {
    memberId,
    respondingUserId,
    status: 'attending' as const,
    outboundPickupStopId: null,
    returnDropoffStopId: null,
    isAdminOverride: false,
    overriddenByAdminId: null,
    eventId,
    eventTitle: 'Test event',
    eventDate: new Date(Date.now() + 86_400_000),
    memberDisplayName: 'X',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

describe('memberResponses', () => {
  it('a user with an active link CAN write a response for that member', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'events', eventId, 'memberResponses', memberLinked),
        buildResponsePayload(memberLinked, userA),
      ),
    );
  });

  it('a user with NO link CANNOT write a response for that member', async () => {
    const db = authedDb(env, { uid: userB }).firestore();
    await assertFails(
      setDoc(
        doc(db, 'events', eventId, 'memberResponses', memberLinked),
        buildResponsePayload(memberLinked, userB),
      ),
    );
  });

  it('a user with only a PENDING link CANNOT write a response (active link required)', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      setDoc(
        doc(db, 'events', eventId, 'memberResponses', memberPending),
        buildResponsePayload(memberPending, userA),
      ),
    );
  });

  it('a user CANNOT spoof respondingUserId to someone else', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      setDoc(
        doc(db, 'events', eventId, 'memberResponses', memberLinked),
        buildResponsePayload(memberLinked, userB),
      ),
    );
  });

  it('a user CANNOT mark their own write as an admin override', async () => {
    const db = authedDb(env, { uid: userA }).firestore();
    await assertFails(
      setDoc(doc(db, 'events', eventId, 'memberResponses', memberLinked), {
        ...buildResponsePayload(memberLinked, userA),
        isAdminOverride: true,
      }),
    );
  });

  it('an admin CAN write a response for any member, even with override flag', async () => {
    const db = authedDb(env, { uid: adminUid, admin: true }).firestore();
    await assertSucceeds(
      setDoc(doc(db, 'events', eventId, 'memberResponses', memberOther), {
        ...buildResponsePayload(memberOther, adminUid),
        isAdminOverride: true,
        overriddenByAdminId: adminUid,
      }),
    );
  });

  it('a linked user can READ their own response; an unrelated user cannot', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, 'events', eventId, 'memberResponses', memberLinked),
        buildResponsePayload(memberLinked, userA),
      );
    });
    await assertSucceeds(
      getDoc(
        doc(
          authedDb(env, { uid: userA }).firestore(),
          'events',
          eventId,
          'memberResponses',
          memberLinked,
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          authedDb(env, { uid: userB }).firestore(),
          'events',
          eventId,
          'memberResponses',
          memberLinked,
        ),
      ),
    );
  });
});
