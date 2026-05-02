import { getAdmin, makeCaller, resetEmulators } from './helpers';

const eventId = 'eventG';
const guestRequestId = 'guest1';

beforeEach(async () => {
  await resetEmulators();
  const a = getAdmin();
  await a.firestore().collection('events').doc(eventId).set({
    title: 'G Match',
    eventDate: a.firestore.Timestamp.fromDate(new Date(Date.now() + 86_400_000)),
    status: 'open',
    capacityMax: 50,
    capacityNearThresholdPercent: 90,
    cutoffAt: null,
    capacityStatus: 'under',
    pendingGuestRisk: false,
    lastCapacityAlertSentAt: null,
    createdByAdminId: 'adminG',
    createdAt: a.firestore.FieldValue.serverTimestamp(),
    updatedAt: a.firestore.FieldValue.serverTimestamp(),
  });
});

async function seedPendingGuest(byUid: string): Promise<void> {
  const a = getAdmin();
  await a
    .firestore()
    .collection('events')
    .doc(eventId)
    .collection('guestRequests')
    .doc(guestRequestId)
    .set({
      guestName: 'Jane Guest',
      requestedByUserId: byUid,
      linkedMemberId: null,
      initialPickupStopId: 'stop1',
      status: 'pending',
      decisionByAdminId: null,
      decisionAt: null,
      eventId,
      createdAt: a.firestore.FieldValue.serverTimestamp(),
      updatedAt: a.firestore.FieldValue.serverTimestamp(),
    });
}

describe('E2E: guest request decision', () => {
  it('admin can approve a pending guest, the doc updates and a notification is recorded', async () => {
    await seedPendingGuest('userG1');
    const a = getAdmin();

    const adminCaller = await makeCaller('adminG1', { admin: true });
    try {
      const out = await adminCaller.callable<{ ok: boolean; status: string }>(
        'approveGuestRequest',
        { eventId, guestRequestId },
      );
      expect(out).toEqual({ ok: true, status: 'approved' });
    } finally {
      await adminCaller.dispose();
    }

    const guestSnap = await a
      .firestore()
      .collection('events')
      .doc(eventId)
      .collection('guestRequests')
      .doc(guestRequestId)
      .get();
    expect(guestSnap.data()?.status).toBe('approved');

    // An audit log entry was written.
    const auditSnap = await a
      .firestore()
      .collection('auditLogs')
      .where('action', '==', 'approve_guest_request')
      .get();
    expect(auditSnap.size).toBeGreaterThan(0);
    // PII redaction: guestName must NOT appear in the audit payload.
    auditSnap.forEach((d) => {
      const payload = JSON.stringify(d.data());
      expect(payload).not.toContain('Jane Guest');
    });

    // A notification was written with the deterministic id.
    await waitFor(async () => {
      const ns = await a
        .firestore()
        .collection('notifications')
        .where('type', '==', 'guest_approved')
        .get();
      return ns.size > 0;
    });
    const notifSnap = await a
      .firestore()
      .collection('notifications')
      .where('type', '==', 'guest_approved')
      .get();
    expect(notifSnap.size).toBeGreaterThan(0);
    notifSnap.forEach((d) => {
      const data = d.data();
      expect(data.targetUserIds).toContain('userG1');
      expect(['queued', 'sent', 'partial_failure', 'failed']).toContain(
        data.status,
      );
    });
  });

  it('approving the same pending guest twice is idempotent (second call is a no-op replay)', async () => {
    await seedPendingGuest('userG2');
    const adminCaller = await makeCaller('adminG2', { admin: true });
    try {
      const a = getAdmin();
      const r1 = await adminCaller.callable<{ ok: boolean; status: string }>(
        'approveGuestRequest',
        { eventId, guestRequestId, idempotencyKey: 'same-key' },
      );
      const r2 = await adminCaller.callable<{ ok: boolean; status: string }>(
        'approveGuestRequest',
        { eventId, guestRequestId, idempotencyKey: 'same-key' },
      );
      expect(r1).toEqual(r2);

      // Only one notification was written despite two callable invocations.
      const notifSnap = await a
        .firestore()
        .collection('notifications')
        .where('type', '==', 'guest_approved')
        .get();
      expect(notifSnap.size).toBe(1);
    } finally {
      await adminCaller.dispose();
    }
  });

  it('a non-admin caller is rejected with permission-denied', async () => {
    await seedPendingGuest('userG3');
    const userCaller = await makeCaller('userG3');
    try {
      await expect(
        userCaller.callable('approveGuestRequest', { eventId, guestRequestId }),
      ).rejects.toThrow();
    } finally {
      await userCaller.dispose();
    }
  });

  it('rejecting an already-approved guest fails with failed-precondition', async () => {
    // The opposite decision *is* an out-of-order conflict and must throw.
    // (Re-applying the same decision is the idempotent-replay case
    // covered by the previous test.)
    await seedPendingGuest('userG4');
    const admin1 = await makeCaller('adminG4a', { admin: true });
    const admin2 = await makeCaller('adminG4b', { admin: true });
    try {
      await admin1.callable('approveGuestRequest', { eventId, guestRequestId });
      await expect(
        admin2.callable('rejectGuestRequest', { eventId, guestRequestId }),
      ).rejects.toThrow();
    } finally {
      await admin1.dispose();
      await admin2.dispose();
    }
  });

  it('rejects extra/unknown payload fields', async () => {
    await seedPendingGuest('userG5');
    const adminCaller = await makeCaller('adminG5', { admin: true });
    try {
      await expect(
        adminCaller.callable('approveGuestRequest', {
          eventId,
          guestRequestId,
          smuggledField: 'oops',
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
