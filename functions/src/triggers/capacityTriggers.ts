import {
  onDocumentWritten,
  Change,
  FirestoreEvent,
} from 'firebase-functions/v2/firestore';
import { recalculateEventCapacity } from '../utils/recalculateEventCapacity';

export const onMemberResponseWrite = onDocumentWritten(
  'events/{eventId}/memberResponses/{memberId}',
  async (event) => {
    await recalculateEventCapacity(event.params.eventId);
  },
);

export const onGuestRequestWrite = onDocumentWritten(
  'events/{eventId}/guestRequests/{guestRequestId}',
  async (event) => {
    await recalculateEventCapacity(event.params.eventId);
  },
);

export const onEventCapacityWrite = onDocumentWritten(
  'events/{eventId}',
  async (
    event: FirestoreEvent<Change<any> | undefined, { eventId: string }>,
  ) => {
    if (!event.data) return;
    const before = event.data.before?.data();
    const after = event.data.after?.data();
    if (!after) return;

    const capacityChanged =
      !before ||
      before.capacityMax !== after.capacityMax ||
      before.capacityNearThresholdPercent !==
        after.capacityNearThresholdPercent;

    if (capacityChanged) {
      await recalculateEventCapacity(event.params.eventId);
    }
  },
);
