import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../data/models/app_user.dart';
import '../../data/models/event.dart';
import '../../data/models/route_stop.dart';
import '../../data/repositories/events_repository.dart';
import '../../data/repositories/notifications_service.dart';
import '../../data/repositories/users_repository.dart';

/// Admin event create / edit screen.
///
/// - For create: instantiate with [eventId] = null, then [_save] writes a
///   new doc and rewrites the location to the new id so the helpers + stops
///   tabs become useful immediately.
/// - For edit: streams the event so capacity counters etc stay live.
class AdminEventEditScreen extends ConsumerStatefulWidget {
  const AdminEventEditScreen({super.key, this.eventId});

  final String? eventId;

  @override
  ConsumerState<AdminEventEditScreen> createState() =>
      _AdminEventEditScreenState();
}

class _AdminEventEditScreenState
    extends ConsumerState<AdminEventEditScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _capacityController = TextEditingController(text: '50');
  final _thresholdController = TextEditingController(text: '90');
  final _destinationController = TextEditingController();
  final _notesController = TextEditingController();
  DateTime? _eventDate;
  DateTime? _cutoffAt;
  EventStatus _status = EventStatus.draft;
  bool _busy = false;
  String? _error;
  bool _hydrated = false;

  @override
  void dispose() {
    _titleController.dispose();
    _capacityController.dispose();
    _thresholdController.dispose();
    _destinationController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _hydrate(BusEvent e) {
    if (_hydrated) return;
    _hydrated = true;
    _titleController.text = e.title;
    _capacityController.text = e.capacityMax.toString();
    _thresholdController.text = e.capacityNearThresholdPercent.toString();
    _destinationController.text = e.destinationName ?? '';
    _notesController.text = e.generalNotes ?? '';
    _eventDate = e.eventDate;
    _cutoffAt = e.cutoffAt;
    _status = e.status;
    if (mounted) setState(() {});
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_eventDate == null) {
      setState(() => _error = 'Please choose an event date and time.');
      return;
    }
    final adminId = ref.read(currentUserIdProvider);
    if (adminId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = ref.read(eventsRepositoryProvider);
      final cap = int.tryParse(_capacityController.text.trim()) ?? 0;
      final thr = int.tryParse(_thresholdController.text.trim()) ?? 90;
      if (widget.eventId == null) {
        final ref = await repo.createEvent(
          adminUserId: adminId,
          title: _titleController.text.trim(),
          eventDate: _eventDate!,
          capacityMax: cap,
          capacityNearThresholdPercent: thr,
          status: _status,
          cutoffAt: _cutoffAt,
          destinationName: _destinationController.text.trim().isEmpty
              ? null
              : _destinationController.text.trim(),
          generalNotes: _notesController.text.trim(),
        );
        if (mounted) context.go('/admin/events/${ref.id}');
      } else {
        await repo.updateEvent(
          eventId: widget.eventId!,
          title: _titleController.text.trim(),
          eventDate: _eventDate,
          capacityMax: cap,
          capacityNearThresholdPercent: thr,
          status: _status,
          cutoffAt: _cutoffAt,
          clearCutoff: _cutoffAt == null,
          destinationName: _destinationController.text.trim(),
          generalNotes: _notesController.text.trim(),
        );
      }
    } catch (err) {
      setState(() => _error = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final id = widget.eventId;
    if (id == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this event?'),
        content: const Text(
          'This deletes the event document. Member responses and guest '
          'requests in subcollections are preserved for audit history.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(eventsRepositoryProvider).deleteEvent(id);
      if (mounted) context.go('/admin/events');
    } catch (err) {
      setState(() {
        _error = '$err';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isCreate = widget.eventId == null;
    final eventAsync = isCreate
        ? const AsyncValue<BusEvent?>.data(null)
        : ref.watch(_adminEventStreamProvider(widget.eventId!));

    return DefaultTabController(
      length: isCreate ? 1 : 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(isCreate ? 'New event' : 'Edit event'),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            tooltip: 'Back to events',
            onPressed: () => context.go('/admin/events'),
          ),
          actions: [
            if (!isCreate)
              IconButton(
                icon: const Icon(Icons.delete_outline),
                tooltip: 'Delete event',
                onPressed: _busy ? null : _delete,
              ),
          ],
          bottom: isCreate
              ? null
              : const TabBar(
                  tabs: [
                    Tab(text: 'Details'),
                    Tab(text: 'Stops'),
                    Tab(text: 'Helpers'),
                    Tab(text: 'Reminders'),
                  ],
                ),
        ),
        body: eventAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (event) {
            if (!isCreate && event != null) _hydrate(event);
            if (isCreate) return _detailsForm();
            return TabBarView(
              children: [
                _detailsForm(),
                _StopsTab(eventId: widget.eventId!),
                _HelpersTab(eventId: widget.eventId!),
                _RemindersTab(eventId: widget.eventId!),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _detailsForm() {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextFormField(
            controller: _titleController,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(labelText: 'Title'),
            validator: (v) => (v ?? '').trim().isEmpty ? 'Required' : null,
          ),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event),
            title: Text(
              _eventDate == null
                  ? 'Event date / time (required)'
                  : DateFormat('EEE d MMM yyyy, HH:mm')
                      .format(_eventDate!.toLocal()),
            ),
            trailing: const Icon(Icons.edit),
            onTap: _busy ? null : () => _pickDateTime(_eventDate, true),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.lock_clock_outlined),
            title: Text(
              _cutoffAt == null
                  ? 'Response cutoff (optional)'
                  : 'Cutoff: ${DateFormat('EEE d MMM, HH:mm').format(_cutoffAt!.toLocal())}',
            ),
            trailing: _cutoffAt == null
                ? const Icon(Icons.add)
                : IconButton(
                    icon: const Icon(Icons.clear),
                    tooltip: 'Clear cutoff',
                    onPressed: _busy ? null : () => setState(() => _cutoffAt = null),
                  ),
            onTap: _busy ? null : () => _pickDateTime(_cutoffAt, false),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _capacityController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                  ],
                  decoration: const InputDecoration(labelText: 'Capacity (max seats)'),
                  validator: (v) {
                    final n = int.tryParse((v ?? '').trim());
                    if (n == null || n <= 0) return 'Must be a positive integer';
                    return null;
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextFormField(
                  controller: _thresholdController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Near threshold %',
                    helperText: '90 = alert at 90% full',
                  ),
                  validator: (v) {
                    final n = int.tryParse((v ?? '').trim());
                    if (n == null || n < 50 || n > 100) {
                      return '50–100';
                    }
                    return null;
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<EventStatus>(
            value: _status,
            decoration: const InputDecoration(labelText: 'Status'),
            items: EventStatus.values
                .map((s) => DropdownMenuItem(value: s, child: Text(s.name)))
                .toList(),
            onChanged: (v) => setState(() => _status = v ?? EventStatus.draft),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _destinationController,
            decoration: const InputDecoration(
              labelText: 'Destination (optional)',
              hintText: 'e.g. Anfield',
            ),
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _notesController,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Notes (optional)',
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(widget.eventId == null ? 'Create event' : 'Save changes'),
          ),
        ],
      ),
    );
  }

  Future<void> _pickDateTime(DateTime? initial, bool isEventDate) async {
    final now = DateTime.now();
    final base = initial ?? now.add(const Duration(days: 7));
    final date = await showDatePicker(
      context: context,
      initialDate: base,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
    );
    if (time == null) return;
    final picked = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    setState(() {
      if (isEventDate) {
        _eventDate = picked;
      } else {
        _cutoffAt = picked;
      }
    });
  }
}

final _adminEventStreamProvider =
    StreamProvider.family<BusEvent, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchEvent(id);
});

// ----- Stops tab -----

class _StopsTab extends ConsumerWidget {
  const _StopsTab({required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stops = ref.watch(_allStopsProvider(eventId));
    return Scaffold(
      body: stops.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (list) {
          if (list.isEmpty) {
            return const Center(child: Text('No stops configured yet.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemBuilder: (_, i) {
              final s = list[i];
              return ListTile(
                onTap: () => _editStop(context, eventId: eventId, stop: s),
                title: Text(s.name),
                subtitle: Text(
                  [
                    s.type.wire.replaceAll('_', ' '),
                    if (s.scheduledAt != null)
                      DateFormat.Hm().format(s.scheduledAt!.toLocal()),
                    if (!s.isActive) 'inactive',
                  ].join('  •  '),
                ),
                leading: const Icon(Icons.place_outlined),
                trailing: Text('#${s.sequence}'),
              );
            },
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemCount: list.length,
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _editStop(context, eventId: eventId, stop: null),
        icon: const Icon(Icons.add),
        label: const Text('New stop'),
      ),
    );
  }

  Future<void> _editStop(
    BuildContext context, {
    required String eventId,
    required RouteStop? stop,
  }) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _StopEditScreen(eventId: eventId, stop: stop),
        fullscreenDialog: true,
      ),
    );
  }
}

final _allStopsProvider =
    StreamProvider.family<List<RouteStop>, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchAllStops(id);
});

