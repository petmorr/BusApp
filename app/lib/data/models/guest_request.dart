enum GuestRequestStatus { pending, approved, rejected, cancelled }

extension GuestRequestStatusLabel on GuestRequestStatus {
  String get label {
    switch (this) {
      case GuestRequestStatus.pending:
        return 'Pending';
      case GuestRequestStatus.approved:
        return 'Approved';
      case GuestRequestStatus.rejected:
        return 'Rejected';
      case GuestRequestStatus.cancelled:
        return 'Cancelled';
    }
  }
}

class GuestRequest {
  const GuestRequest({
    required this.id,
    required this.eventId,
    required this.guestName,
    required this.requestedByUserId,
    required this.initialPickupStopId,
    required this.status,
    this.linkedMemberId,
    this.generalNotes,
  });

  final String id;
  final String eventId;
  final String guestName;
  final String requestedByUserId;
  final String initialPickupStopId;
  final GuestRequestStatus status;
  final String? linkedMemberId;
  final String? generalNotes;
}
