import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAdmin, requireAdminOrHelperFor } from '../utils/auth';
import { sendNotificationToUsers } from '../utils/notifications';
import { writeAuditLog } from '../utils/audit';
import { validate, Schema } from '../utils/validation';
import { callableDefaults } from '../utils/options';
import { reportFailure } from '../utils/errors';

interface SimpleEventInput extends Record<string, unknown> {
  eventId: string;
  title?: string;
  body?: string;
  idempotencyKey?: string;
}

const simpleEventSchema: Schema = {
  eventId: { type: 'string', minLength: 1, maxLength: 200 },
  title: { type: 'string', optional: true, maxLength: 200 },
  body: { type: 'string', optional: true, maxLength: 1000 },
  idempotencyKey: { type: 'string', optional: true, maxLength: 200 },
};

/**
 * Send the initial attendance request push to every user that represents at
 * least one active member (and whose own account is active).
 */
export const sendAttendanceRequest = onCall<SimpleEventInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<SimpleEventInput>(req.data, simpleEventSchema);
    try {
      const targetUserIds = await targetActiveLinkedUsers();
      const event = await loadEvent(data.eventId);
      const idempotencyKey = data.idempotencyKey
        ? `attendance-request:${data.eventId}:${data.idempotencyKey}`
        : `attendance-request:${data.eventId}`;
      await sendNotificationToUsers({
        eventId: data.eventId,
        type: 'attendance_request',
        title: data.title ?? 'Confirm bus attendance',
        body:
          data.body ??
          `Please confirm seats for "${event.title}" before the cutoff.`,
        targetUserIds,
        sentByUserId: uid,
        data: { eventId: data.eventId, screen: 'event_detail' },
        idempotencyKey,
      });
      await writeAuditLog({
        actorUserId: uid,
        action: 'send_attendance_request',
        entityType: 'event',
        entityPath: `events/${data.eventId}`,
        after: { recipients: targetUserIds.length },
      });
      return { ok: true, recipients: targetUserIds.length };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'send_attendance_request',
          entityType: 'event',
          entityPath: `events/${data.eventId}`,
        },
        err,
      );
      throw err;
    }
  },
);

/**
 * Send a reminder to users who have at least one linked active member without
 * a memberResponse for the given event.
 */
export const sendAttendanceReminder = onCall<SimpleEventInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<SimpleEventInput>(req.data, simpleEventSchema);
    try {
      const allUsers = await targetActiveLinkedUsers();
      const respondedMembers = await loadRespondedMemberIds(data.eventId);
      const usersWithMissing: string[] = [];
      for (const userId of allUsers) {
        const linkedMembers = await loadActiveLinkedMemberIds(userId);
        const missing = linkedMembers.filter((m) => !respondedMembers.has(m));
        if (missing.length > 0) usersWithMissing.push(userId);
      }
      const event = await loadEvent(data.eventId);
      const idempotencyKey = data.idempotencyKey
        ? `attendance-reminder:${data.eventId}:${data.idempotencyKey}`
        : undefined;
      await sendNotificationToUsers({
        eventId: data.eventId,
        type: 'attendance_reminder',
        title: data.title ?? 'Bus attendance reminder',
        body: data.body ?? `Please confirm seats for "${event.title}".`,
        targetUserIds: usersWithMissing,
        sentByUserId: uid,
        data: { eventId: data.eventId, screen: 'event_detail' },
        idempotencyKey,
      });
      await writeAuditLog({
        actorUserId: uid,
        action: 'send_attendance_reminder',
        entityType: 'event',
        entityPath: `events/${data.eventId}`,
        after: { recipients: usersWithMissing.length },
      });
      return { ok: true, recipients: usersWithMissing.length };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'send_attendance_reminder',
          entityType: 'event',
          entityPath: `events/${data.eventId}`,
        },
        err,
      );
      throw err;
    }
  },
);

/**
 * Send a reminder to users who have one or more pending guest requests.
 */
export const sendPendingGuestReminder = onCall<SimpleEventInput>(
  callableDefaults,
  async (req) => {
    const { uid } = requireAdmin(req);
    const data = validate<SimpleEventInput>(req.data, simpleEventSchema);
    try {
      const snap = await admin
        .firestore()
        .collection('events')
        .doc(data.eventId)
        .collection('guestRequests')
        .where('status', '==', 'pending')
        .get();
      const userIds = Array.from(
        new Set(
          snap.docs.map(
            (d) => (d.data() as { requestedByUserId: string }).requestedByUserId,
          ),
        ),
      );
      const event = await loadEvent(data.eventId);
      await sendNotificationToUsers({
        eventId: data.eventId,
        type: 'pending_guest_reminder',
        title: data.title ?? 'Guest request awaiting decision',
        body:
          data.body ??
          `You have pending guest requests for "${event.title}".`,
        targetUserIds: userIds,
        sentByUserId: uid,
        data: { eventId: data.eventId, screen: 'event_detail' },
        idempotencyKey: data.idempotencyKey
          ? `pending-guest-reminder:${data.eventId}:${data.idempotencyKey}`
          : undefined,
      });
      await writeAuditLog({
        actorUserId: uid,
        action: 'send_pending_guest_reminder',
        entityType: 'event',
        entityPath: `events/${data.eventId}`,
        after: { recipients: userIds.length },
      });
      return { ok: true, recipients: userIds.length };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'send_pending_guest_reminder',
          entityType: 'event',
          entityPath: `events/${data.eventId}`,
        },
        err,
      );
      throw err;
    }
  },
);