class _StopEditScreen extends ConsumerStatefulWidget {
  const _StopEditScreen({required this.eventId, required this.stop});

  final String eventId;
  final RouteStop? stop;

  @override
  ConsumerState<_StopEditScreen> createState() => _StopEditScreenState();
}

class _StopEditScreenState extends ConsumerState<_StopEditScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _sequence;
  late final TextEditingController _lat;
  late final TextEditingController _lng;
  late final TextEditingController _address;
  late final TextEditingController _notes;
  late StopType _type;
  late bool _isActive;
  DateTime? _scheduledAt;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final s = widget.stop;
    _name = TextEditingController(text: s?.name ?? '');
    _sequence = TextEditingController(text: (s?.sequence ?? 0).toString());
    _lat = TextEditingController(
      text: s?.location?.lat.toString() ?? '',
    );
    _lng = TextEditingController(
      text: s?.location?.lng.toString() ?? '',
    );
    _address = TextEditingController(text: s?.location?.address ?? '');
    _notes = TextEditingController(text: s?.notes ?? '');
    _type = s?.type ?? StopType.outboundPickup;
    _isActive = s?.isActive ?? true;
    _scheduledAt = s?.scheduledAt;
  }

  @override
  void dispose() {
    _name.dispose();
    _sequence.dispose();
    _lat.dispose();
    _lng.dispose();
    _address.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final adminId = ref.read(currentUserIdProvider);
    if (adminId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      double? lat;
      double? lng;
      if (_lat.text.trim().isNotEmpty && _lng.text.trim().isNotEmpty) {
        lat = double.parse(_lat.text.trim());
        lng = double.parse(_lng.text.trim());
      }
      await ref.read(eventsRepositoryProvider).upsertStop(
            eventId: widget.eventId,
            adminUserId: adminId,
            stopId: widget.stop?.id,
            name: _name.text.trim(),
            type: _type,
            sequence: int.parse(_sequence.text.trim()),
            isActive: _isActive,
            scheduledAt: _scheduledAt,
            lat: lat,
            lng: lng,
            address: _address.text.trim().isEmpty ? null : _address.text.trim(),
            notes: _notes.text.trim(),
          );
      if (mounted) Navigator.of(context).pop();
    } catch (err) {
      setState(() => _error = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final id = widget.stop?.id;
    if (id == null) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(eventsRepositoryProvider)
          .deleteStop(eventId: widget.eventId, stopId: id);
      if (mounted) Navigator.of(context).pop();
    } catch (err) {
      setState(() {
        _error = '$err';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.stop == null ? 'New stop' : 'Edit stop'),
        actions: [
          if (widget.stop != null)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Delete stop',
              onPressed: _busy ? null : _delete,
            ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Stop name'),
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<StopType>(
              value: _type,
              decoration: const InputDecoration(labelText: 'Type'),
              items: StopType.values
                  .map(
                    (t) => DropdownMenuItem(
                      value: t,
                      child: Text(t.wire.replaceAll('_', ' ')),
                    ),
                  )
                  .toList(),
              onChanged: (v) =>
                  setState(() => _type = v ?? StopType.outboundPickup),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _sequence,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: 'Sequence (sort order)',
              ),
              validator: (v) {
                final n = int.tryParse((v ?? '').trim());
                if (n == null || n < 0) return 'Non-negative integer';
                return null;
              },
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.schedule),
              title: Text(
                _scheduledAt == null
                    ? 'Scheduled time (optional)'
                    : DateFormat('EEE d MMM, HH:mm')
                        .format(_scheduledAt!.toLocal()),
              ),
              trailing: _scheduledAt == null
                  ? const Icon(Icons.add)
                  : IconButton(
                      icon: const Icon(Icons.clear),
                      tooltip: 'Clear time',
                      onPressed: () => setState(() => _scheduledAt = null),
                    ),
              onTap: _pickDateTime,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _lat,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    decoration: const InputDecoration(labelText: 'Latitude'),
                    validator: _coordinate(min: -90, max: 90),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _lng,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    decoration: const InputDecoration(labelText: 'Longitude'),
                    validator: _coordinate(min: -180, max: 180),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _address,
              decoration: const InputDecoration(
                labelText: 'Address (optional)',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _notes,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Notes (optional)'),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _isActive,
              onChanged: (v) => setState(() => _isActive = v),
              title: const Text('Active'),
              subtitle: const Text(
                'Inactive stops are hidden from members and the attendance form.',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(widget.stop == null ? 'Create stop' : 'Save changes'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final base = _scheduledAt ?? now.add(const Duration(hours: 1));
    final date = await showDatePicker(
      context: context,
      initialDate: base,
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
    );
    if (time == null) return;
    setState(() {
      _scheduledAt = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  FormFieldValidator<String> _coordinate({
    required double min,
    required double max,
  }) {
    return (v) {
      final value = (v ?? '').trim();
      if (value.isEmpty) {
        // Allow blank — interpreted as "no coordinates".
        if (_lat.text.trim().isEmpty && _lng.text.trim().isEmpty) {
          return null;
        }
        return 'Provide both lat and lng or neither';
      }
      final n = double.tryParse(value);
      if (n == null) return 'Must be a number';
      if (n < min || n > max) return 'Out of range ($min, $max)';
      return null;
    };
  }
}

// ----- Helpers tab -----

class _HelpersTab extends ConsumerStatefulWidget {
  const _HelpersTab({required this.eventId});

  final String eventId;

  @override
  ConsumerState<_HelpersTab> createState() => _HelpersTabState();
}

class _HelpersTabState extends ConsumerState<_HelpersTab> {
  bool _busy = false;
  String? _error;

  Future<void> _toggleAssignment(AppUser user, bool currentlyAssigned) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await FirebaseFunctions.instance
          .httpsCallable(
            currentlyAssigned ? 'unassignEventHelper' : 'assignEventHelper',
          )
          .call({'eventId': widget.eventId, 'userId': user.id});
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
    final users = ref.watch(_allUsersProvider);
    final assigned =
        ref.watch(_eventHelperUserIdsProvider(widget.eventId));
    return users.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('$e')),
      data: (allUsers) => assigned.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (assignedIds) {
          final eligible = allUsers
              .where((u) => u.isHelper || u.isAdmin || assignedIds.contains(u.id))
              .toList();
          return Column(
            children: [
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    _error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
              Expanded(
                child: eligible.isEmpty
                    ? const Center(
                        child: Padding(
                          padding: EdgeInsets.all(24),
                          child: Text(
                            'No helpers exist yet. Promote a user via '
                            'setUserRole first.',
                          ),
                        ),
                      )
                    : ListView.separated(
                        itemBuilder: (_, i) {
                          final u = eligible[i];
                          final isAssigned = assignedIds.contains(u.id);
                          return SwitchListTile(
                            value: isAssigned,
                            onChanged: _busy
                                ? null
                                : (_) => _toggleAssignment(u, isAssigned),
                            title: Text(
                              u.displayName.isEmpty ? u.id : u.displayName,
                            ),
                            subtitle: Text(
                              [
                                u.phoneE164,
                                if (u.isAdmin) 'admin',
                                if (u.isHelper) 'helper',
                              ].where((s) => s.isNotEmpty).join('  •  '),
                            ),
                          );
                        },
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemCount: eligible.length,
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

final _allUsersProvider = StreamProvider<List<AppUser>>((ref) {
  return ref.watch(usersRepositoryProvider).watchAllUsers();
});

final _eventHelperUserIdsProvider =
    StreamProvider.family<List<String>, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchEventHelperUserIds(id);
});

// ----- Reminders tab -----

class _RemindersTab extends ConsumerStatefulWidget {
  const _RemindersTab({required this.eventId});

  final String eventId;

  @override
  ConsumerState<_RemindersTab> createState() => _RemindersTabState();
}

class _RemindersTabState extends ConsumerState<_RemindersTab> {
  bool _busy = false;
  String? _result;
  String? _error;

  Future<void> _run(Future<void> Function() action, String okMsg) async {
    setState(() {
      _busy = true;
      _result = null;
      _error = null;
    });
    try {
      await action();
      if (mounted) setState(() => _result = okMsg);
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
    final svc = ref.read(notificationsServiceProvider);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          'Push notifications',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        const Text(
          'Each action records a notifications/{id} document and dispatches '
          'an FCM payload to the relevant audience. Idempotent unless you '
          'override with a custom key.',
        ),
        const SizedBox(height: 16),
        _ReminderTile(
          icon: Icons.send_outlined,
          title: 'Send attendance request',
          subtitle: 'Initial push to every linked user.',
          enabled: !_busy,
          onTap: () => _run(
            () => svc.sendAttendanceRequest(widget.eventId),
            'Attendance request sent.',
          ),
        ),
        _ReminderTile(
          icon: Icons.alarm,
          title: 'Send attendance reminder',
          subtitle: 'To users with at least one un-responded member.',
          enabled: !_busy,
          onTap: () => _run(
            () => svc.sendAttendanceReminder(widget.eventId),
            'Attendance reminder sent.',
          ),
        ),
        _ReminderTile(
          icon: Icons.hourglass_empty,
          title: 'Send pending-guest reminder',
          subtitle: 'To users with one or more pending guest requests.',
          enabled: !_busy,
          onTap: () => _run(
            () => svc.sendPendingGuestReminder(widget.eventId),
            'Pending-guest reminder sent.',
          ),
        ),
        const SizedBox(height: 16),
        const Divider(),
        const SizedBox(height: 8),
        const Text(
          'Operational update',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        const Text(
          'Sent only to attending users + admins + assigned helpers.',
        ),
        const SizedBox(height: 12),
        _OperationalUpdateForm(
          eventId: widget.eventId,
          onResult: (msg) => setState(() => _result = msg),
          onError: (msg) => setState(() => _error = msg),
        ),
        if (_result != null) ...[
          const SizedBox(height: 16),
          Text(
            _result!,
            style: TextStyle(
              color: Theme.of(context).colorScheme.tertiary,
            ),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 16),
          Text(
            _error!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
      ],
    );
  }
}

class _ReminderTile extends StatelessWidget {
  const _ReminderTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.enabled,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.send),
        onTap: enabled ? onTap : null,
      ),
    );
  }
}

class _OperationalUpdateForm extends ConsumerStatefulWidget {
  const _OperationalUpdateForm({
    required this.eventId,
    required this.onResult,
    required this.onError,
  });

  final String eventId;
  final ValueChanged<String> onResult;
  final ValueChanged<String> onError;

  @override
  ConsumerState<_OperationalUpdateForm> createState() =>
      _OperationalUpdateFormState();
}

class _OperationalUpdateFormState
    extends ConsumerState<_OperationalUpdateForm> {
  final _titleController = TextEditingController();
  final _bodyController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _titleController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final title = _titleController.text.trim();
    final body = _bodyController.text.trim();
    if (title.isEmpty || body.isEmpty) {
      widget.onError('Please fill in both title and message.');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(notificationsServiceProvider).sendOperationalUpdate(
            eventId: widget.eventId,
            title: title,
            body: body,
          );
      _titleController.clear();
      _bodyController.clear();
      widget.onResult('Operational update sent.');
    } on FirebaseFunctionsException catch (err) {
      widget.onError(err.message ?? 'Failed.');
    } catch (err) {
      widget.onError('$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _titleController,
          decoration: const InputDecoration(labelText: 'Title'),
          maxLength: 200,
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _bodyController,
          decoration: const InputDecoration(labelText: 'Message'),
          maxLines: 3,
          maxLength: 1000,
        ),
        const SizedBox(height: 8),
        ElevatedButton.icon(
          onPressed: _busy ? null : _send,
          icon: const Icon(Icons.send),
          label: Text(_busy ? 'Sending…' : 'Send operational update'),
        ),
      ],
    );
  }
}
