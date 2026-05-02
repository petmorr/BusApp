import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../data/models/event.dart';
import '../../data/repositories/events_repository.dart';

class EventsListScreen extends ConsumerWidget {
  const EventsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(_upcomingEventsProvider);
    final roles = ref.watch(currentUserRolesProvider).asData?.value;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Upcoming events'),
        actions: [
          if (roles?.isAdmin == true)
            IconButton(
              icon: const Icon(Icons.admin_panel_settings_outlined),
              tooltip: 'Admin',
              onPressed: () => context.go('/admin'),
            ),
          if (roles?.isHelper == true)
            IconButton(
              icon: const Icon(Icons.handyman_outlined),
              tooltip: 'Helper',
              onPressed: () => context.go('/helper'),
            ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () => FirebaseAuth.instance.signOut(),
          ),
        ],
      ),
      body: events.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (list) {
          if (list.isEmpty) {
            return const Center(child: Text('No upcoming events.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemBuilder: (_, i) => _EventCard(event: list[i]),
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemCount: list.length,
          );
        },
      ),
    );
  }
}

final _upcomingEventsProvider = StreamProvider<List<BusEvent>>((ref) {
  return ref.watch(eventsRepositoryProvider).watchUpcomingEvents();
});

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});

  final BusEvent event;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('EEE d MMM, HH:mm');
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 12,
        ),
        title: Text(
          event.title,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(dateFmt.format(event.eventDate.toLocal())),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.go('/events/${event.id}'),
      ),
    );
  }
}
