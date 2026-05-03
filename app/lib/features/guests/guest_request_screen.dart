import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../data/models/event.dart';
import '../../data/models/guest_request.dart';
import '../../data/models/route_stop.dart';
import '../../data/repositories/events_repository.dart';

/// Lets a signed-in user request a named guest seat. Status starts as
/// `pending` and is later approved/rejected by an admin via Cloud Function.
class GuestRequestScreen extends ConsumerStatefulWidget {
  const GuestRequestScreen({super.key, required this.eventId});

  final String eventId;

  @override
  ConsumerState<GuestRequestScreen> createState() =>
      _GuestRequestScreenState();
}

class _GuestRequestScreenState extends ConsumerState<GuestRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _notesController = TextEditingController();
  String? _pickupStopId;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_pickupStopId == null) {
      setState(() => _error = 'Please choose a pickup stop.');
      return;
    }
    final uid = ref.read(currentUserIdProvider);
    if (uid == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(eventsRepositoryProvider).createGuestRequest(
            eventId: widget.eventId,
            requestedByUserId: uid,
            guestName: _nameController.text.trim(),
            initialPickupStopId: _pickupStopId!,
            generalNotes: _notesController.text.trim().isEmpty
                ? null
                : _notesController.text.trim(),
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Guest request submitted. An admin will review it.',
            ),
          ),
        );
        context.pop();
      }
    } catch (err) {
      setState(() => _error = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(currentUserIdProvider);
    final eventAsync = ref.watch(_guestEventProvider(widget.eventId));
    final stopsAsync = ref.watch(_guestStopsProvider(widget.eventId));
    final myGuestsAsync = uid == null
        ? const AsyncValue<List<GuestRequest>>.data(<GuestRequest>[])
        : ref.watch(_myGuestsProvider(widget.eventId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Request guest seats'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back',
          onPressed: () => context.pop(),
        ),
      ),
      body: eventAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _bannerCenter('$e', context),
        data: (event) => stopsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _bannerCenter('$e', context),
          data: (stops) {
            final outbound = stops
                .where(
                  (s) => s.type == StopType.outboundPickup && s.isActive,
                )
                .toList();
            return Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    event.title,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    DateFormat('EEE d MMM, HH:mm')
                        .format(event.eventDate.toLocal()),
                  ),
                  const SizedBox(height: 16),
                  if (event.pendingGuestRisk)
                    _Banner(
                      color: Theme.of(context).colorScheme.secondaryContainer,
                      icon: Icons.priority_high,
                      text:
                          'Heads up — there are already enough pending guest '
                          'requests to risk going over capacity. Admins '
                          'approve in order received.',
                    ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _nameController,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Guest name',
                      helperText: 'Required',
                    ),
                    validator: (v) => (v ?? '').trim().isEmpty
                        ? 'Please enter the guest\'s name'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  if (outbound.isEmpty)
                    const Text(
                      'No pickup stops are configured for this event yet.',
                      style: TextStyle(fontStyle: FontStyle.italic),
                    )
                  else
                    DropdownButtonFormField<String>(
                      value: _pickupStopId,
                      decoration: const InputDecoration(
                        labelText: 'Pickup stop',
                      ),
                      items: outbound
                          .map(
                            (s) => DropdownMenuItem(
                              value: s.id,
                              child: Text(_stopLabel(s)),
                            ),
                          )
                          .toList(),
                      onChanged: (v) => setState(() => _pickupStopId = v),
                    ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _notesController,
                    decoration: const InputDecoration(
                      labelText: 'Notes (optional)',
                      hintText: 'Anything the admin should know',
                    ),
                    maxLines: 3,
                    maxLength: 500,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    _Banner(
                      color: Theme.of(context).colorScheme.errorContainer,
                      icon: Icons.error_outline,
                      text: _error!,
                    ),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Submit request'),
                  ),
                  const SizedBox(height: 24),
                  myGuestsAsync.when(
                    loading: () => const SizedBox.shrink(),
                    error: (_, __) => const SizedBox.shrink(),
                    data: (mine) => mine.isEmpty
                        ? const SizedBox.shrink()
                        : _MyRequestsList(requests: mine),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  String _stopLabel(RouteStop stop) {
    final t = stop.scheduledAt;
    if (t == null) return stop.name;
    return '${stop.name}  •  ${DateFormat.Hm().format(t.toLocal())}';
  }

  Widget _bannerCenter(String msg, BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _Banner(
            color: Theme.of(context).colorScheme.errorContainer,
            icon: Icons.error_outline,
            text: msg,
          ),
        ),
      );
}

class _MyRequestsList extends StatelessWidget {
  const _MyRequestsList({required this.requests});

  final List<GuestRequest> requests;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Your guest requests for this event',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        ...requests.map(
          (r) => Card(
            child: ListTile(
              title: Text(r.guestName),
              subtitle: Text(_statusLabel(r.status)),
              leading: Icon(_statusIcon(r.status)),
            ),
          ),
        ),
      ],
    );
  }

  String _statusLabel(GuestRequestStatus s) {
    switch (s) {
      case GuestRequestStatus.pending:
        return 'Awaiting admin decision';
      case GuestRequestStatus.approved:
        return 'Approved';
      case GuestRequestStatus.rejected:
        return 'Not approved';
      case GuestRequestStatus.cancelled:
        return 'Cancelled';
    }
  }

  IconData _statusIcon(GuestRequestStatus s) {
    switch (s) {
      case GuestRequestStatus.pending:
        return Icons.hourglass_empty;
      case GuestRequestStatus.approved:
        return Icons.check_circle_outline;
      case GuestRequestStatus.rejected:
        return Icons.cancel_outlined;
      case GuestRequestStatus.cancelled:
        return Icons.block;
    }
  }
}

final _guestEventProvider =
    StreamProvider.family<BusEvent, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchEvent(id);
});

final _guestStopsProvider =
    StreamProvider.family<List<RouteStop>, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchStops(id);
});

final _myGuestsProvider =
    StreamProvider.family<List<GuestRequest>, String>((ref, eventId) {
  final uid = ref.watch(currentUserIdProvider);
  if (uid == null) return const Stream.empty();
  return ref
      .watch(eventsRepositoryProvider)
      .watchGuestRequests(eventId)
      .map((all) => all.where((r) => r.requestedByUserId == uid).toList());
});

class _Banner extends StatelessWidget {
  const _Banner({
    required this.color,
    required this.icon,
    required this.text,
  });
  final Color color;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 15))),
        ],
      ),
    );
  }
}
