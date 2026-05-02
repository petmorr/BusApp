enum AttendanceStatus {
  attending,
  notAttending,
}

class AttendanceResponse {
  const AttendanceResponse({
    required this.eventId,
    required this.eventTitle,
    required this.eventDate,
    required this.memberId,
    required this.memberDisplayName,
    required this.status,
    this.respondingUserId,
    this.outboundPickupStopId,
    this.returnDropoffStopId,
    this.generalNotes,
    this.isAdminOverride = false,
    this.overriddenByAdminId,
    required this.updatedAt,
  });

  final String eventId;
  final String eventTitle;
  final DateTime eventDate;
  final String memberId;
  final String memberDisplayName;
  final String? respondingUserId;
  final AttendanceStatus status;
  final String? outboundPickupStopId;
  final String? returnDropoffStopId;
  final String? generalNotes;
  final bool isAdminOverride;
  final String? overriddenByAdminId;
  final DateTime updatedAt;

  Map<String, dynamic> toFirestore() {
    return {
      'eventId': eventId,
      'eventTitle': eventTitle,
      'eventDate': eventDate.toIso8601String(),
      'memberId': memberId,
      'memberDisplayName': memberDisplayName,
      'respondingUserId': respondingUserId,
      'status': status.name == 'notAttending' ? 'not_attending' : status.name,
      'outboundPickupStopId': outboundPickupStopId,
      'returnDropoffStopId': returnDropoffStopId,
      'generalNotes': generalNotes,
      'isAdminOverride': isAdminOverride,
      'overriddenByAdminId': overriddenByAdminId,
      'updatedAt': updatedAt.toIso8601String(),
    };
  }
}
