import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdminOrHelperFor } from '../utils/auth';
import { writeAuditLog } from '../utils/audit';
import { sendNotificationToUsers } from '../utils/notifications';

interface UpdateLocationInput {
  eventId: string;
  lat: number;
  lng: number;
  label?: string;
  notes?: string;
  notifyAttending?: boolean;
}

export const updateParkedBusLocation = onCall<UpdateLocationInput>(async (req) => {
  const data = req.data ?? ({} as UpdateLocationInput);
  if (!data.eventId || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
    throw new HttpsError('invalid-argument', 'eventId, lat and lng are required.');
  }
  const isAssigned = await isUserAssignedHelperForEvent(req.auth?.uid, data.eventId);
  const { uid } = requireAdminOrHelperFor(req, isAssigned);

  const eventRef = admin.firestore().collection('events').doc(data.eventId);
  const before = (await eventRef.get()).data();

  await eventRef.update({
    parkedBusLocation: {
      lat: data.lat,
      lng: data.lng,
      label: data.label ?? '',
      notes: data.notes ?? '',
      updatedByUserId: uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUserId: uid,
    action: 'update_parked_bus_location',
    entityType: 'event',
    entityPath: `events/${data.eventId}`,
    before: before?.parkedBusLocation,
    after: { lat: data.lat, lng: data.lng, label: data.label, notes: data.notes },
  });

  if (data.notifyAttending) {
    const targets = await loadAttendingUserIds(data.eventId);
    await sendNotificationToUsers({
      eventId: data.eventId,
      type: 'operational_update',
      title: 'Parked-bus location updated',
      body: data.label ? `Bus parked: ${data.label}` : 'Bus parked location updated.',
      targetUserIds: targets,
      sentByUserId: uid,
      data: { eventId: data.eventId, screen: 'event_detail' },
    });
  }
  return { ok: true };
});

async function isUserAssignedHelperForEvent(
  uid: string | undefined,
  eventId: string,
): Promise<boolean> {
  if (!uid) return false;
  const snap = await admin
    .firestore()
    .collection('events')
    .doc(eventId)
    .collection('helpers')
    .doc(uid)
    .get();
  return snap.exists;
}

async function loadAttendingUserIds(eventId: string): Promise<string[]> {
  const snap = await admin
    .firestore()
    .collection('events')
    .doc(eventId)
    .collection('memberResponses')
    .where('status', '==', 'attending')
    .get();
  const userIds = new Set<string>();
  for (const d of snap.docs) {
    const data = d.data() as { respondingUserId?: string; memberId: string };
    if (data.respondingUserId) userIds.add(data.respondingUserId);
    const linksSnap = await admin
      .firestore()
      .collection('memberUserLinks')
      .where('memberId', '==', data.memberId)
      .where('status', '==', 'active')
      .get();
    linksSnap.forEach((l) => {
      const link = l.data() as { userId: string };
      if (link.userId) userIds.add(link.userId);
    });
  }
  return Array.from(userIds);
}
