import * as admin from 'firebase-admin';

export interface AuditLogEntry {
  actorUserId: string;
  action: string;
  entityType: string;
  entityPath: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await admin.firestore().collection('auditLogs').add({
    ...entry,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
