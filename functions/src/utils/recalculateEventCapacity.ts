import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { calculateCapacity } from './capacity';
import { sendCapacityAlertIfChanged } from './capacityAlerts';

/**
 * Recalculate capacity totals for an event and persist them on the event
 * document. Triggered from member-response and guest-request writes, and
 * whenever the event's capacityMax changes.
 */
export async function recalculateEventCapacity(eventId: string): Promise<void> {
  const db = admin.firestore();
  const eventRef = db.collection('events').doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    logger.warn('recalculateEventCapacity: event not found', { eventId });
    return;
  }
  const eventData = eventSnap.data() as {
    capacityMax: number;
    capacityNearThresholdPercent?: number;
    capacityStatus?: string;
    pendingGuestRisk?: boolean;
  };

  const memberResponsesSnap = await eventRef
    .collection('memberResponses')
    .where('status', '==', 'attending')
    .count()
    .get();

  const approvedGuestsSnap = await eventRef
    .collection('guestRequests')
    .where('status', '==', 'approved')
    .count()
    .get();

  const pendingGuestsSnap = await eventRef
    .collection('guestRequests')
    .where('status', '==', 'pending')
    .count()
    .get();

  const result = calculateCapacity({
    confirmedMemberSeats: memberResponsesSnap.data().count,
    approvedGuestSeats: approvedGuestsSnap.data().count,
    pendingGuestSeats: pendingGuestsSnap.data().count,
    capacityMax: eventData.capacityMax,
    capacityNearThresholdPercent: eventData.capacityNearThresholdPercent ?? 90,
  });

  await eventRef.update({
    capacityConfirmedMemberSeats: result.confirmedMemberSeats,
    capacityApprovedGuestSeats: result.approvedGuestSeats,
    capacityPendingGuestSeats: result.pendingGuestSeats,
    capacityApprovedTotal: result.approvedSeats,
    capacityPotentialTotal: result.potentialSeats,
    capacityStatus: result.capacityStatus,
    pendingGuestRisk: result.pendingGuestRisk,
    capacityLastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await sendCapacityAlertIfChanged({
    eventId,
    previousStatus: (eventData.capacityStatus as any) ?? 'under',
    previousPendingGuestRisk: !!eventData.pendingGuestRisk,
    nextStatus: result.capacityStatus,
    nextPendingGuestRisk: result.pendingGuestRisk,
  });
}
