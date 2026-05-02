import '../models/app_user.dart';
import '../models/attendance_response.dart';
import '../models/bus_event.dart';
import '../models/capacity_summary.dart';
import '../models/guest_request.dart';
import '../models/member.dart';
import '../models/route_stop.dart';

class DemoRepository {
  DemoRepository()
      : currentUser = const AppUser(
          id: 'demo-user',
          phoneE164: '+447700900123',
          displayName: 'John Smith',
          roles: <UserRole>{UserRole.user, UserRole.admin, UserRole.helper},
          isActive: true,
        ),
        members = const [
          Member(
            id: 'member-john',
            firstName: 'John',
            lastName: 'Smith',
            displayName: 'John Smith',
            primaryPhoneE164: '+447700900123',
            status: MemberStatus.active,
            relationshipToUser: 'self',
          ),
          Member(
            id: 'member-amy',
            firstName: 'Amy',
            lastName: 'Smith',
            displayName: 'Amy Smith',
            primaryPhoneE164: '+447700900123',
            status: MemberStatus.active,
            relationshipToUser: 'child',
          ),
          Member(
            id: 'member-ben',
            firstName: 'Ben',
            lastName: 'Smith',
            displayName: 'Ben Smith',
            primaryPhoneE164: '+447700900123',
            status: MemberStatus.active,
            relationshipToUser: 'child',
          ),
        ],
        stops = const [
          RouteStop(
            id: 'clubhouse',
            name: 'Main Street Clubhouse',
            type: RouteStopType.outboundPickup,
            sequence: 1,
            scheduledTimeLabel: '09:15',
            location: GeoPointValue(lat: 55.864237, lng: -4.251806),
            notes: 'Meet outside the front door.',
          ),
          RouteStop(
            id: 'station',
            name: 'Central Station',
            type: RouteStopType.outboundPickup,
            sequence: 2,
            scheduledTimeLabel: '09:35',
            location: GeoPointValue(lat: 55.858241, lng: -4.258681),
            notes: 'Bus bay 4.',
          ),
          RouteStop(
            id: 'stadium',
            name: 'Example Stadium',
            type: RouteStopType.eventDropoff,
            sequence: 3,
            scheduledTimeLabel: '11:00',
            location: GeoPointValue(lat: 55.849912, lng: -4.205998),
            notes: 'North gate drop-off.',
          ),
          RouteStop(
            id: 'return-clubhouse',
            name: 'Main Street Clubhouse',
            type: RouteStopType.returnDropoff,
            sequence: 4,
            scheduledTimeLabel: '18:30',
            location: GeoPointValue(lat: 55.864237, lng: -4.251806),
            notes: 'Final return stop.',
          ),
        ],
        _responses = <AttendanceResponse>[
          AttendanceResponse(
            eventId: 'rangers-example',
            eventTitle: 'Rangers v Example FC',
            eventDate: DateTime(2026),
            memberId: 'member-john',
            memberDisplayName: 'John Smith',
            respondingUserId: 'demo-user',
            status: AttendanceStatus.attending,
            outboundPickupStopId: 'clubhouse',
            returnDropoffStopId: 'return-clubhouse',
            updatedAt: DateTime(2026),
          ),
          AttendanceResponse(
            eventId: 'rangers-example',
            eventTitle: 'Rangers v Example FC',
            eventDate: DateTime(2026),
            memberId: 'member-amy',
            memberDisplayName: 'Amy Smith',
            respondingUserId: 'demo-user',
            status: AttendanceStatus.attending,
            outboundPickupStopId: 'clubhouse',
            returnDropoffStopId: 'return-clubhouse',
            updatedAt: DateTime(2026),
          ),
        ],
        _guestRequests = <GuestRequest>[
          GuestRequest(
            id: 'guest-jane',
            eventId: 'rangers-example',
            guestName: 'Jane Guest',
            requestedByUserId: 'demo-user',
            initialPickupStopId: 'clubhouse',
            status: GuestRequestStatus.pending,
          ),
        ] {
    final eventCapacity = CapacitySummary.fromCounts(
      capacityMax: 53,
      confirmedMemberSeats: 2,
      approvedGuestSeats: 0,
      pendingGuestSeats: 1,
      nearThresholdPercent: 90,
    );

    events = [
      BusEvent(
        id: 'rangers-example',
        title: 'Rangers v Example FC',
        eventDate: DateTime.now().add(const Duration(days: 6)),
        status: EventStatus.open,
        capacityMax: 53,
        capacityNearThresholdPercent: 90,
        destinationName: 'Example Stadium',
        generalNotes:
            'Please confirm all represented members before Thursday evening.',
        capacity: eventCapacity,
        parkedBusLocation: const ParkedBusLocation(
          label: 'Car Park B',
          latitude: 55.860916,
          longitude: -4.251433,
          notes: 'Near the north gate. Updated after arrival.',
        ),
      ),
      BusEvent(
        id: 'cup-semi-final',
        title: 'Cup Semi-Final Trip',
        eventDate: DateTime.now().add(const Duration(days: 17)),
        status: EventStatus.draft,
        capacityMax: 49,
        capacityNearThresholdPercent: 90,
        destinationName: 'National Stadium',
        generalNotes: 'Route details will be confirmed after ticket allocation.',
        capacity: CapacitySummary.fromCounts(
          capacityMax: 49,
          confirmedMemberSeats: 0,
          approvedGuestSeats: 0,
          pendingGuestSeats: 0,
        ),
      ),
    ];
  }

