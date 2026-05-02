enum RouteStopType {
  outboundPickup,
  eventDropoff,
  eventPickup,
  returnDropoff,
}

extension RouteStopTypeLabel on RouteStopType {
  String get label {
    switch (this) {
      case RouteStopType.outboundPickup:
        return 'Outbound pickup';
      case RouteStopType.eventDropoff:
        return 'Event drop-off';
      case RouteStopType.eventPickup:
        return 'Event pickup';
      case RouteStopType.returnDropoff:
        return 'Return drop-off';
    }
  }
}

typedef StopType = RouteStopType;

class GeoPointValue {
  const GeoPointValue({
    required this.lat,
    required this.lng,
    this.address,
  });

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
    this.scheduledTimeLabel,
    this.location,
    this.notes,
    this.isActive = true,
  });

  final String id;
  final String name;
  final RouteStopType type;
  final int sequence;
  final String? scheduledTimeLabel;
  final GeoPointValue? location;
  final String? notes;
  final bool isActive;

  String? get scheduledLabel => scheduledTimeLabel;
}
