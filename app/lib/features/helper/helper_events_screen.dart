import 'package:flutter/material.dart';

import '../../data/repositories/demo_repository.dart';
import '../route_stops/route_stops_screen.dart';

class HelperEventsScreen extends StatelessWidget {
  const HelperEventsScreen({super.key, required this.repository});

  final DemoRepository repository;

  @override
  Widget build(BuildContext context) {
    final events = repository.events;

    return Scaffold(
      appBar: AppBar(title: const Text('Helper operations')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: events.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final event = events[index];
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(event.title, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Text(event.destinationName),
                  if (event.parkedBusLocation != null)
                    Text('Parked bus: ${event.parkedBusLocation!.label}'),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => RouteStopsScreen(stops: event.stops),
                        ),
                      );
                    },
                    icon: const Icon(Icons.alt_route),
                    label: const Text('Update route and parked bus notes'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
