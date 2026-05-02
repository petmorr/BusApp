import 'package:cloud_firestore/cloud_firestore.dart';

enum GuestRequestStatus { pending, approved, rejected, cancelled }

class GuestRequest {
  const GuestRequest({
    required this.id,
    required this.guestName,
    required this.requestedByUserId,
    required this.initialPickupStopId,
    required this.status,
    this.linkedMemberId,
    this.generalNotes,
  });

  factory GuestRequest.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return GuestRequest(
      id: doc.id,
      guestName: data['guestName'] as String? ?? '',
      requestedByUserId: data['requestedByUserId'] as String? ?? '',
      initialPickupStopId: data['initialPickupStopId'] as String? ?? '',
      status: GuestRequestStatus.values.firstWhere(
        (s) => s.name == (data['status'] as String? ?? 'pending'),
        orElse: () => GuestRequestStatus.pending,
      ),
      linkedMemberId: data['linkedMemberId'] as String?,
      generalNotes: data['generalNotes'] as String?,
    );
  }

  final String id;
  final String guestName;
  final String requestedByUserId;
  final String initialPickupStopId;
  final GuestRequestStatus status;
  final String? linkedMemberId;
  final String? generalNotes;
}
