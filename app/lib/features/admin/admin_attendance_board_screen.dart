import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../data/models/event.dart';
import '../../data/models/guest_request.dart';
import '../../data/models/member.dart';
import '../../data/models/member_response.dart';
import '../../data/models/member_user_link.dart';
import '../../data/models/route_stop.dart';
import '../../data/repositories/events_repository.dart';
import '../../data/repositories/members_repository.dart';
import '../../data/repositories/notifications_service.dart';

/// Admin live attendance board for a single event:
///
/// - Capacity totals + status banner.
/// - All member responses grouped by pickup stop.
/// - The members linked to active accounts who have not yet responded
///   ("Still to confirm" — spec milestone 9 / Definition of Done).
/// - All guest requests grouped by status.
/// - Per-row admin override entry point for late or off-app confirmations
///   (spec: "Allow admins to manually override a member/event response if
///   someone confirms outside the app." + runbook).
class AdminAttendanceBoardScreen extends ConsumerWidget {
  const AdminAttendanceBoardScreen({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eventAsync = ref.watch(_boardEventProvider(eventId));
    final stopsAsync = ref.watch(_boardStopsProvider(eventId));
    final responsesAsync = ref.watch(_boardResponsesProvider(eventId));
    final guestsAsync = ref.watch(_boardGuestsProvider(eventId));
    final activeLinksAsync = ref.watch(_boardActiveLinksProvider);
    final membersAsync = ref.watch(_boardMembersByIdProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance board'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to admin',
          onPressed: () => context.go('/admin'),
        ),
      ),
      body: eventAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (event) => stopsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e')),
          data: (stops) => responsesAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('$e')),
            data: (responses) => guestsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('$e')),
              data: (guests) => activeLinksAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (activeLinks) => membersAsync.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => Center(child: Text('$e')),
                  data: (membersById) => _BoardBody(
                    eventId: eventId,
                    event: event,
                    stops: stops,
                    responses: responses,
                    guests: guests,
                    activeLinks: activeLinks,
                    membersById: membersById,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BoardBody extends ConsumerWidget {
  const _BoardBody({
    required this.eventId,
    required this.event,
    required this.stops,
    required this.responses,
    required this.guests,
    required this.activeLinks,
    required this.membersById,
  });

  final String eventId;
  final BusEvent event;
  final List<RouteStop> stops;
  final List<MemberResponse> responses;
  final List<GuestRequest> guests;
  final List<MemberUserLink> activeLinks;
  final Map<String, Member> membersById;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final attending =
        responses.where((r) => r.status == MemberResponseStatus.attending).toList();
    final notAttending = responses
        .where((r) => r.status == MemberResponseStatus.notAttending)
        .toList();
    final byStop = <String, List<MemberResponse>>{};
    for (final r in attending) {
      final key = r.outboundPickupStopId ?? '_unassigned';
      byStop.putIfAbsent(key, () => []).add(r);
    }
    final stopName = {for (final s in stops) s.id: s.name};
    final activeOutboundStops =
        stops.where((s) => s.type == StopType.outboundPickup && s.isActive).toList();
    final activeReturnStops =
        stops.where((s) => s.type == StopType.returnDropoff && s.isActive).toList();

    // "Still to confirm": members with at least one *active* link, who do
    // not yet have a memberResponse for this event. Spec Milestone 9 +
    // MVP Definition of Done explicitly call for this group, so admins
    // can chase outstanding confirmations without exporting to a sheet.
    final respondedMemberIds = responses.map((r) => r.memberId).toSet();
    final activeMemberIds = activeLinks.map((l) => l.memberId).toSet();
    final stillToConfirm = activeMemberIds
        .where((id) => !respondedMemberIds.contains(id))
        .map((id) => membersById[id])
        .whereType<Member>()
        .toList()
      ..sort((a, b) => a.displayName.compareTo(b.displayName));

    final pendingGuests = guests
        .where((g) => g.status == GuestRequestStatus.pending)
        .toList();
    final approvedGuests = guests
        .where((g) => g.status == GuestRequestStatus.approved)
        .toList();
    final rejectedGuests = guests
        .where(
          (g) =>
              g.status == GuestRequestStatus.rejected ||
              g.status == GuestRequestStatus.cancelled,
        )
        .toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _CapacitySummary(event: event),
        const SizedBox(height: 16),
        _SectionHeader(
          title: 'Attending members',
          count: attending.length,
        ),
        if (attending.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('No members confirmed yet.'),
          )
        else
          ...byStop.entries.map(
            (entry) => _StopGroup(
              eventId: eventId,
              title: stopName[entry.key] ?? 'No pickup stop selected',
              members: entry.value,
              outboundStops: activeOutboundStops,
              returnStops: activeReturnStops,
            ),
          ),
        const SizedBox(height: 16),
        _SectionHeader(
          title: 'Not attending',
          count: notAttending.length,
        ),
        ...notAttending.map(
          (r) => _ResponseTile(
            eventId: eventId,
            response: r,
            outboundStops: activeOutboundStops,
            returnStops: activeReturnStops,
            leading: const Icon(Icons.do_not_disturb),
          ),
        ),
        const SizedBox(height: 16),
        _SectionHeader(
          title: 'Still to confirm',
          count: stillToConfirm.length,
        ),
        if (stillToConfirm.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'Every linked member has responded.',
            ),
          )
        else
          ...stillToConfirm.map(
            (m) => _StillToConfirmTile(
              eventId: eventId,
              member: m,
              outboundStops: activeOutboundStops,
              returnStops: activeReturnStops,
            ),
          ),
        const SizedBox(height: 16),
        _SectionHeader(
          title: 'Approved guests',
          count: approvedGuests.length,
        ),
        ...approvedGuests.map((g) => _GuestRow(guest: g, stops: stopName)),
        const SizedBox(height: 16),
        _SectionHeader(
          title: 'Pending guests',
          count: pendingGuests.length,
        ),
        ...pendingGuests.map((g) => _GuestRow(guest: g, stops: stopName)),
        if (rejectedGuests.isNotEmpty) ...[
          const SizedBox(height: 16),
          _SectionHeader(
            title: 'Rejected / cancelled guests',
            count: rejectedGuests.length,
          ),
          ...rejectedGuests.map((g) => _GuestRow(guest: g, stops: stopName)),
        ],
      ],
    );
  }
}