  final AppUser currentUser;
  final List<Member> members;
  final List<RouteStop> stops;
  late final List<BusEvent> events;
  final List<AttendanceResponse> _responses;
  final List<GuestRequest> _guestRequests;

  List<BusEvent> upcomingEvents() {
    return events.where((event) => event.isCurrentOrUpcoming).toList()
      ..sort((a, b) => a.eventDate.compareTo(b.eventDate));
  }

  BusEvent eventById(String eventId) {
    return events.firstWhere((event) => event.id == eventId);
  }

  List<RouteStop> stopsForEvent(String eventId) {
    return stops;
  }

  List<RouteStop> stopsByType(RouteStopType type) {
    return stops.where((stop) => stop.type == type && stop.isActive).toList()
      ..sort((a, b) => a.sequence.compareTo(b.sequence));
  }

  List<Member> linkedMembersForCurrentUser() {
    return members.where((member) => member.status == MemberStatus.active).toList();
  }

  List<AttendanceResponse> responsesForEvent(String eventId) {
    return _responses.where((response) => response.eventId == eventId).toList();
  }

  List<GuestRequest> guestRequestsForEvent(String eventId) {
    return _guestRequests.where((guest) => guest.eventId == eventId).toList();
  }

  CapacitySummary capacitySummaryFor(String eventId) {
    return CapacitySummary.calculate(
      capacityMax: eventById(eventId).capacityMax,
      memberResponses: responsesForEvent(eventId),
      guestRequests: guestRequestsForEvent(eventId),
      nearThresholdPercent: eventById(eventId).capacityNearThresholdPercent,
    );
  }

  CapacitySummary capacityForEvent(String eventId) {
    return capacitySummaryFor(eventId);
  }

  void upsertMemberResponse(AttendanceResponse response) {
    _responses.removeWhere(
      (existing) => existing.eventId == response.eventId && existing.memberId == response.memberId,
    );
    _responses.add(response);
  }

  void addGuestRequest(GuestRequest request) {
    _guestRequests.add(request);
  }

  List<Member> membersStillToConfirm(String eventId) {
    final respondedMemberIds =
        responsesForEvent(eventId).map((response) => response.memberId).toSet();
    return members
        .where((member) => !respondedMemberIds.contains(member.id))
        .toList();
  }
}
