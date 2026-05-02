import * as admin from 'firebase-admin';

export type CapacityStatus = 'under' | 'near' | 'at' | 'over';

export interface CapacitySummary {
  confirmedMemberSeats: number;
  approvedGuestSeats: number;
  pendingGuestSeats: number;
  approvedTotal: number;
  potentialTotal: number;
  status: CapacityStatus;
  pendingGuestRisk: boolean;
}

export function deriveCapacitySummary(input: {
  confirmedMemberSeats: number;
  approvedGuestSeats: number;
  pendingGuestSeats: number;
  capacityMax: number;
  capacityNearThresholdPercent?: number;
}): CapacitySummary {
  const approvedTotal = input.confirmedMemberSeats + input.approvedGuestSeats;
  const potentialTotal = approvedTotal + input.pendingGuestSeats;
  const nearThreshold = Math.ceil(
    input.capacityMax * ((input.capacityNearThresholdPercent ?? 90) / 100),
  );

  let status: CapacityStatus = 'under';
  if (approvedTotal > input.capacityMax) {
    status = 'over';
  } else if (approvedTotal === input.capacityMax) {
    status = 'at';
  } else if (approvedTotal >= nearThreshold) {
    status = 'near';
  }

  return {
    confirmedMemberSeats: input.confirmedMemberSeats,
    approvedGuestSeats: input.approvedGuestSeats,
    pendingGuestSeats: input.pendingGuestSeats,
    approvedTotal,
    potentialTotal,
    status,
    pendingGuestRisk: potentialTotal > input.capacityMax,
  };
}

export async function recalculateEventCapacity(eventId: string): Promise<CapacitySummary> {
  const db = admin.firestore();
  const eventRef = db.collection('events').doc(eventId);
  const eventSnap = await eventRef.get();

  if (!eventSnap.exists) {
    throw new Error(`Event ${eventId} does not exist`);
  }

  const event = eventSnap.data() ?? {};
  const [attendingMembers, approvedGuests, pendingGuests] = await Promise.all([
    eventRef.collection('memberResponses').where('status', '==', 'attending').count().get(),
    eventRef.collection('guestRequests').where('status', '==', 'approved').count().get(),
    eventRef.collection('guestRequests').where('status', '==', 'pending').count().get(),
  ]);

  const previousStatus = event.capacityStatus as CapacityStatus | undefined;
  const previousPendingGuestRisk = Boolean(event.pendingGuestRisk);
  const summary = deriveCapacitySummary({
    confirmedMemberSeats: attendingMembers.data().count,
    approvedGuestSeats: approvedGuests.data().count,
    pendingGuestSeats: pendingGuests.data().count,
    capacityMax: Number(event.capacityMax ?? 0),
    capacityNearThresholdPercent: Number(event.capacityNearThresholdPercent ?? 90),
  });

  await eventRef.update({
    capacityConfirmedMemberSeats: summary.confirmedMemberSeats,
    capacityApprovedGuestSeats: summary.approvedGuestSeats,
    capacityPendingGuestSeats: summary.pendingGuestSeats,
    capacityApprovedTotal: summary.approvedTotal,
    capacityPotentialTotal: summary.potentialTotal,
    capacityStatus: summary.status,
    pendingGuestRisk: summary.pendingGuestRisk,
    capacityLastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await maybeCreateCapacityAlert(eventId, previousStatus, previousPendingGuestRisk, summary);
  return summary;
}

async function maybeCreateCapacityAlert(
  eventId: string,
  previousStatus: CapacityStatus | undefined,
  previousPendingGuestRisk: boolean,
  summary: CapacitySummary,
): Promise<void> {
  const shouldAlertStatus =
    summary.status !== previousStatus && ['near', 'at', 'over'].includes(summary.status);
  const shouldAlertRisk = summary.pendingGuestRisk && !previousPendingGuestRisk;

  if (!shouldAlertStatus && !shouldAlertRisk) {
    return;
  }

  const adminUsers = await admin
    .firestore()
    .collection('users')
    .where('roles', 'array-contains', 'admin')
    .where('isActive', '==', true)
    .get();

  if (adminUsers.empty) {
    return;
  }

  await admin.firestore().collection('notifications').add({
    eventId,
    type: 'capacity_alert',
    title: 'Bus capacity alert',
    body: shouldAlertRisk
      ? 'Pending guest requests could exceed the configured bus capacity.'
      : `Approved bus seats are now ${summary.status}.`,
    targetUserIds: adminUsers.docs.map((doc) => doc.id),
    sentByUserId: 'system',
    status: 'queued',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sentAt: null,
  });
}