class _CapacitySummary extends StatelessWidget {
  const _CapacitySummary({required this.event});
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            event.title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(DateFormat('EEE d MMM, HH:mm').format(event.eventDate.toLocal())),
          const SizedBox(height: 12),
          _capacityRow(
            'Confirmed members',
            event.capacityConfirmedMemberSeats,
          ),
          _capacityRow(
            'Approved guests',
            event.capacityApprovedGuestSeats,
          ),
          _capacityRow('Approved total', event.capacityApprovedTotal),
          _capacityRow(
            'Pending guests',
            event.capacityPendingGuestSeats,
          ),
          _capacityRow('Potential total', event.capacityPotentialTotal),
          const Divider(),
          _capacityRow(
            'Capacity (max)',
            event.capacityMax,
            highlight: true,
          ),
          _capacityRow('Status', event.capacityStatus.name, highlight: true),
        ],
      ),
    );
  }

  Widget _capacityRow(String label, Object value, {bool highlight = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(
            '$value',
            style: TextStyle(
              fontWeight: highlight ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _StopGroup extends StatelessWidget {
  const _StopGroup({
    required this.eventId,
    required this.title,
    required this.members,
    required this.outboundStops,
    required this.returnStops,
  });
  final String eventId;
  final String title;
  final List<MemberResponse> members;
  final List<RouteStop> outboundStops;
  final List<RouteStop> returnStops;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ExpansionTile(
        title: Text(title),
        subtitle: Text('${members.length} attending'),
        initiallyExpanded: members.length <= 8,
        children: members
            .map(
              (m) => _ResponseTile(
                eventId: eventId,
                response: m,
                outboundStops: outboundStops,
                returnStops: returnStops,
                leading: const Icon(Icons.person_outline),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _ResponseTile extends ConsumerWidget {
  const _ResponseTile({
    required this.eventId,
    required this.response,
    required this.outboundStops,
    required this.returnStops,
    required this.leading,
  });

  final String eventId;
  final MemberResponse response;
  final List<RouteStop> outboundStops;
  final List<RouteStop> returnStops;
  final Widget leading;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notes = response.generalNotes;
    final subtitleParts = <String>[
      'responding user: ${response.respondingUserId}',
      if (notes != null && notes.isNotEmpty) notes,
    ];
    return ListTile(
      dense: true,
      leading: leading,
      title: Text(response.memberDisplayName),
      subtitle: Text(subtitleParts.join('  •  ')),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (response.isAdminOverride)
            const Tooltip(
              message: 'Admin override',
              child: Icon(Icons.shield, size: 18),
            ),
          IconButton(
            icon: const Icon(Icons.edit_note),
            tooltip: 'Override response',
            onPressed: () => _openOverrideDialog(
              context,
              ref,
              eventId: eventId,
              memberId: response.memberId,
              memberDisplayName: response.memberDisplayName,
              outboundStops: outboundStops,
              returnStops: returnStops,
              initial: response,
            ),
          ),
        ],
      ),
    );
  }
}

class _StillToConfirmTile extends ConsumerWidget {
  const _StillToConfirmTile({
    required this.eventId,
    required this.member,
    required this.outboundStops,
    required this.returnStops,
  });

  final String eventId;
  final Member member;
  final List<RouteStop> outboundStops;
  final List<RouteStop> returnStops;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListTile(
      dense: true,
      leading: const Icon(Icons.help_outline),
      title: Text(member.displayName),
      subtitle: Text(member.primaryPhoneE164),
      trailing: TextButton.icon(
        icon: const Icon(Icons.edit_note),
        label: const Text('Override'),
        onPressed: () => _openOverrideDialog(
          context,
          ref,
          eventId: eventId,
          memberId: member.id,
          memberDisplayName: member.displayName,
          outboundStops: outboundStops,
          returnStops: returnStops,
          initial: null,
        ),
      ),
    );
  }
}

Future<void> _openOverrideDialog(
  BuildContext context,
  WidgetRef ref, {
  required String eventId,
  required String memberId,
  required String memberDisplayName,
  required List<RouteStop> outboundStops,
  required List<RouteStop> returnStops,
  required MemberResponse? initial,
}) async {
  await showDialog<void>(
    context: context,
    builder: (_) => _OverrideDialog(
      eventId: eventId,
      memberId: memberId,
      memberDisplayName: memberDisplayName,
      outboundStops: outboundStops,
      returnStops: returnStops,
      initial: initial,
    ),
  );
}

class _OverrideDialog extends ConsumerStatefulWidget {
  const _OverrideDialog({
    required this.eventId,
    required this.memberId,
    required this.memberDisplayName,
    required this.outboundStops,
    required this.returnStops,
    required this.initial,
  });

  final String eventId;
  final String memberId;
  final String memberDisplayName;
  final List<RouteStop> outboundStops;
  final List<RouteStop> returnStops;
  final MemberResponse? initial;

  @override
  ConsumerState<_OverrideDialog> createState() => _OverrideDialogState();
}

class _OverrideDialogState extends ConsumerState<_OverrideDialog> {
  late MemberResponseStatus _status;
  String? _outboundStopId;
  String? _returnStopId;
  late final TextEditingController _notes;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _status = widget.initial?.status ?? MemberResponseStatus.attending;
    _outboundStopId = widget.initial?.outboundPickupStopId;
    _returnStopId = widget.initial?.returnDropoffStopId;
    _notes = TextEditingController(text: widget.initial?.generalNotes ?? '');
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_status == MemberResponseStatus.attending &&
        widget.outboundStops.isNotEmpty &&
        _outboundStopId == null) {
      setState(() => _error = 'Please choose a pickup stop.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(notificationsServiceProvider).overrideMemberResponse(
            eventId: widget.eventId,
            memberId: widget.memberId,
            status: _status.wire,
            outboundPickupStopId: _status == MemberResponseStatus.attending
                ? _outboundStopId
                : null,
            returnDropoffStopId: _status == MemberResponseStatus.attending
                ? _returnStopId
                : null,
            generalNotes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          );
      if (mounted) Navigator.of(context).pop();
    } catch (err) {
      setState(() => _error = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAttending = _status == MemberResponseStatus.attending;
    return AlertDialog(
      title: Text('Override: ${widget.memberDisplayName}'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Records the response on behalf of this member and marks it as '
              'an admin override in the audit trail.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 16),
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
            if (isAttending && widget.outboundStops.isNotEmpty) ...[
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _outboundStopId,
                decoration:
                    const InputDecoration(labelText: 'Pickup stop'),
                items: widget.outboundStops
                    .map(
                      (s) => DropdownMenuItem(
                        value: s.id,
                        child: Text(s.name),
                      ),
                    )
                    .toList(),
                onChanged: (v) => setState(() => _outboundStopId = v),
              ),
            ],
            if (isAttending && widget.returnStops.isNotEmpty) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                value: _returnStopId,
                decoration: const InputDecoration(
                  labelText: 'Return drop-off (optional)',
                ),
                items: <DropdownMenuItem<String?>>[
                  const DropdownMenuItem<String?>(
                    value: null,
                    child: Text('No preference'),
                  ),
                  ...widget.returnStops.map(
                    (s) => DropdownMenuItem<String?>(
                      value: s.id,
                      child: Text(s.name),
                    ),
                  ),
                ],
                onChanged: (v) => setState(() => _returnStopId = v),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              maxLines: 2,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: Text(_busy ? 'Saving…' : 'Save override'),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.count});
  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color:
                  Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text('$count'),
          ),
        ],
      ),
    );
  }
}

