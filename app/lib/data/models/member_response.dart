import 'package:cloud_firestore/cloud_firestore.dart';

enum MemberResponseStatus { attending, not_attending }

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
      status: MemberResponseStatus.values.firstWhere(
        (s) => s.name == (data['status'] as String? ?? 'attending'),
        orElse: () => MemberResponseStatus.attending,
      ),
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
