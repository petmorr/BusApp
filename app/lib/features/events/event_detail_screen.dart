import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:maps_launcher/maps_launcher.dart';

import '../../data/models/event.dart';
import '../../data/models/route_stop.dart';
import '../../data/repositories/events_repository.dart';

class EventDetailScreen extends ConsumerWidget {
  const EventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.watch(eventsRepositoryProvider);
    final eventAsync = ref.watch(_eventProvider(eventId));
    final stopsAsync = ref.watch(_stopsProvider(eventId));

    return Scaffold(
      appBar: AppBar(title: const Text('Event')),
      body: eventAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (event) {
          final dateFmt = DateFormat('EEEE d MMMM, HH:mm');
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                event.title,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(dateFmt.format(event.eventDate.toLocal())),
              if (event.destinationName != null) ...[
                const SizedBox(height: 4),
                Text(event.destinationName!),
              ],
              const SizedBox(height: 16),
              _CapacityBanner(event: event),
              const SizedBox(height: 24),
              const Text(
                'Route',
                style:
                    TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              stopsAsync.when(
                loading: () => const LinearProgressIndicator(),
                error: (e, _) => Text('$e'),
                data: (stops) => _RouteList(stops: stops),
              ),
              const SizedBox(height: 24),
              if (event.parkedBusLocation != null) ...[
                const Text(
                  'Parked bus',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                _ParkedBusTile(event: event),
                const SizedBox(height: 24),
              ],
              FilledButton.tonal(
                onPressed: () {
                  // TODO(milestone-5): open the linked-member attendance form.
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Attendance form not yet implemented.'),
                    ),
                  );
                },
                child: const Text('Confirm attendance'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () {
                  // TODO(milestone-6): open the guest request form.
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Guest request not yet implemented.'),
                    ),
                  );
                },
                child: const Text('Request guest seats'),
              ),
            ],
          );
        },
      ),
    );
  }
}

final _eventProvider = StreamProvider.family<BusEvent, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchEvent(id);
});

final _stopsProvider =
    StreamProvider.family<List<RouteStop>, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchStops(id);
});

class _CapacityBanner extends StatelessWidget {
  const _CapacityBanner({required this.event});
  final BusEvent event;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = switch (event.capacityStatus) {
      CapacityStatus.over => scheme.errorContainer,
      CapacityStatus.at => scheme.tertiaryContainer,
      CapacityStatus.near => scheme.secondaryContainer,
      CapacityStatus.under => scheme.surfaceContainerHighest,
    };
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.directions_bus_outlined),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              '${event.capacityApprovedTotal} / ${event.capacityMax} seats '
              '(${event.capacityStatus.name})',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteList extends StatelessWidget {
  const _RouteList({required this.stops});
  final List<RouteStop> stops;

  @override
  Widget build(BuildContext context) {
    if (stops.isEmpty) {
      return const Text('No route stops configured yet.');
    }
    return Column(
      children: stops.map((stop) {
        return ListTile(
          dense: false,
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.place_outlined),
          title: Text(stop.name),
          subtitle: Text(
            '${stop.type.name.replaceAll('_', ' ')}'
            '${stop.scheduledAt != null ? ' • ${DateFormat.Hm().format(stop.scheduledAt!.toLocal())}' : ''}',
          ),
          trailing: stop.location == null
              ? null
              : IconButton(
                  icon: const Icon(Icons.map_outlined),
                  tooltip: 'Open in Maps',
                  onPressed: () => MapsLauncher.launchCoordinates(
                    stop.location!.lat,
                    stop.location!.lng,
                    stop.name,
                  ),
                ),
        );
      }).toList(),
    );
  }
}

class _ParkedBusTile extends StatelessWidget {
  const _ParkedBusTile({required this.event});
  final BusEvent event;

  @override
  Widget build(BuildContext context) {
    final loc = event.parkedBusLocation!;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.directions_bus),
      title: Text(loc.label?.isNotEmpty == true ? loc.label! : 'Bus location'),
      subtitle: loc.notes != null && loc.notes!.isNotEmpty
          ? Text(loc.notes!)
          : null,
      trailing: IconButton(
        icon: const Icon(Icons.map_outlined),
        tooltip: 'Open in Maps',
        onPressed: () => MapsLauncher.launchCoordinates(
          loc.lat,
          loc.lng,
          loc.label ?? 'Parked bus',
        ),
      ),
    );
  }
}
