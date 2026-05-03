/**
 * Unit tests for sendCapacityAlertIfChanged.
 *
 * Both the Firestore dependency and the sendNotificationToUsers helper are
 * mocked so no emulator is required.
 */

const sendNotificationMock = jest.fn<Promise<string>, [unknown]>();

jest.mock('../src/utils/notifications', () => ({
  sendNotificationToUsers: (arg: unknown) =>
    sendNotificationMock(arg),
}));

let fakeAdminDocs: Array<{ id: string }> = [];
let fakeEventUpdates: Array<{ eventId: string; data: Record<string, unknown> }> = [];

jest.mock('../src/utils/firestore', () => ({
  db: () => ({
    collection: (name: string) => {
      if (name === 'users') {
        return {
          where: () => ({
            where: () => ({
              get: async () => ({ docs: fakeAdminDocs }),
            }),
          }),
        };
      }
      if (name === 'events') {
        return {
          doc: (eventId: string) => ({
            update: async (data: Record<string, unknown>) => {
              fakeEventUpdates.push({ eventId, data });
            },
          }),
        };
      }
      return {};
    },
  }),
  serverTimestamp: () => ({ __server: true }),
}));

// eslint-disable-next-line import/first -- mocks must be declared first.
import { sendCapacityAlertIfChanged } from '../src/utils/capacityAlerts';
import type { CapacityStatus } from '../src/types/domain';

function baseArgs(
  previousStatus: CapacityStatus,
  nextStatus: CapacityStatus,
  previousPendingGuestRisk = false,
  nextPendingGuestRisk = false,
) {
  return {
    eventId: 'event-1',
    previousStatus,
    nextStatus,
    previousPendingGuestRisk,
    nextPendingGuestRisk,
  };
}

describe('sendCapacityAlertIfChanged', () => {
  beforeEach(() => {
    sendNotificationMock.mockReset();
    sendNotificationMock.mockResolvedValue('notif-id');
    fakeAdminDocs = [{ id: 'admin-1' }, { id: 'admin-2' }];
    fakeEventUpdates = [];
  });

  it('does nothing when the status is unchanged', async () => {
    await sendCapacityAlertIfChanged(baseArgs('under', 'under'));
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(fakeEventUpdates).toHaveLength(0);
  });

  it('does nothing when status moves away from a capacity trigger level (over → under)', async () => {
    await sendCapacityAlertIfChanged(baseArgs('over', 'under'));
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('sends a notification when status transitions to "near"', async () => {
    await sendCapacityAlertIfChanged(baseArgs('under', 'near'));
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const arg = sendNotificationMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      type: 'capacity_alert',
      targetUserIds: ['admin-1', 'admin-2'],
    });
    expect((arg.title as string).toLowerCase()).toContain('near');
  });

  it('sends a notification when status transitions to "at"', async () => {
    await sendCapacityAlertIfChanged(baseArgs('near', 'at'));
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const arg = sendNotificationMock.mock.calls[0][0] as Record<string, unknown>;
    expect((arg.title as string).toLowerCase()).toContain('at');
  });

  it('sends a notification when status transitions to "over"', async () => {
    await sendCapacityAlertIfChanged(baseArgs('at', 'over'));
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const arg = sendNotificationMock.mock.calls[0][0] as Record<string, unknown>;
    expect((arg.title as string).toLowerCase()).toContain('over');
  });

  it('sends a notification when pendingGuestRisk newly becomes true', async () => {
    // Status itself stays 'under' — only pendingGuestRisk changes.
    await sendCapacityAlertIfChanged(baseArgs('under', 'under', false, true));
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const arg = sendNotificationMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.type).toBe('capacity_alert');
  });

  it('does NOT re-send when pendingGuestRisk was already true and remains true', async () => {
    await sendCapacityAlertIfChanged(baseArgs('under', 'under', true, true));
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it('updates the event document with lastCapacityAlertSentAt after sending', async () => {
    await sendCapacityAlertIfChanged(baseArgs('under', 'near'));
    expect(fakeEventUpdates).toHaveLength(1);
    expect(fakeEventUpdates[0].eventId).toBe('event-1');
    expect(fakeEventUpdates[0].data.lastCapacityAlertSentAt).toEqual({
      __server: true,
    });
  });

  it('skips sending when there are no admin users', async () => {
    fakeAdminDocs = [];
    await sendCapacityAlertIfChanged(baseArgs('under', 'over'));
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(fakeEventUpdates).toHaveLength(0);
  });

  it('includes eventId in the notification data payload', async () => {
    await sendCapacityAlertIfChanged(baseArgs('under', 'at'));
    const arg = sendNotificationMock.mock.calls[0][0] as Record<string, unknown>;
    expect((arg.data as Record<string, string>).eventId).toBe('event-1');
  });
});
