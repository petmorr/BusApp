/**
 * Unit tests for writeAuditLog. Firestore and serverTimestamp are mocked so
 * that no emulator is required.
 */

let fakeAdded: Array<Record<string, unknown>> = [];

jest.mock('../src/utils/firestore', () => ({
  db: () => ({
    collection: (_name: string) => ({
      add: async (data: Record<string, unknown>) => {
        fakeAdded.push(data);
        return { id: 'fake-doc-id' };
      },
    }),
  }),
  serverTimestamp: () => ({ __server: true }),
}));

// eslint-disable-next-line import/first -- mocks must be declared first.
import { writeAuditLog } from '../src/utils/audit';

describe('writeAuditLog', () => {
  beforeEach(() => {
    fakeAdded = [];
  });

  it('writes all required fields to the auditLogs collection', async () => {
    await writeAuditLog({
      actorUserId: 'admin-1',
      action: 'approve_guest_request',
      entityType: 'guestRequest',
      entityPath: 'events/e1/guestRequests/g1',
    });

    expect(fakeAdded).toHaveLength(1);
    const doc = fakeAdded[0];
    expect(doc.actorUserId).toBe('admin-1');
    expect(doc.action).toBe('approve_guest_request');
    expect(doc.entityType).toBe('guestRequest');
    expect(doc.entityPath).toBe('events/e1/guestRequests/g1');
    expect(doc.createdAt).toEqual({ __server: true });
  });

  it('sets before and after to null when not supplied', async () => {
    await writeAuditLog({
      actorUserId: 'u1',
      action: 'test_action',
      entityType: 'member',
      entityPath: 'members/m1',
    });

    const doc = fakeAdded[0];
    expect(doc.before).toBeNull();
    expect(doc.after).toBeNull();
  });

  it('redacts PII fields in the before snapshot', async () => {
    await writeAuditLog({
      actorUserId: 'u1',
      action: 'update_member',
      entityType: 'member',
      entityPath: 'members/m1',
      before: { primaryPhoneE164: '+447700900123', displayName: 'Alice B' },
    });

    const doc = fakeAdded[0];
    expect(doc.before).toEqual({
      primaryPhoneE164: '+447***23',
      displayName: '«name:len=7»',
    });
  });

  it('redacts PII fields in the after snapshot', async () => {
    await writeAuditLog({
      actorUserId: 'u1',
      action: 'update_member',
      entityType: 'member',
      entityPath: 'members/m1',
      after: { guestName: 'Bob Guest', status: 'approved' },
    });

    const doc = fakeAdded[0];
    expect(doc.after).toEqual({
      guestName: '«name:len=9»',
      status: 'approved',
    });
  });

  it('passes through non-PII fields unchanged', async () => {
    await writeAuditLog({
      actorUserId: 'u1',
      action: 'set_capacity',
      entityType: 'event',
      entityPath: 'events/e1',
      after: { capacityMax: 50, status: 'open' },
    });

    const doc = fakeAdded[0];
    expect(doc.after).toEqual({ capacityMax: 50, status: 'open' });
  });

  it('writes one document per call', async () => {
    await writeAuditLog({
      actorUserId: 'u1',
      action: 'a1',
      entityType: 'x',
      entityPath: 'x/1',
    });
    await writeAuditLog({
      actorUserId: 'u2',
      action: 'a2',
      entityType: 'x',
      entityPath: 'x/2',
    });

    expect(fakeAdded).toHaveLength(2);
    expect(fakeAdded[0].actorUserId).toBe('u1');
    expect(fakeAdded[1].actorUserId).toBe('u2');
  });
});
