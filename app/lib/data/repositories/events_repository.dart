import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/event.dart';
import '../models/guest_request.dart';
import '../models/member_response.dart';
import '../models/route_stop.dart';

final eventsRepositoryProvider = Provider<EventsRepository>((ref) {
  return EventsRepository(FirebaseFirestore.instance);
});

class EventsRepository {
  EventsRepository(this._db);

  final FirebaseFirestore _db;

  CollectionReference<Map<String, dynamic>> get _events =>
      _db.collection('events');

  /// Current and upcoming events for normal users (excludes drafts).
  Stream<List<BusEvent>> watchUpcomingEvents() {
    final now = Timestamp.fromDate(
      DateTime.now().subtract(const Duration(hours: 6)),
    );
    return _events
        .where('eventDate', isGreaterThanOrEqualTo: now)
        .where('status', whereIn: ['open', 'closed'])
        .orderBy('eventDate')
        .snapshots()
        .map((s) => s.docs.map(BusEvent.fromDoc).toList());
  }

  /// All events, including drafts, ordered by date descending. Admin-only —
  /// the Firestore rules already prevent non-admins from reading drafts so a
  /// regular user simply receives an empty list for unreadable docs.
  Stream<List<BusEvent>> watchAllEvents() {
    return _events
        .orderBy('eventDate', descending: true)
        .snapshots()
        .map((s) => s.docs.map(BusEvent.fromDoc).toList());
  }

  /// Events the user is an assigned helper for. Powers the helper dashboard
  /// "assigned events" list.
  Stream<List<String>> watchHelperEventIds(String userId) {
    return _db
        .collectionGroup('helpers')
        .where('userId', isEqualTo: userId)
        .snapshots()
        .map((s) {
      // The parent of each helper doc is `events/{eventId}/helpers`, so
      // walking up two levels gives us the eventId.
      return s.docs
          .map((d) => d.reference.parent.parent?.id)
          .whereType<String>()
          .toList(growable: false);
    });
  }

  Stream<BusEvent> watchEvent(String eventId) {
    return _events
        .doc(eventId)
        .snapshots()
        .where((s) => s.exists)
        .map(BusEvent.fromDoc);
  }

  Stream<List<RouteStop>> watchStops(String eventId) {
    return _events
        .doc(eventId)
        .collection('stops')
        .where('isActive', isEqualTo: true)
        .orderBy('sequence')
        .snapshots()
        .map((s) => s.docs.map(RouteStop.fromDoc).toList());
  }

  Stream<List<MemberResponse>> watchMemberResponses(String eventId) {
    return _events
        .doc(eventId)
        .collection('memberResponses')
        .snapshots()
        .map((s) => s.docs.map(MemberResponse.fromDoc).toList());
  }

  Stream<List<GuestRequest>> watchGuestRequests(String eventId) {
    return _events
        .doc(eventId)
        .collection('guestRequests')
        .snapshots()
        .map((s) => s.docs.map(GuestRequest.fromDoc).toList());
  }

