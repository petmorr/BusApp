import { logger } from 'firebase-functions/v2';
import { HttpsError } from 'firebase-functions/v2/https';
import { writeAuditLog } from './audit';
import { redactForAudit } from './redaction';

/**
 * Shared classification of errors thrown by callables / triggers, so we have
 * a single place that decides:
 *
 * - which `HttpsError` code should be returned to the client,
 * - whether the error is transient (Firebase will retry the trigger) or
 *   permanent (no point retrying),
 * - what gets recorded in the audit log so an operator can see *that*
 *   something failed even when push delivery itself fails.
 *
 * The policy is deliberately conservative: anything we cannot positively
 * classify is treated as `internal` + transient. Triggers should re-throw on
 * transient errors so Firestore re-invokes them.
 */

export type ErrorClass = 'invalid' | 'permission' | 'not_found' | 'conflict' | 'transient' | 'permanent';

export interface ClassifiedError {
  classification: ErrorClass;
  httpsCode: HttpsError['code'];
  message: string;
  retryable: boolean;
  cause?: unknown;
}

export function classify(err: unknown): ClassifiedError {
  if (err instanceof HttpsError) {
    return {
      classification: classFromHttpsCode(err.code),
      httpsCode: err.code,
      message: err.message,
      retryable: isRetryable(err.code),
      cause: err,
    };
  }
  const message = (err as Error)?.message ?? String(err);
  // Treat unexpected errors as transient by default — Firestore-trigger
  // retries are the safety net for "the database blipped" style failures.
  return {
    classification: 'transient',
    httpsCode: 'internal',
    message,
    retryable: true,
    cause: err,
  };
}

function classFromHttpsCode(code: HttpsError['code']): ErrorClass {
  switch (code) {
    case 'invalid-argument':
    case 'failed-precondition':
    case 'out-of-range':
      return 'invalid';
    case 'permission-denied':
    case 'unauthenticated':
      return 'permission';
    case 'not-found':
      return 'not_found';
    case 'already-exists':
    case 'aborted':
      return 'conflict';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'resource-exhausted':
    case 'cancelled':
    case 'internal':
      return 'transient';
    default:
      return 'permanent';
  }
}

function isRetryable(code: HttpsError['code']): boolean {
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'internal'
  );
}

/**
 * Log + audit a failure inside a trigger / callable, then re-throw the
 * appropriate error. Use as:
 *
 *     try { ... } catch (e) { await reportFailure({ actorUserId, action, ... }, e); throw e; }
 *
 * Audit-log persistence policy (privacy):
 *
 * - For `HttpsError`s we persist the `message` because it is developer-
 *   authored and part of the callable's public contract.
 * - For any other error (Firestore / Auth / unexpected) we persist the
 *   classification + code but REPLACE the raw `Error.message` with
 *   `[redacted]`. Raw messages can echo Firestore paths, Auth emails, or
 *   identifiers picked up from wrapped causes; those do not belong in
 *   `auditLogs` (whose PII posture is maintained separately from Cloud
 *   Logging). The full detail is still emitted to `logger.error` so
 *   operators can triage via Cloud Logging.
 */
export async function reportFailure(
  ctx: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityPath: string;
    extra?: Record<string, unknown>;
  },
  err: unknown,
): Promise<ClassifiedError> {
  const c = classify(err);
  const isHttpsErr = err instanceof HttpsError;
  const redactedExtra = ctx.extra ? redactForAudit(ctx.extra) : undefined;
  logger.error('callable/trigger failed', {
    action: ctx.action,
    entityPath: ctx.entityPath,
    classification: c.classification,
    code: c.httpsCode,
    retryable: c.retryable,
    message: c.message,
    actorUserId: ctx.actorUserId,
    ...(redactedExtra ?? {}),
  });
  await writeAuditLog({
    actorUserId: ctx.actorUserId,
    action: `${ctx.action}__failed`,
    entityType: ctx.entityType,
    entityPath: ctx.entityPath,
    after: {
      classification: c.classification,
      code: c.httpsCode,
      message: isHttpsErr ? c.message : '[redacted]',
      ...(redactedExtra ?? {}),
    },
  }).catch((auditErr) => {
    // Never let audit-log failure mask the original error.
    logger.error('failed to write failure audit log', {
      action: ctx.action,
      entityPath: ctx.entityPath,
      auditError: (auditErr as Error)?.message,
    });
  });
  return c;
}
