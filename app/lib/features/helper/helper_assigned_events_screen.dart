import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../data/models/event.dart';
import '../../data/repositories/events_repository.dart';

class HelperAssignedEventsScreen extends ConsumerWidget {
  const HelperAssignedEventsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = ref.watch(currentUserIdProvider);
    final assignedAsync = uid == null
        ? const AsyncValue<List<BusEvent>>.data(<BusEvent>[])
        : ref.watch(_helperEventsProvider(uid));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Assigned events'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to helper',
          onPressed: () => context.go('/helper'),
        ),
      ),
      body: assignedAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (events) {
          if (events.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'You are not assigned to any events yet. An admin will '
                  'assign you when you are needed for an event.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemBuilder: (_, i) => _AssignedEventTile(event: events[i]),
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemCount: events.length,
          );
        },
      ),
    );
  }
}

class _AssignedEventTile extends StatelessWidget {
  const _AssignedEventTile({required this.event});

  final BusEvent event;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () => context.go('/helper/events/${event.id}'),
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
          ].join('  •  '),
        ),
      ),
      trailing: const Icon(Icons.chevron_right),
    );
  }
}

final _helperEventsProvider =
    StreamProvider.family<List<BusEvent>, String>((ref, uid) async* {
  final eventIdsStream =
      ref.watch(eventsRepositoryProvider).watchHelperEventIds(uid);
  await for (final ids in eventIdsStream) {
    if (ids.isEmpty) {
      yield <BusEvent>[];
      continue;
    }
    final docs = await Future.wait(
      ids.map(
        (id) => FirebaseFirestore.instance.collection('events').doc(id).get(),
      ),
    );
    final events = docs
        .where((d) => d.exists)
        .map(BusEvent.fromDoc)
        .toList()
      ..sort((a, b) => a.eventDate.compareTo(b.eventDate));
    yield events;
  }
});
