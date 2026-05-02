import 'package:cloud_firestore/cloud_firestore.dart';

enum StopType {
  outboundPickup('outbound_pickup'),
  eventDropoff('event_dropoff'),
  eventPickup('event_pickup'),
  returnDropoff('return_dropoff');

  const StopType(this.wire);

  /// String stored in Firestore for this enum value.
  final String wire;

  static StopType fromWire(String? value) {
    return StopType.values.firstWhere(
      (t) => t.wire == value,
      orElse: () => StopType.outboundPickup,
    );
  }
}

class StopLocation {
  const StopLocation({required this.lat, required this.lng, this.address});

  factory StopLocation.fromMap(Map<String, dynamic> map) => StopLocation(
        lat: (map['lat'] as num).toDouble(),
        lng: (map['lng'] as num).toDouble(),
        address: map['address'] as String?,
      );

  final double lat;
  final double lng;
  final String? address;
}

class RouteStop {
  const RouteStop({
    required this.id,
    required this.name,
    required this.type,
    required this.sequence,
    required this.isActive,
    this.scheduledAt,
    this.location,
    this.notes,
  });

  factory RouteStop.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return RouteStop(
      id: doc.id,
      name: data['name'] as String? ?? '',
      type: StopType.fromWire(data['type'] as String?),
      sequence: (data['sequence'] as num?)?.toInt() ?? 0,
      isActive: data['isActive'] as bool? ?? true,
      scheduledAt: (data['scheduledAt'] as Timestamp?)?.toDate(),
      location: data['location'] is Map<String, dynamic>
          ? StopLocation.fromMap(data['location'] as Map<String, dynamic>)
          : null,
      notes: data['notes'] as String?,
    );
  }

  final String id;
  final String name;
  final StopType type;
  final int sequence;
  final bool isActive;
  final DateTime? scheduledAt;
  final StopLocation? location;
  final String? notes;
}
