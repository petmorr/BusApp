import 'package:flutter_test/flutter_test.dart';
import 'package:supporters_bus_app/data/models/attendance_response.dart';
import 'package:supporters_bus_app/data/models/capacity_summary.dart';
import 'package:supporters_bus_app/data/models/guest_request.dart';

void main() {
  test('marks event as near when approved seats reach threshold', () {
    final responses = List<AttendanceResponse>.generate(
      45,
      (index) => AttendanceResponse(
        eventId: 'event-1',
        eventTitle: 'Test event',
        eventDate: DateTime.utc(2026, 5, 2),
        memberId: 'member-$index',
        memberDisplayName: 'Member $index',
        respondingUserId: 'user-1',
        status: AttendanceStatus.attending,
        updatedAt: DateTime.utc(2026, 5, 2),
      ),
    );

    final summary = CapacitySummary.fromResponses(
      capacityMax: 53,
      nearThresholdPercent: 90,
      memberResponses: responses,
      guestRequests: const [],
    );

    expect(summary.status, CapacityStatus.under);

    final nearSummary = CapacitySummary.fromResponses(
      capacityMax: 53,
      nearThresholdPercent: 90,
      memberResponses: [
        ...responses,
        AttendanceResponse(
          eventId: 'event-1',
          eventTitle: 'Test event',
          eventDate: DateTime.utc(2026, 5, 2),
          memberId: 'member-45',
          memberDisplayName: 'Member 45',
          respondingUserId: 'user-1',
          status: AttendanceStatus.attending,
          updatedAt: DateTime.utc(2026, 5, 2),
        ),
        AttendanceResponse(
          eventId: 'event-1',
          eventTitle: 'Test event',
          eventDate: DateTime.utc(2026, 5, 2),
          memberId: 'member-46',
          memberDisplayName: 'Member 46',
          respondingUserId: 'user-1',
          status: AttendanceStatus.attending,
          updatedAt: DateTime.utc(2026, 5, 2),
        ),
        AttendanceResponse(
          eventId: 'event-1',
          eventTitle: 'Test event',
          eventDate: DateTime.utc(2026, 5, 2),
          memberId: 'member-47',
          memberDisplayName: 'Member 47',
          respondingUserId: 'user-1',
          status: AttendanceStatus.attending,
          updatedAt: DateTime.utc(2026, 5, 2),
        ),
      ],
      guestRequests: const [],
    );

    expect(nearSummary.status, CapacityStatus.near);
    expect(nearSummary.approvedTotal, 48);
  });

  test('tracks pending guest risk separately from approved capacity', () {
    final summary = CapacitySummary.fromResponses(
      capacityMax: 2,
      nearThresholdPercent: 90,
      memberResponses: [
        AttendanceResponse(
          eventId: 'event-1',
          eventTitle: 'Test event',
          eventDate: DateTime.utc(2026, 5, 2),
          memberId: 'member-1',
          memberDisplayName: 'Member 1',
          respondingUserId: 'user-1',
          status: AttendanceStatus.attending,
          updatedAt: DateTime.utc(2026, 5, 2),
        ),
      ],
      guestRequests: [
        GuestRequest(
          id: 'guest-1',
          eventId: 'event-1',
          guestName: 'Guest One',
          requestedByUserId: 'user-1',
          initialPickupStopId: 'stop-1',
          status: GuestRequestStatus.approved,
        ),
        GuestRequest(
          id: 'guest-2',
          eventId: 'event-1',
          guestName: 'Guest Two',
          requestedByUserId: 'user-1',
          initialPickupStopId: 'stop-1',
          status: GuestRequestStatus.pending,
        ),
      ],
    );

    expect(summary.status, CapacityStatus.at);
    expect(summary.approvedTotal, 2);
    expect(summary.potentialTotal, 3);
    expect(summary.pendingGuestRisk, isTrue);
  });
}