interface OperationalInput extends Record<string, unknown> {
  eventId: string;
  title: string;
  body: string;
  idempotencyKey?: string;
}

const operationalSchema: Schema = {
  eventId: { type: 'string', minLength: 1, maxLength: 200 },
  title: { type: 'string', minLength: 1, maxLength: 200 },
  body: { type: 'string', minLength: 1, maxLength: 1000 },
  idempotencyKey: { type: 'string', optional: true, maxLength: 200 },
};

/**
 * Send an operational update (route change, parked-bus update, delay note) to
 * users who have at least one attending member response, plus admins and any
 * assigned helpers.
 */
export const sendOperationalUpdate = onCall<OperationalInput>(
  callableDefaults,
  async (req) => {
    const data = validate<OperationalInput>(req.data, operationalSchema);
    const isAssigned = await isUserAssignedHelperForEvent(req.auth?.uid, data.eventId);
    const { uid, isAdmin } = requireAdminOrHelperFor(req, isAssigned);
    try {
      const targetUserIds = await loadOperationalUpdateRecipients(data.eventId);
      await sendNotificationToUsers({
        eventId: data.eventId,
        type: 'operational_update',
        title: data.title,
        body: data.body,
        targetUserIds,
        sentByUserId: uid,
        data: { eventId: data.eventId, screen: 'event_detail' },
        idempotencyKey: data.idempotencyKey
          ? `operational-update:${data.eventId}:${data.idempotencyKey}`
          : undefined,
      });
      await writeAuditLog({
        actorUserId: uid,
        action: 'send_operational_update',
        entityType: 'event',
        entityPath: `events/${data.eventId}`,
        after: { recipients: targetUserIds.length, isAdmin },
      });
      return { ok: true, recipients: targetUserIds.length };
    } catch (err) {
      await reportFailure(
        {
          actorUserId: uid,
          action: 'send_operational_update',
          entityType: 'event',
          entityPath: `events/${data.eventId}`,
        },
        err,
      );
      throw err;
    }
  },
);

// ----- helpers -----

async function loadEvent(eventId: string): Promise<{ title: string }> {
  const snap = await admin.firestore().collection('events').doc(eventId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Event not found.');
  return snap.data() as { title: string };
}

async function targetActiveLinkedUsers(): Promise<string[]> {
  const snap = await admin
    .firestore()
    .collection('memberUserLinks')
    .where('status', '==', 'active')
    .get();
  const userIds = new Set<string>();
  snap.forEach((d) => {
    const data = d.data() as { userId: string };
    if (data.userId) userIds.add(data.userId);
  });
  return Array.from(userIds);
}

async function loadRespondedMemberIds(eventId: string): Promise<Set<string>> {
  const snap = await admin
    .firestore()
    .collection('events')
    .doc(eventId)
    .collection('memberResponses')
    .get();
  const ids = new Set<string>();
  snap.forEach((d) => ids.add(d.id));
  return ids;
}

async function loadActiveLinkedMemberIds(userId: string): Promise<string[]> {
  const snap = await admin
    .firestore()
    .collection('memberUserLinks')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();
  return snap.docs.map((d) => (d.data() as { memberId: string }).memberId);
}

async function loadOperationalUpdateRecipients(eventId: string): Promise<string[]> {
  const recipients = new Set<string>();

  const responsesSnap = await admin
    .firestore()
    .collection('events')
    .doc(eventId)
    .collection('memberResponses')
    .where('status', '==', 'attending')
    .get();
  for (const d of responsesSnap.docs) {
    const data = d.data() as { respondingUserId?: string; memberId: string };
    if (data.respondingUserId) recipients.add(data.respondingUserId);
    const linksSnap = await admin
      .firestore()
      .collection('memberUserLinks')
      .where('memberId', '==', data.memberId)
      .where('status', '==', 'active')
      .get();
    linksSnap.forEach((l) => {
      const linkData = l.data() as { userId: string };
      if (linkData.userId) recipients.add(linkData.userId);
    });
  }

  const adminsSnap = await admin
    .firestore()
    .collection('users')
    .where('roles', 'array-contains', 'admin')
    .where('isActive', '==', true)
    .get();
  adminsSnap.forEach((d) => recipients.add(d.id));

  const helpersSnap = await admin
    .firestore()
    .collection('events')
    .doc(eventId)
    .collection('helpers')
    .get();
  helpersSnap.forEach((d) => recipients.add(d.id));

  return Array.from(recipients);
}

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
