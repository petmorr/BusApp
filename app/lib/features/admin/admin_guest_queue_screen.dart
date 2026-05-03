import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/guest_request.dart';

/// Admin queue for pending guest requests across all events. Uses a
/// collection-group query so the admin sees all pending guests in one
/// place.
class AdminGuestQueueScreen extends ConsumerWidget {
  const AdminGuestQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(_pendingGuestRequestsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pending guest requests'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to admin',
          onPressed: () => context.go('/admin'),
        ),
      ),
      body: pending.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (entries) {
          if (entries.isEmpty) {
            return const Center(child: Text('No pending guest requests.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemBuilder: (_, i) => _GuestRequestTile(entry: entries[i]),
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemCount: entries.length,
          );
        },
      ),
    );
  }
}

class _PendingGuestRequestEntry {
  const _PendingGuestRequestEntry({
    required this.request,
    required this.eventId,
    required this.eventTitle,
  });
  final GuestRequest request;
  final String eventId;
  final String eventTitle;
}

final _pendingGuestRequestsProvider =
    StreamProvider<List<_PendingGuestRequestEntry>>((ref) {
  return FirebaseFirestore.instance
      .collectionGroup('guestRequests')
      .where('status', isEqualTo: 'pending')
      .orderBy('createdAt')
      .snapshots()
      .asyncMap((snap) async {
    final results = <_PendingGuestRequestEntry>[];
    final eventTitleCache = <String, String>{};
    for (final doc in snap.docs) {
      final data = doc.data();
      final eventId = data['eventId'] as String? ??
          doc.reference.parent.parent?.id ??
          'unknown';
      String title;
      if (eventTitleCache.containsKey(eventId)) {
        title = eventTitleCache[eventId]!;
      } else {
        final eSnap = await FirebaseFirestore.instance
            .collection('events')
            .doc(eventId)
            .get();
        title = (eSnap.data()?['title'] as String?) ?? eventId;
        eventTitleCache[eventId] = title;
      }
      results.add(
        _PendingGuestRequestEntry(
          request: GuestRequest.fromDoc(doc),
          eventId: eventId,
          eventTitle: title,
        ),
      );
    }
    return results;
  });
});

class _GuestRequestTile extends ConsumerStatefulWidget {
  const _GuestRequestTile({required this.entry});

  final _PendingGuestRequestEntry entry;

  @override
  ConsumerState<_GuestRequestTile> createState() =>
      _GuestRequestTileState();
}

class _GuestRequestTileState extends ConsumerState<_GuestRequestTile> {
  bool _busy = false;
  String? _error;

  Future<void> _decide(bool approve) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await FirebaseFunctions.instance
          .httpsCallable(
            approve ? 'approveGuestRequest' : 'rejectGuestRequest',
          )
          .call({
        'eventId': widget.entry.eventId,
        'guestRequestId': widget.entry.request.id,
      });
    } on FirebaseFunctionsException catch (err) {
      setState(() => _error = err.message ?? 'Failed.');
    } catch (err) {
      setState(() => _error = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.entry.request;
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              r.guestName,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text('Event: ${widget.entry.eventTitle}'),
            Text('Requested by: ${r.requestedByUserId}'),
            if (r.generalNotes != null && r.generalNotes!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('Notes: ${r.generalNotes}'),
            ],
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : () => _decide(false),
                    icon: const Icon(Icons.close),
                    label: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy ? null : () => _decide(true),
                    icon: const Icon(Icons.check),
                    label: Text(_busy ? '…' : 'Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
