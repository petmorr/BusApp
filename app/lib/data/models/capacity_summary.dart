enum CapacityStatus { under, near, at, over }

extension CapacityStatusLabel on CapacityStatus {
  String get label {
    switch (this) {
      case CapacityStatus.under:
        return 'under';
      case CapacityStatus.near:
        return 'near';
      case CapacityStatus.at:
        return 'at capacity';
      case CapacityStatus.over:
        return 'over capacity';
    }
  }
}

class CapacitySummary {
  const CapacitySummary({
    required this.confirmedMemberSeats,
    required this.approvedGuestSeats,
    required this.pendingGuestSeats,
    required this.capacityMax,
    this.nearThresholdPercent = 90,
  });

  final int confirmedMemberSeats;
  final int approvedGuestSeats;
  final int pendingGuestSeats;
  final int capacityMax;
  final int nearThresholdPercent;

  factory CapacitySummary.empty({required int capacityMax}) {
    return CapacitySummary(
      confirmedMemberSeats: 0,
      approvedGuestSeats: 0,
      pendingGuestSeats: 0,
      capacityMax: capacityMax,
    );
  }

  factory CapacitySummary.fromCounts({
    required int capacityMax,
    required int confirmedMemberSeats,
    required int approvedGuestSeats,
    required int pendingGuestSeats,
    int nearThresholdPercent = 90,
  }) {
    return CapacitySummary(
      confirmedMemberSeats: confirmedMemberSeats,
      approvedGuestSeats: approvedGuestSeats,
      pendingGuestSeats: pendingGuestSeats,
      capacityMax: capacityMax,
      nearThresholdPercent: nearThresholdPercent,
    );
  }

  factory CapacitySummary.fromResponses({
    required int capacityMax,
    required Iterable<dynamic> memberResponses,
    required Iterable<dynamic> guestRequests,
    int nearThresholdPercent = 90,
  }) {
    return CapacitySummary.fromCounts(
      capacityMax: capacityMax,
      confirmedMemberSeats: memberResponses
          .where((response) => response.status.name == 'attending')
          .length,
      approvedGuestSeats: guestRequests
          .where((guest) => guest.status.name == 'approved')
          .length,
      pendingGuestSeats: guestRequests
          .where((guest) => guest.status.name == 'pending')
          .length,
      nearThresholdPercent: nearThresholdPercent,
    );
  }

  int get approvedTotal => confirmedMemberSeats + approvedGuestSeats;

  int get potentialTotal => approvedTotal + pendingGuestSeats;

  int get nearLimit => (capacityMax * nearThresholdPercent / 100).ceil();

  CapacityStatus get status {
    if (approvedTotal > capacityMax) {
      return CapacityStatus.over;
    }
    if (approvedTotal == capacityMax) {
      return CapacityStatus.at;
    }
    if (approvedTotal >= nearLimit) {
      return CapacityStatus.near;
    }
    return CapacityStatus.under;
  }

  bool get pendingGuestRisk => potentialTotal > capacityMax;
}
