import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../data/models/event.dart';
import '../../data/repositories/events_repository.dart';

/// Admin list of all events (including drafts), with quick capacity badges.
class AdminEventsScreen extends ConsumerWidget {
  const AdminEventsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events = ref.watch(_allEventsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Events (admin)'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to admin',
          onPressed: () => context.go('/admin'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'New event',
            onPressed: () =>
                context.go('/admin/events/new', extra: const _NewEventArg()),
          ),
        ],
      ),
      body: events.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (list) {
          if (list.isEmpty) {
            return const Center(child: Text('No events yet.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemBuilder: (_, i) => _AdminEventTile(event: list[i]),
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemCount: list.length,
          );
        },
      ),
    );
  }
}

class _AdminEventTile extends StatelessWidget {
  const _AdminEventTile({required this.event});

  final BusEvent event;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () => context.go('/admin/events/${event.id}'),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      title: Text(
        event.title,
        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(
          [
            DateFormat('EEE d MMM, HH:mm').format(event.eventDate.toLocal()),
            'status: ${event.status.name}',
            'seats: ${event.capacityApprovedTotal}/${event.capacityMax}',
            if (event.pendingGuestRisk) 'pending-guest-risk',
          ].join('  •  '),
        ),
      ),
      trailing: const Icon(Icons.chevron_right),
    );
  }
}

class _NewEventArg {
  const _NewEventArg();
}

final _allEventsProvider = StreamProvider<List<BusEvent>>((ref) {
  // Watch the auth state to recompute when an admin signs in/out.
  ref.watch(currentUserIdProvider);
  return ref.watch(eventsRepositoryProvider).watchAllEvents();
});
