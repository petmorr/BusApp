import { db, serverTimestamp } from './firestore';
import { redactForAudit } from './redaction';

export interface AuditLogEntry {
  actorUserId: string;
  action: string;
  entityType: string;
  entityPath: string;
  /**
   * Snapshot of the relevant document(s) before / after the action. The
   * fields are redacted by `redactForAudit` before being written, per the
   * PII redaction policy in `docs/observability.md`.
   */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await db()
    .collection('auditLogs')
    .add({
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityPath: entry.entityPath,
      before: entry.before ? redactForAudit(entry.before) : null,
      after: entry.after ? redactForAudit(entry.after) : null,
      createdAt: serverTimestamp(),
    });
}
