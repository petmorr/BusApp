import 'package:cloud_firestore/cloud_firestore.dart';

enum MemberResponseStatus {
  attending('attending'),
  notAttending('not_attending');

  const MemberResponseStatus(this.wire);

  /// String stored in Firestore for this enum value.
  final String wire;

  static MemberResponseStatus fromWire(String? value) {
    return MemberResponseStatus.values.firstWhere(
      (s) => s.wire == value,
      orElse: () => MemberResponseStatus.attending,
    );
  }
}

class MemberResponse {
  const MemberResponse({
    required this.memberId,
    required this.respondingUserId,
    required this.status,
    required this.isAdminOverride,
    this.outboundPickupStopId,
    this.returnDropoffStopId,
    this.generalNotes,
  });

  factory MemberResponse.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return MemberResponse(
      memberId: data['memberId'] as String? ?? doc.id,
      respondingUserId: data['respondingUserId'] as String? ?? '',
      status: MemberResponseStatus.fromWire(data['status'] as String?),
      isAdminOverride: data['isAdminOverride'] as bool? ?? false,
      outboundPickupStopId: data['outboundPickupStopId'] as String?,
      returnDropoffStopId: data['returnDropoffStopId'] as String?,
      generalNotes: data['generalNotes'] as String?,
    );
  }

  final String memberId;
  final String respondingUserId;
  final MemberResponseStatus status;
  final bool isAdminOverride;
  final String? outboundPickupStopId;
  final String? returnDropoffStopId;
  final String? generalNotes;
}
