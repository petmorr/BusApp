import 'package:flutter/material.dart';
import '../../data/models/route_stop.dart';

class RouteStopsScreen extends StatelessWidget {
  const RouteStopsScreen({super.key, required this.stops});

  final List<RouteStop> stops;

  @override
  Widget build(BuildContext context) {
    final stopsByType = <RouteStopType, List<RouteStop>>{};
    for (final stop in stops) {
      stopsByType.putIfAbsent(stop.type, () => <RouteStop>[]).add(stop);
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Route stops')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final entry in stopsByType.entries) ...[
            Text(_labelForType(entry.key), style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            for (final stop in entry.value)
              Card(
                child: ListTile(
                  title: Text(stop.name),
                  subtitle: Text([
                    if (stop.scheduledTimeLabel != null) stop.scheduledTimeLabel!,
                    if (stop.notes != null) stop.notes!,
                    if (stop.location?.address != null) stop.location!.address!,
                  ].join('\n')),
                  trailing: stop.location == null
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.map_outlined),
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Open ${stop.name} at ${stop.location!.lat}, ${stop.location!.lng} in maps.',
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ),
            const SizedBox(height: 20),
          ],
        ],
      ),
    );
  }

  String _labelForType(RouteStopType type) {
    switch (type) {
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
