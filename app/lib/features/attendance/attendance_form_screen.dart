import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../data/models/event.dart';
import '../../data/models/member.dart';
import '../../data/models/member_response.dart';
import '../../data/models/route_stop.dart';
import '../../data/repositories/events_repository.dart';
import '../../data/repositories/members_repository.dart';

/// Lets a user confirm or decline a seat for one of the members they are
/// linked to, and choose pickup / drop-off stops.
///
/// Shape:
///
/// 1. Pick a member you represent.
/// 2. Toggle attending / not attending.
/// 3. If attending, pick an outbound pickup stop (required) and a return
///    drop-off stop (optional).
/// 4. Submit. The Firestore rules + capacity trigger handle persistence
///    and recalculation.
class AttendanceFormScreen extends ConsumerStatefulWidget {
  const AttendanceFormScreen({super.key, required this.eventId});

  final String eventId;

  @override
  ConsumerState<AttendanceFormScreen> createState() =>
      _AttendanceFormScreenState();
}

class _AttendanceFormScreenState extends ConsumerState<AttendanceFormScreen> {
  String? _selectedMemberId;
  MemberResponseStatus _status = MemberResponseStatus.attending;
  String? _outboundStopId;
  String? _returnStopId;
  final _notesController = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _info;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit({
    required BusEvent event,
    required Member member,
  }) async {
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    try {
      final uid = ref.read(currentUserIdProvider);
      if (uid == null) throw StateError('Not signed in.');
      if (_status == MemberResponseStatus.attending && _outboundStopId == null) {
        throw ArgumentError(
          'Please choose where ${member.displayName} will be picked up.',
        );
      }
      if (event.isCutoffPassed) {
        throw StateError(
          'The cutoff for this event has passed. Please contact an admin '
          'to make changes.',
        );
      }
      await ref.read(eventsRepositoryProvider).upsertMemberResponse(
            eventId: widget.eventId,
            memberId: member.id,
            respondingUserId: uid,
            status: _status,
            event: event,
            memberDisplayName: member.displayName,
            outboundPickupStopId: _status == MemberResponseStatus.attending
                ? _outboundStopId
                : null,
            returnDropoffStopId: _status == MemberResponseStatus.attending
                ? _returnStopId
                : null,
            generalNotes: _notesController.text.trim().isEmpty
                ? null
                : _notesController.text.trim(),
          );
      if (mounted) {
        setState(() {
          _info = 'Saved. Thanks!';
        });
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
    final eventAsync = ref.watch(_attendanceEventProvider(widget.eventId));
    final stopsAsync = ref.watch(_attendanceStopsProvider(widget.eventId));
    final membersAsync = uid == null
        ? const AsyncValue<List<Member>>.data(<Member>[])
        : ref.watch(_linkedMembersProvider(uid));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Confirm attendance'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
          tooltip: 'Back',
        ),
      ),
      body: eventAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorBanner(message: '$e'),
        data: (event) => stopsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _ErrorBanner(message: '$e'),
          data: (stops) => membersAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => _ErrorBanner(message: '$e'),
            data: (members) => _buildBody(event, stops, members),
          ),
        ),
      ),
    );
  }

  Widget _buildBody(
    BusEvent event,
    List<RouteStop> stops,
    List<Member> members,
  ) {
    if (members.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Text(
            'You are not yet linked to any supporters. Ask an admin to '
            'approve your link request, then come back to confirm a seat.',
            style: Theme.of(context).textTheme.bodyLarge,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    final outboundStops = stops
        .where(
          (s) => s.type == StopType.outboundPickup && s.isActive,
        )
        .toList();
    final returnStops = stops
        .where((s) => s.type == StopType.returnDropoff && s.isActive)
        .toList();

    final selectedMember = _selectedMemberId == null
        ? null
        : members.firstWhere(
            (m) => m.id == _selectedMemberId,
            orElse: () => members.first,
          );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          event.title,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 4),
        Text(DateFormat('EEE d MMM, HH:mm').format(event.eventDate.toLocal())),
        if (event.isCutoffPassed) ...[
          const SizedBox(height: 12),
          _Banner(
            color: Theme.of(context).colorScheme.errorContainer,
            icon: Icons.lock_clock_outlined,
            text:
                'The cutoff for this event has passed. Contact an admin to '
                'make changes.',
          ),
        ],
        const SizedBox(height: 16),
        const Text('Supporter', style: _label),
        const SizedBox(height: 4),
        DropdownButtonFormField<String>(
          value: selectedMember?.id,
          decoration: const InputDecoration(
            labelText: 'Choose who you are responding for',
          ),
          items: members
              .map(
                (m) => DropdownMenuItem(
                  value: m.id,
                  child: Text(m.displayName),
                ),
              )
              .toList(),
          onChanged: (v) => setState(() => _selectedMemberId = v),
        ),
        const SizedBox(height: 24),
        const Text('Going?', style: _label),
        const SizedBox(height: 4),
        SegmentedButton<MemberResponseStatus>(
          segments: const [
            ButtonSegment(
              value: MemberResponseStatus.attending,
              label: Text('Attending'),
              icon: Icon(Icons.check),
            ),
            ButtonSegment(
              value: MemberResponseStatus.notAttending,
              label: Text('Not attending'),
              icon: Icon(Icons.close),
            ),
          ],
          selected: {_status},
          onSelectionChanged: (s) => setState(() => _status = s.first),
        ),
        if (_status == MemberResponseStatus.attending) ...[
          const SizedBox(height: 24),
          const Text('Pickup stop', style: _label),
          const SizedBox(height: 4),
          if (outboundStops.isEmpty)
            const Text(
              'No pickup stops are configured yet.',
              style: TextStyle(fontStyle: FontStyle.italic),
            )
          else
            DropdownButtonFormField<String>(
              value: _outboundStopId,
              decoration: const InputDecoration(
                labelText: 'Where will they board?',
              ),
              items: outboundStops
                  .map(
                    (s) => DropdownMenuItem(
                      value: s.id,
                      child: Text(_stopLabel(s)),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _outboundStopId = v),
            ),
          if (returnStops.isNotEmpty) ...[
            const SizedBox(height: 24),
            const Text('Return drop-off (optional)', style: _label),
            const SizedBox(height: 4),
            DropdownButtonFormField<String?>(
              value: _returnStopId,
              decoration: const InputDecoration(
                labelText: 'Where do they want to be dropped off?',
              ),
              items: <DropdownMenuItem<String?>>[
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('Same as pickup / no preference'),
                ),
                ...returnStops.map(
                  (s) => DropdownMenuItem<String?>(
                    value: s.id,
                    child: Text(_stopLabel(s)),
                  ),
                ),
              ],
              onChanged: (v) => setState(() => _returnStopId = v),
            ),
          ],
        ],
        const SizedBox(height: 24),
        TextField(
          controller: _notesController,
          decoration: const InputDecoration(
            labelText: 'Notes (optional)',
            hintText: 'e.g. wheelchair access, travelling with...',
          ),
          maxLines: 3,
          maxLength: 500,
        ),
        const SizedBox(height: 16),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Banner(
              color: Theme.of(context).colorScheme.errorContainer,
              icon: Icons.error_outline,
              text: _error!,
            ),
          ),
        if (_info != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _Banner(
              color: Theme.of(context).colorScheme.tertiaryContainer,
              icon: Icons.check_circle_outline,
              text: _info!,
            ),
          ),
        ElevatedButton(
          onPressed: _busy || event.isCutoffPassed || selectedMember == null
              ? null
              : () => _submit(event: event, member: selectedMember),
          child: _busy
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(
                  _status == MemberResponseStatus.attending
                      ? 'Confirm seat'
                      : 'Save not-attending',
                ),
        ),
      ],
    );
  }

  String _stopLabel(RouteStop stop) {
    final time = stop.scheduledAt;
    if (time == null) return stop.name;
    final hhmm = DateFormat.Hm().format(time.toLocal());
    return '${stop.name}  •  $hhmm';
  }
}

const _label = TextStyle(fontSize: 16, fontWeight: FontWeight.w600);

final _attendanceEventProvider =
    StreamProvider.family<BusEvent, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchEvent(id);
});

final _attendanceStopsProvider =
    StreamProvider.family<List<RouteStop>, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchStops(id);
});

final _linkedMembersProvider =
    StreamProvider.family<List<Member>, String>((ref, uid) {
  return ref.watch(membersRepositoryProvider).watchLinkedMembers(uid);
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
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 15)),
          ),
        ],
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: _Banner(
          color: Theme.of(context).colorScheme.errorContainer,
          icon: Icons.error_outline,
          text: message,
        ),
      ),
    );
  }
}
