import * as admin from 'firebase-admin';
import { CapacityStatus } from '../types/domain';
import { sendNotificationToUsers } from './notifications';

interface AlertChangeArgs {
  eventId: string;
  previousStatus: CapacityStatus;
  nextStatus: CapacityStatus;
  previousPendingGuestRisk: boolean;
  nextPendingGuestRisk: boolean;
}

/**
 * Sends a capacity_alert push to admins when the event's capacityStatus
 * transitions to near/at/over, or when pendingGuestRisk newly becomes true.
 * The function deliberately does not re-send if the status is unchanged.
 */
export async function sendCapacityAlertIfChanged(
  args: AlertChangeArgs,
): Promise<void> {
  const statusChanged =
    args.nextStatus !== args.previousStatus &&
    (args.nextStatus === 'near' ||
      args.nextStatus === 'at' ||
      args.nextStatus === 'over');
  const pendingGuestNewlyRisky =
    args.nextPendingGuestRisk && !args.previousPendingGuestRisk;

  if (!statusChanged && !pendingGuestNewlyRisky) return;

  const adminUserIds = await fetchAdminUserIds();
  if (adminUserIds.length === 0) return;

  const title = statusChanged
    ? `Bus capacity ${args.nextStatus}`
    : 'Pending guest seats may exceed capacity';
  const body = statusChanged
    ? `Approved seats are now ${args.nextStatus} the configured capacity.`
    : 'Pending guest requests could push this event over capacity if approved.';

  await sendNotificationToUsers({
    eventId: args.eventId,
    type: 'capacity_alert',
    title,
    body,
    targetUserIds: adminUserIds,
    sentByUserId: 'system',
    data: { eventId: args.eventId, screen: 'event_detail' },
  });

  await admin.firestore().collection('events').doc(args.eventId).update({
    lastCapacityAlertSentAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function fetchAdminUserIds(): Promise<string[]> {
  // Admins are tracked via custom claims, but we mirror a flag on the user doc
  // (`roles` array) so we can query for them without paging Auth users.
  const snap = await admin
    .firestore()
    .collection('users')
    .where('roles', 'array-contains', 'admin')
    .where('isActive', '==', true)
    .get();
  return snap.docs.map((d) => d.id);
}
