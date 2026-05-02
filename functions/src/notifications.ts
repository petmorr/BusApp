import { FieldValue, getFirestore } from "firebase-admin/firestore";

export type NotificationType =
  | "attendance_request"
  | "attendance_reminder"
  | "pending_guest_reminder"
  | "guest_approved"
  | "guest_rejected"
  | "capacity_alert"
  | "operational_update";

export interface NotificationPayload {
  eventId?: string;
  type: NotificationType;
  title: string;
  body: string;
  targetUserIds: string[];
  sentByUserId: string;
}

export async function recordNotification(
  payload: NotificationPayload
): Promise<string> {
  const db = getFirestore();
  const notificationRef = db.collection("notifications").doc();

  await notificationRef.set({
    eventId: payload.eventId ?? null,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    targetUserIds: payload.targetUserIds,
    sentByUserId: payload.sentByUserId,
    status: "queued",
    createdAt: FieldValue.serverTimestamp(),
    sentAt: null,
  });

  return notificationRef.id;
}

export async function resolveAttendanceReminderTargets(eventId: string): Promise<string[]> {
  const db = getFirestore();
  const activeLinks = await db
    .collection("memberUserLinks")
    .where("status", "==", "active")
    .get();
  const memberResponses = await db.collection("events").doc(eventId).collection("memberResponses").get();
  const respondedMemberIds = new Set(memberResponses.docs.map((doc) => doc.id));
  const targets = new Set<string>();

  activeLinks.docs.forEach((doc) => {
    const userId = doc.get("userId");
    const memberId = doc.get("memberId");
    if (
      typeof userId === "string" &&
      typeof memberId === "string" &&
      !respondedMemberIds.has(memberId)
    ) {
      targets.add(userId);
    }
  });

  return [...targets];
}

export async function resolveOperationalUpdateTargets(eventId: string): Promise<string[]> {
  const db = getFirestore();
  const [attendingResponses, adminUsers, eventHelpers] = await Promise.all([
    db
      .collection("events")
      .doc(eventId)
      .collection("memberResponses")
      .where("status", "==", "attending")
      .get(),
    db.collection("users").where("roles", "array-contains", "admin").where("isActive", "==", true).get(),
    db.collection("events").doc(eventId).collection("helpers").get(),
  ]);

  const memberIds = attendingResponses.docs.map((doc) => doc.id);
  const targets = new Set<string>();

  await Promise.all(
    memberIds.map(async (memberId) => {
      const links = await db
        .collection("memberUserLinks")
        .where("memberId", "==", memberId)
        .where("status", "==", "active")
        .get();
      links.docs.forEach((doc) => {
        const userId = doc.get("userId");
        if (typeof userId === "string") {
          targets.add(userId);
        }
      });
    })
  );

  adminUsers.docs.forEach((doc) => targets.add(doc.id));
  eventHelpers.docs.forEach((doc) => targets.add(doc.id));
  return [...targets];
}
