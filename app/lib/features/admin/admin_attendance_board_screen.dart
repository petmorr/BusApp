import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../data/models/event.dart';
import '../../data/models/guest_request.dart';
import '../../data/models/member_response.dart';
import '../../data/models/route_stop.dart';
import '../../data/repositories/events_repository.dart';

/// Admin live attendance board for a single event:
///
/// - Capacity totals + status banner.
/// - All member responses grouped by pickup stop.
/// - All guest requests grouped by status.
class AdminAttendanceBoardScreen extends ConsumerWidget {
  const AdminAttendanceBoardScreen({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eventAsync = ref.watch(_boardEventProvider(eventId));
    final stopsAsync = ref.watch(_boardStopsProvider(eventId));
    final responsesAsync = ref.watch(_boardResponsesProvider(eventId));
    final guestsAsync = ref.watch(_boardGuestsProvider(eventId));

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
              data: (guests) =>
                  _buildBody(context, event, stops, responses, guests),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    BusEvent event,
    List<RouteStop> stops,
    List<MemberResponse> responses,
    List<GuestRequest> guests,
  ) {
    final attending =
        responses.where((r) => r.status == MemberResponseStatus.attending).toList();
    final notAttending =
        responses.where((r) => r.status == MemberResponseStatus.notAttending).toList();
    final byStop = <String, List<MemberResponse>>{};
    for (final r in attending) {
      final key = r.outboundPickupStopId ?? '_unassigned';
      byStop.putIfAbsent(key, () => []).add(r);
    }
    final stopName = {for (final s in stops) s.id: s.name};
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
              title: stopName[entry.key] ?? 'No pickup stop selected',
              members: entry.value,
            ),
          ),
        const SizedBox(height: 16),
        _SectionHeader(
          title: 'Not attending',
          count: notAttending.length,
        ),
        ...notAttending.map(
          (r) => ListTile(
            dense: true,
            leading: const Icon(Icons.do_not_disturb),
            title: Text(_memberLabel(r)),
            subtitle: r.generalNotes == null || r.generalNotes!.isEmpty
                ? null
                : Text(r.generalNotes!),
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

  String _memberLabel(MemberResponse r) {
    return r.memberId;
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
  const _StopGroup({required this.title, required this.members});
  final String title;
  final List<MemberResponse> members;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ExpansionTile(
        title: Text(title),
        subtitle: Text('${members.length} attending'),
        initiallyExpanded: members.length <= 8,
        children: members
            .map(
              (m) => ListTile(
                dense: true,
                title: Text(m.memberId),
                subtitle: Text('responding user: ${m.respondingUserId}'),
                leading: const Icon(Icons.person_outline),
                trailing: m.isAdminOverride
                    ? const Icon(Icons.shield, size: 18)
                    : null,
              ),
            )
            .toList(),
      ),
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