  Future<void> upsertMemberResponse({
    required String eventId,
    required String memberId,
    required String respondingUserId,
    required MemberResponseStatus status,
    required BusEvent event,
    required String memberDisplayName,
    String? outboundPickupStopId,
    String? returnDropoffStopId,
    String? generalNotes,
  }) async {
    final doc = _events
        .doc(eventId)
        .collection('memberResponses')
        .doc(memberId);
    await doc.set({
      'memberId': memberId,
      'respondingUserId': respondingUserId,
      'status': status.wire,
      'outboundPickupStopId': outboundPickupStopId,
      'returnDropoffStopId': returnDropoffStopId,
      'generalNotes': generalNotes ?? '',
      'isAdminOverride': false,
      'overriddenByAdminId': null,
      'eventId': eventId,
      'eventTitle': event.title,
      'eventDate': Timestamp.fromDate(event.eventDate),
      'memberDisplayName': memberDisplayName,
      'updatedAt': FieldValue.serverTimestamp(),
      'createdAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true),);
  }

  // ----- Admin event / stop CRUD -----
  //
  // Admins write events and stops directly via Firestore (the security rules
  // gate the writes to admin only). Notifications + capacity recalc happen
  // server-side via Firestore triggers and Cloud Function callables.

  Future<DocumentReference<Map<String, dynamic>>> createEvent({
    required String adminUserId,
    required String title,
    required DateTime eventDate,
    required int capacityMax,
    required int capacityNearThresholdPercent,
    required EventStatus status,
    DateTime? cutoffAt,
    String? destinationName,
    String? generalNotes,
  }) async {
    return _events.add({
      'title': title,
      'eventDate': Timestamp.fromDate(eventDate),
      'cutoffAt': cutoffAt == null ? null : Timestamp.fromDate(cutoffAt),
      'status': status.name,
      'capacityMax': capacityMax,
      'capacityNearThresholdPercent': capacityNearThresholdPercent,
      'capacityStatus': 'under',
      'pendingGuestRisk': false,
      'destinationName': destinationName,
      'generalNotes': generalNotes ?? '',
      'lastCapacityAlertSentAt': null,
      'createdByAdminId': adminUserId,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateEvent({
    required String eventId,
    String? title,
    DateTime? eventDate,
    int? capacityMax,
    int? capacityNearThresholdPercent,
    EventStatus? status,
    DateTime? cutoffAt,
    bool clearCutoff = false,
    String? destinationName,
    String? generalNotes,
  }) async {
    final patch = <String, dynamic>{
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (title != null) patch['title'] = title;
    if (eventDate != null) patch['eventDate'] = Timestamp.fromDate(eventDate);
    if (capacityMax != null) patch['capacityMax'] = capacityMax;
    if (capacityNearThresholdPercent != null) {
      patch['capacityNearThresholdPercent'] = capacityNearThresholdPercent;
    }
    if (status != null) patch['status'] = status.name;
    if (clearCutoff) {
      patch['cutoffAt'] = null;
    } else if (cutoffAt != null) {
      patch['cutoffAt'] = Timestamp.fromDate(cutoffAt);
    }
    if (destinationName != null) patch['destinationName'] = destinationName;
    if (generalNotes != null) patch['generalNotes'] = generalNotes;
    await _events.doc(eventId).update(patch);
  }

  Future<void> deleteEvent(String eventId) async {
    await _events.doc(eventId).delete();
  }

  Future<void> upsertStop({
    required String eventId,
    required String adminUserId,
    String? stopId,
    required String name,
    required StopType type,
    required int sequence,
    required bool isActive,
    DateTime? scheduledAt,
    double? lat,
    double? lng,
    String? address,
    String? notes,
  }) async {
    final ref = stopId == null
        ? _events.doc(eventId).collection('stops').doc()
        : _events.doc(eventId).collection('stops').doc(stopId);
    await ref.set({
      'name': name,
      'type': type.wire,
      'sequence': sequence,
      'isActive': isActive,
      'scheduledAt':
          scheduledAt == null ? null : Timestamp.fromDate(scheduledAt),
      'location': (lat != null && lng != null)
          ? {
              'lat': lat,
              'lng': lng,
              if (address != null && address.isNotEmpty) 'address': address,
            }
          : null,
      'notes': notes ?? '',
      'updatedByUserId': adminUserId,
      if (stopId == null) 'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true),);
  }

  Future<void> deleteStop({
    required String eventId,
    required String stopId,
  }) async {
    await _events.doc(eventId).collection('stops').doc(stopId).delete();
  }

  Stream<List<RouteStop>> watchAllStops(String eventId) {
    return _events
        .doc(eventId)
        .collection('stops')
        .orderBy('sequence')
        .snapshots()
        .map((s) => s.docs.map(RouteStop.fromDoc).toList());
  }

  /// Members assigned to this event as helpers. Admin-only.
  Stream<List<String>> watchEventHelperUserIds(String eventId) {
    return _events
        .doc(eventId)
        .collection('helpers')
        .snapshots()
        .map((s) => s.docs.map((d) => d.id).toList(growable: false));
  }

  Future<DocumentReference<Map<String, dynamic>>> createGuestRequest({
    required String eventId,
    required String requestedByUserId,
    required String guestName,
    required String initialPickupStopId,
    String? linkedMemberId,
    String? generalNotes,
  }) async {
    return _events.doc(eventId).collection('guestRequests').add({
      'guestName': guestName,
      'requestedByUserId': requestedByUserId,
      'linkedMemberId': linkedMemberId,
      'initialPickupStopId': initialPickupStopId,
      'status': GuestRequestStatus.pending.name,
      'decisionByAdminId': null,
      'decisionAt': null,
      'generalNotes': generalNotes ?? '',
      'eventId': eventId,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
