import 'package:cloud_firestore/cloud_firestore.dart';

enum EventStatus { draft, open, closed, completed, cancelled }

enum CapacityStatus { under, near, at, over }

class ParkedBusLocation {
  const ParkedBusLocation({
    required this.lat,
    required this.lng,
    required this.updatedByUserId,
    required this.updatedAt,
    this.label,
    this.notes,
  });

  factory ParkedBusLocation.fromMap(Map<String, dynamic> map) {
    return ParkedBusLocation(
      lat: (map['lat'] as num).toDouble(),
      lng: (map['lng'] as num).toDouble(),
      updatedByUserId: map['updatedByUserId'] as String? ?? '',
      updatedAt:
          (map['updatedAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      label: map['label'] as String?,
      notes: map['notes'] as String?,
    );
  }

  final double lat;
  final double lng;
  final String updatedByUserId;
  final DateTime updatedAt;
  final String? label;
  final String? notes;
}

class BusEvent {
  const BusEvent({
    required this.id,
    required this.title,
    required this.eventDate,
    required this.status,
    required this.capacityMax,
    required this.capacityNearThresholdPercent,
    required this.capacityStatus,
    required this.pendingGuestRisk,
    this.cutoffAt,
    this.destinationName,
    this.generalNotes,
    this.parkedBusLocation,
    this.capacityConfirmedMemberSeats = 0,
    this.capacityApprovedGuestSeats = 0,
    this.capacityPendingGuestSeats = 0,
    this.capacityApprovedTotal = 0,
    this.capacityPotentialTotal = 0,
  });

  factory BusEvent.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return BusEvent(
      id: doc.id,
      title: data['title'] as String? ?? '',
      eventDate:
          (data['eventDate'] as Timestamp?)?.toDate() ?? DateTime.now(),
      status: EventStatus.values.firstWhere(
        (s) => s.name == (data['status'] as String? ?? 'draft'),
        orElse: () => EventStatus.draft,
      ),
      capacityMax: (data['capacityMax'] as num?)?.toInt() ?? 0,
      capacityNearThresholdPercent:
          (data['capacityNearThresholdPercent'] as num?)?.toInt() ?? 90,
      capacityStatus: CapacityStatus.values.firstWhere(
        (s) => s.name == (data['capacityStatus'] as String? ?? 'under'),
        orElse: () => CapacityStatus.under,
      ),
      pendingGuestRisk: data['pendingGuestRisk'] as bool? ?? false,
      cutoffAt: (data['cutoffAt'] as Timestamp?)?.toDate(),
      destinationName: data['destinationName'] as String?,
      generalNotes: data['generalNotes'] as String?,
      parkedBusLocation: data['parkedBusLocation'] is Map<String, dynamic>
          ? ParkedBusLocation.fromMap(
              data['parkedBusLocation'] as Map<String, dynamic>,
            )
          : null,
      capacityConfirmedMemberSeats:
          (data['capacityConfirmedMemberSeats'] as num?)?.toInt() ?? 0,
      capacityApprovedGuestSeats:
          (data['capacityApprovedGuestSeats'] as num?)?.toInt() ?? 0,
      capacityPendingGuestSeats:
          (data['capacityPendingGuestSeats'] as num?)?.toInt() ?? 0,
      capacityApprovedTotal:
          (data['capacityApprovedTotal'] as num?)?.toInt() ?? 0,
      capacityPotentialTotal:
          (data['capacityPotentialTotal'] as num?)?.toInt() ?? 0,
    );
  }

  final String id;
  final String title;
  final DateTime eventDate;
  final EventStatus status;
  final int capacityMax;
  final int capacityNearThresholdPercent;
  final CapacityStatus capacityStatus;
  final bool pendingGuestRisk;
  final DateTime? cutoffAt;
  final String? destinationName;
  final String? generalNotes;
  final ParkedBusLocation? parkedBusLocation;
  final int capacityConfirmedMemberSeats;
  final int capacityApprovedGuestSeats;
  final int capacityPendingGuestSeats;
  final int capacityApprovedTotal;
  final int capacityPotentialTotal;

  bool get isCutoffPassed {
    final cutoff = cutoffAt;
    if (cutoff == null) return false;
    return DateTime.now().isAfter(cutoff);
  }
}
