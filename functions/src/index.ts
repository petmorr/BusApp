import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {recalculateEventCapacity} from "./capacity";
import {
  recordNotification,
  resolveAttendanceReminderTargets,
  resolveOperationalUpdateTargets,
} from "./notifications";

initializeApp();

const db = getFirestore();

function requireAuth(request: {auth?: {uid: string; token: Record<string, unknown>}}): string {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in is required.");
  }
  return request.auth.uid;
}

function requireAdmin(request: {auth?: {uid: string; token: Record<string, unknown>}}): string {
  const uid = requireAuth(request);
  if (request.auth?.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin access is required.");
  }
  return uid;
}

async function requireAdminOrAssignedHelper(
  eventId: string,
  request: {auth?: {uid: string; token: Record<string, unknown>}},
): Promise<string> {
  const uid = requireAuth(request);
  if (request.auth?.token.admin === true) {
    return uid;
  }
  if (request.auth?.token.helper !== true) {
    throw new HttpsError("permission-denied", "Helper access is required.");
  }

  const helper = await db.doc(`events/${eventId}/helpers/${uid}`).get();
  if (!helper.exists) {
    throw new HttpsError("permission-denied", "Helper is not assigned to this event.");
  }
  return uid;
}

function readString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${key} is required.`);
  }
  return value.trim();
}

async function writeAuditLog(input: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityPath: string;
  before?: FirebaseFirestore.DocumentData | null;
  after?: FirebaseFirestore.DocumentData | null;
}) {
  await db.collection("auditLogs").add({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const onMemberResponseWrite = onDocumentWritten(
  "events/{eventId}/memberResponses/{memberId}",
  async (event) => {
    await recalculateEventCapacity(event.params.eventId);
  },
);

export const onGuestRequestWrite = onDocumentWritten(
  "events/{eventId}/guestRequests/{guestRequestId}",
  async (event) => {
    await recalculateEventCapacity(event.params.eventId);
  },
);

export const approveGuestRequest = onCall(async (request) => {
  const adminId = requireAdmin(request);
  const data = request.data as Record<string, unknown>;
  const eventId = readString(data, "eventId");
  const guestRequestId = readString(data, "guestRequestId");
  const ref = db.doc(`events/${eventId}/guestRequests/${guestRequestId}`);
  const before = await ref.get();
  if (!before.exists) {
    throw new HttpsError("not-found", "Guest request not found.");
  }

  await ref.update({
    status: "approved",
    decisionByAdminId: adminId,
    decisionAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await recalculateEventCapacity(eventId);
  await writeAuditLog({
    actorUserId: adminId,
    action: "approve_guest_request",
    entityType: "guestRequest",
    entityPath: ref.path,
    before: before.data(),
    after: {status: "approved", decisionByAdminId: adminId},
  });

  const after = await ref.get();
  const requestedByUserId = after.get("requestedByUserId");
  if (typeof requestedByUserId === "string") {
    await recordNotification({
      eventId,
      type: "guest_approved",
      title: "Guest seat approved",
      body: `${after.get("guestName") ?? "Guest"} has been approved for this bus.`,
      targetUserIds: [requestedByUserId],
      sentByUserId: adminId,
    });
  }

  return {ok: true};
});

export const rejectGuestRequest = onCall(async (request) => {
  const adminId = requireAdmin(request);
  const data = request.data as Record<string, unknown>;
  const eventId = readString(data, "eventId");
  const guestRequestId = readString(data, "guestRequestId");
  const ref = db.doc(`events/${eventId}/guestRequests/${guestRequestId}`);
  const before = await ref.get();
  if (!before.exists) {
    throw new HttpsError("not-found", "Guest request not found.");
  }

  await ref.update({
    status: "rejected",
    decisionByAdminId: adminId,
    decisionAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await recalculateEventCapacity(eventId);
  await writeAuditLog({
    actorUserId: adminId,
    action: "reject_guest_request",
    entityType: "guestRequest",
    entityPath: ref.path,
    before: before.data(),
    after: {status: "rejected", decisionByAdminId: adminId},
  });

  const after = await ref.get();
  const requestedByUserId = after.get("requestedByUserId");
  if (typeof requestedByUserId === "string") {
    await recordNotification({
      eventId,
      type: "guest_rejected",
      title: "Guest seat not approved",
      body: `${after.get("guestName") ?? "Guest"} was not approved for this bus.`,
      targetUserIds: [requestedByUserId],
      sentByUserId: adminId,
    });
  }

  return {ok: true};
});

export const sendAttendanceReminder = onCall(async (request) => {
  const adminId = requireAdmin(request);
  const eventId = readString(request.data as Record<string, unknown>, "eventId");
  const targetUserIds = await resolveAttendanceReminderTargets(eventId);

  await recordNotification({
    eventId,
    type: "attendance_reminder",
    title: "Bus attendance reminder",
    body: "Please confirm your seats for this event.",
    targetUserIds,
    sentByUserId: adminId,
  });

  await writeAuditLog({
    actorUserId: adminId,
    action: "send_attendance_reminder",
    entityType: "event",
    entityPath: `events/${eventId}`,
    after: {targetUserIds},
  });

  return {ok: true, targetCount: targetUserIds.length};
});

export const sendOperationalUpdate = onCall(async (request) => {
  const data = request.data as Record<string, unknown>;
  const eventId = readString(data, "eventId");
  const body = readString(data, "body");
  const actorId = await requireAdminOrAssignedHelper(eventId, request);
  const targetUserIds = await resolveOperationalUpdateTargets(eventId);

  await recordNotification({
    eventId,
    type: "operational_update",
    title: "Bus update",
    body,
    targetUserIds,
    sentByUserId: actorId,
  });

  await writeAuditLog({
    actorUserId: actorId,
    action: "send_operational_update",
    entityType: "event",
    entityPath: `events/${eventId}`,
    after: {body, targetUserIds},
  });

  return {ok: true, targetCount: targetUserIds.length};
});

export const updateParkedBusLocation = onCall(async (request) => {
  const data = request.data as Record<string, unknown>;
  const eventId = readString(data, "eventId");
  const actorId = await requireAdminOrAssignedHelper(eventId, request);
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpsError("invalid-argument", "Valid lat and lng are required.");
  }
  const label = typeof data.label === "string" ? data.label : "";
  const notes = typeof data.notes === "string" ? data.notes : "";
  const ref = db.doc(`events/${eventId}`);
  const before = await ref.get();

  await ref.update({
    parkedBusLocation: {
      lat,
      lng,
      label,
      notes,
      updatedByUserId: actorId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAuditLog({
    actorUserId: actorId,
    action: "update_parked_bus_location",
    entityType: "event",
    entityPath: ref.path,
    before: before.data(),
    after: {parkedBusLocation: {lat, lng, label, notes}},
  });

  return {ok: true};
});

export const assignEventHelper = onCall(async (request) => {
  const adminId = requireAdmin(request);
  const data = request.data as Record<string, unknown>;
  const eventId = readString(data, "eventId");
  const helperUserId = readString(data, "helperUserId");
  const ref = db.doc(`events/${eventId}/helpers/${helperUserId}`);

  await ref.set({
    userId: helperUserId,
    assignedByAdminId: adminId,
    createdAt: FieldValue.serverTimestamp(),
  });
  await writeAuditLog({
    actorUserId: adminId,
    action: "assign_event_helper",
    entityType: "eventHelper",
    entityPath: ref.path,
    after: {userId: helperUserId},
  });

  return {ok: true};
});

export const recalculateEventCapacityNow = onCall(async (request) => {
  requireAdmin(request);
  const eventId = readString(request.data as Record<string, unknown>, "eventId");
  const summary = await recalculateEventCapacity(eventId);
  logger.info("Capacity recalculated manually", {eventId, summary});
  return summary;
});
