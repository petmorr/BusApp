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
      'status': status.name,
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
    }, SetOptions(merge: true));
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
