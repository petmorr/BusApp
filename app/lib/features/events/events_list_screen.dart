import 'package:flutter/material.dart';

import '../../data/models/app_user.dart';
import '../../data/models/capacity_summary.dart';
import '../../data/repositories/demo_repository.dart';
import '../admin/admin_dashboard_screen.dart';
import '../helper/helper_events_screen.dart';
import 'event_detail_screen.dart';

class EventsListScreen extends StatelessWidget {
  const EventsListScreen({
    super.key,
    required this.currentUser,
    required this.repository,
  });

  final AppUser currentUser;
  final DemoRepository repository;

  @override
  Widget build(BuildContext context) {
    final events = repository.upcomingEvents();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Upcoming bus events'),
        actions: [
          if (currentUser.isHelper)
            IconButton(
              tooltip: 'Helper tools',
              icon: const Icon(Icons.engineering_outlined),
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => HelperEventsScreen(repository: repository),
                  ),
                );
              },
            ),
          if (currentUser.isAdmin)
            IconButton(
              tooltip: 'Admin',
              icon: const Icon(Icons.admin_panel_settings_outlined),
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => AdminDashboardScreen(repository: repository),
                  ),
                );
              },
            ),
        ],
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: events.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final event = events[index];
          final summary = repository.capacitySummaryFor(event.id);

          return Card(
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              title: Text(event.title),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '${event.formattedDate}\n'
                  '${summary.approvedTotal}/${event.capacityMax} seats confirmed - ${summary.status.label}',
                ),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => EventDetailScreen(
                      repository: repository,
                      event: event,
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
