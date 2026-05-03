import { getAdmin, makeCaller, resetEmulators } from './helpers';

const eventId = 'eventOverride';
const memberId = 'm-late';

beforeEach(async () => {
  await resetEmulators();
  const a = getAdmin();
  await a.firestore().collection('events').doc(eventId).set({
    title: 'Override Match',
    eventDate: a.firestore.Timestamp.fromDate(
      new Date(Date.now() + 86_400_000),
    ),
    status: 'open',
    capacityMax: 50,
    capacityNearThresholdPercent: 90,
    // Force-passed cutoff: the override callable must still succeed for
    // admins after cutoff, which is the canonical "someone confirmed
    // outside the app" use-case in the spec.
    cutoffAt: a.firestore.Timestamp.fromDate(
      new Date(Date.now() - 60 * 60 * 1000),
    ),
    capacityStatus: 'under',
    pendingGuestRisk: false,
    lastCapacityAlertSentAt: null,
    createdByAdminId: 'adminOverride',
    createdAt: a.firestore.FieldValue.serverTimestamp(),
    updatedAt: a.firestore.FieldValue.serverTimestamp(),
  });
  await a.firestore().collection('members').doc(memberId).set({
    firstName: 'Late',
    lastName: 'Confirm',
    displayName: 'Late Confirm',
    primaryPhoneE164: '+447700900999',
    status: 'active',
    createdAt: a.firestore.FieldValue.serverTimestamp(),
    updatedAt: a.firestore.FieldValue.serverTimestamp(),
  });
});

describe('E2E: overrideMemberResponse', () => {
  it('admin can override even after cutoff and capacity recalculates', async () => {
    const a = getAdmin();
    const adminCaller = await makeCaller('adminOverride1', { admin: true });
    try {
      const out = await adminCaller.callable<{ ok: boolean }>(
        'overrideMemberResponse',
        {
          eventId,
          memberId,
          status: 'attending',
        },
      );
      expect(out.ok).toBe(true);
    } finally {
      await adminCaller.dispose();
    }

    // The denormalised display name + override metadata are written.
    const respSnap = await a
      .firestore()
      .collection('events')
      .doc(eventId)
      .collection('memberResponses')
      .doc(memberId)
      .get();
    const data = respSnap.data()!;
    expect(data.status).toBe('attending');
    expect(data.isAdminOverride).toBe(true);
    expect(data.overriddenByAdminId).toBe('adminOverride1');
    expect(data.memberDisplayName).toBe('Late Confirm');

    // Capacity trigger fans out and updates the event's totals.
    await waitFor(async () => {
      const snap = await a.firestore().collection('events').doc(eventId).get();
      return snap.data()?.capacityConfirmedMemberSeats === 1;
    });

    // Audit log entry is written and the action is the override action.
    const auditSnap = await a
      .firestore()
      .collection('auditLogs')
      .where('action', '==', 'override_member_response')
      .get();
    expect(auditSnap.size).toBeGreaterThan(0);
    auditSnap.forEach((d) => {
      // PII redaction: the member display name must not appear raw.
      const payload = JSON.stringify(d.data());
      expect(payload).not.toContain('Late Confirm');
    });
  });

  it('non-admin caller is rejected with permission-denied', async () => {
    const userCaller = await makeCaller('userOverride');
    try {
      await expect(
        userCaller.callable('overrideMemberResponse', {
          eventId,
          memberId,
          status: 'attending',
        }),
      ).rejects.toThrow();
    } finally {
      await userCaller.dispose();
    }
  });

  it('rejects unknown payload fields', async () => {
    const adminCaller = await makeCaller('adminOverrideX', { admin: true });
    try {
      await expect(
        adminCaller.callable('overrideMemberResponse', {
          eventId,
          memberId,
          status: 'attending',
          smuggled: 'oops',
        }),
      ).rejects.toThrow();
    } finally {
      await adminCaller.dispose();
    }
  });

  it('returns not-found if the member does not exist', async () => {
    const adminCaller = await makeCaller('adminOverrideY', { admin: true });
    try {
      await expect(
        adminCaller.callable('overrideMemberResponse', {
          eventId,
          memberId: 'does-not-exist',
          status: 'not_attending',
        }),
      ).rejects.toThrow();
    } finally {
      await adminCaller.dispose();
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
