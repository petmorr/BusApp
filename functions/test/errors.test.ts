import { HttpsError } from 'firebase-functions/v2/https';

const writeAuditLogMock = jest.fn();

jest.mock('../src/utils/audit', () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}));

// eslint-disable-next-line import/first -- mocks must be declared first.
import { classify, reportFailure } from '../src/utils/errors';

describe('classify', () => {
  it('maps HttpsError invalid-argument to invalid/non-retryable', () => {
    const c = classify(new HttpsError('invalid-argument', 'bad'));
    expect(c.classification).toBe('invalid');
    expect(c.httpsCode).toBe('invalid-argument');
    expect(c.retryable).toBe(false);
  });

  it('maps HttpsError permission-denied to permission/non-retryable', () => {
    const c = classify(new HttpsError('permission-denied', 'no'));
    expect(c.classification).toBe('permission');
    expect(c.retryable).toBe(false);
  });

  it('maps HttpsError unavailable to transient/retryable', () => {
    const c = classify(new HttpsError('unavailable', 'try later'));
    expect(c.classification).toBe('transient');
    expect(c.retryable).toBe(true);
  });

  it('maps HttpsError aborted to conflict but retryable', () => {
    const c = classify(new HttpsError('aborted', 'race'));
    expect(c.classification).toBe('conflict');
    expect(c.retryable).toBe(true);
  });

  it('treats unknown errors as transient internal', () => {
    const c = classify(new Error('boom'));
    expect(c.classification).toBe('transient');
    expect(c.httpsCode).toBe('internal');
    expect(c.retryable).toBe(true);
  });

  it('handles non-Error throws', () => {
    const c = classify('plain-string');
    expect(c.classification).toBe('transient');
    expect(c.message).toBe('plain-string');
  });
});

describe('reportFailure redaction', () => {
  beforeEach(() => {
    writeAuditLogMock.mockReset();
    writeAuditLogMock.mockResolvedValue(undefined);
  });

  async function run(ctxExtra: Record<string, unknown> | undefined, err: unknown) {
    await reportFailure(
      {
        actorUserId: 'u1',
        action: 'test_action',
        entityType: 'member',
        entityPath: 'members/abc',
        extra: ctxExtra,
      },
      err,
    );
    return writeAuditLogMock.mock.calls[0][0] as {
      after: Record<string, unknown>;
    };
  }

  it('persists [redacted] for non-HttpsErrors so raw messages never land in auditLogs', async () => {
    const entry = await run(undefined, new Error('contains /users/hidden-id'));
    expect(entry.after.message).toBe('[redacted]');
  });

  it('persists the developer-authored HttpsError message', async () => {
    const entry = await run(
      undefined,
      new HttpsError('not-found', 'Event not found.'),
    );
    expect(entry.after.message).toBe('Event not found.');
  });

  it('redacts PII fields inside extra', async () => {
    const entry = await run(
      {
        primaryPhoneE164: '+447700900123',
        displayName: 'Alice Example',
      },
      new HttpsError('internal', 'oops'),
    );
    expect(entry.after.primaryPhoneE164).toBe('+447***23');
    expect(entry.after.displayName).toBe('«name:len=13»');
  });
});
