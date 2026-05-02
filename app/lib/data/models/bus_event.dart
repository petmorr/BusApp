import 'package:intl/intl.dart';

import 'capacity_summary.dart';
import 'route_stop.dart';

enum EventStatus { draft, open, closed, completed, cancelled }

class ParkedBusLocation {
  const ParkedBusLocation({
    required this.latitude,
    required this.longitude,
    required this.label,
    this.notes,
  });

  final double latitude;
  final double longitude;
  final String label;
  final String? notes;
}

class BusEvent {
  const BusEvent({
    required this.id,
    required this.title,
    required this.eventDate,
    required this.status,
    required this.capacityMax,
    required this.destinationName,
    required this.generalNotes,
    required this.stops,
    required this.capacity,
    this.capacityNearThresholdPercent = 90,
    this.cutoffAt,
    this.parkedBusLocation,
  });

  final String id;
  final String title;
  final DateTime eventDate;
  final EventStatus status;
  final int capacityMax;
  final int capacityNearThresholdPercent;
  final String destinationName;
  final String generalNotes;
  final DateTime? cutoffAt;
  final List<RouteStop> stops;
  final CapacitySummary capacity;
  final ParkedBusLocation? parkedBusLocation;

  String get formattedDate => DateFormat('EEE d MMM, HH:mm').format(eventDate);

  List<RouteStop> get outboundPickupStops => stops
      .where((stop) => stop.isActive && stop.type == RouteStopType.outboundPickup)
      .toList()
    ..sort((a, b) => a.sequence.compareTo(b.sequence));

  bool get isCurrentOrUpcoming =>
      eventDate.isAfter(DateTime.now().subtract(const Duration(hours: 12))) &&
      status != EventStatus.cancelled &&
      status != EventStatus.completed;
}
