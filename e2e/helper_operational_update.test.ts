import { getAdmin, makeCaller, resetEmulators } from './helpers';

const eventId = 'eventH';

beforeEach(async () => {
  await resetEmulators();
  const a = getAdmin();
  await a.firestore().collection('events').doc(eventId).set({
    title: 'H Match',
    eventDate: a.firestore.Timestamp.fromDate(new Date(Date.now() + 86_400_000)),
    status: 'open',
    capacityMax: 50,
    capacityNearThresholdPercent: 90,
    cutoffAt: null,
    capacityStatus: 'under',
    pendingGuestRisk: false,
    lastCapacityAlertSentAt: null,
    createdByAdminId: 'adminH',
    createdAt: a.firestore.FieldValue.serverTimestamp(),
    updatedAt: a.firestore.FieldValue.serverTimestamp(),
  });
});

async function assignHelper(userId: string): Promise<void> {
  const a = getAdmin();
  await a
    .firestore()
    .collection('events')
    .doc(eventId)
    .collection('helpers')
    .doc(userId)
    .set({
      userId,
      assignedByAdminId: 'adminH',
      createdAt: a.firestore.FieldValue.serverTimestamp(),
    });
}

describe('E2E: helper operational update', () => {
  it('an assigned helper can pin parked-bus location and a notification is recorded', async () => {
    const helperUid = 'helperH1';
    await assignHelper(helperUid);
    const a = getAdmin();
    const helper = await makeCaller(helperUid, { helper: true });
    try {
      const out = await helper.callable<{ ok: boolean }>(
        'updateParkedBusLocation',
        {
          eventId,
          lat: 55.860916,
          lng: -4.251433,
          label: 'Car Park B',
          notes: 'Near north gate',
          notifyAttending: true,
        },
      );
      expect(out).toEqual({ ok: true });

      const eventSnap = await a.firestore().collection('events').doc(eventId).get();
      const loc = eventSnap.data()?.parkedBusLocation;
      expect(loc.lat).toBeCloseTo(55.860916, 5);
      expect(loc.lng).toBeCloseTo(-4.251433, 5);
      expect(loc.updatedByUserId).toBe(helperUid);

      const auditSnap = await a
        .firestore()
        .collection('auditLogs')
        .where('action', '==', 'update_parked_bus_location')
        .get();
      expect(auditSnap.size).toBe(1);
      // PII redaction: lat/lng must be rounded to ~1km grid in the audit
      // record.
      auditSnap.forEach((d) => {
        const after = d.data().after as { lat: number; lng: number };
        expect(after.lat).toBe(55.86);
        expect(after.lng).toBe(-4.25);
      });
    } finally {
      await helper.dispose();
    }
  });

  it('an unassigned helper CANNOT update parked-bus location', async () => {
    const helper = await makeCaller('helperH2', { helper: true });
    try {
      await expect(
        helper.callable('updateParkedBusLocation', {
          eventId,
          lat: 0,
          lng: 0,
        }),
      ).rejects.toThrow();
    } finally {
      await helper.dispose();
    }
  });

  it('admin CAN send an operational update without being an assigned helper', async () => {
    const adminCaller = await makeCaller('adminH2', { admin: true });
    try {
      const out = await adminCaller.callable<{ ok: boolean; recipients: number }>(
        'sendOperationalUpdate',
        {
          eventId,
          title: 'Pickup delayed',
          body: 'Bus delayed by 10 minutes due to traffic.',
        },
      );
      expect(out.ok).toBe(true);
      expect(typeof out.recipients).toBe('number');
    } finally {
      await adminCaller.dispose();
    }
  });

  it('rejects out-of-range latitude (validator)', async () => {
    const helperUid = 'helperH3';
    await assignHelper(helperUid);
    const helper = await makeCaller(helperUid, { helper: true });
    try {
      await expect(
        helper.callable('updateParkedBusLocation', {
          eventId,
          lat: 200,
          lng: 0,
        }),
      ).rejects.toThrow();
    } finally {
      await helper.dispose();
    }
  });
});