class _GuestRow extends StatelessWidget {
  const _GuestRow({required this.guest, required this.stops});
  final GuestRequest guest;
  final Map<String, String> stops;

  @override
  Widget build(BuildContext context) {
    final stopName = stops[guest.initialPickupStopId];
    return ListTile(
      leading: Icon(_iconFor(guest.status)),
      title: Text(guest.guestName),
      subtitle: Text(
        [
          'requested by: ${guest.requestedByUserId}',
          if (stopName != null) 'pickup: $stopName',
        ].join('  •  '),
      ),
    );
  }

  IconData _iconFor(GuestRequestStatus s) {
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

final _boardEventProvider = StreamProvider.family<BusEvent, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchEvent(id);
});

final _boardStopsProvider =
    StreamProvider.family<List<RouteStop>, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchAllStops(id);
});

final _boardResponsesProvider =
    StreamProvider.family<List<MemberResponse>, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchMemberResponses(id);
});

final _boardGuestsProvider =
    StreamProvider.family<List<GuestRequest>, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchGuestRequests(id);
});

final _boardActiveLinksProvider =
    StreamProvider<List<MemberUserLink>>((ref) {
  return ref.watch(membersRepositoryProvider).watchAllActiveLinks();
});

final _boardMembersByIdProvider =
    StreamProvider<Map<String, Member>>((ref) {
  return ref
      .watch(membersRepositoryProvider)
      .watchAllMembers()
      .map((members) => {for (final m in members) m.id: m});
});
