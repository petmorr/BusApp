import 'package:flutter/material.dart';

import '../../core/widgets/large_action_button.dart';
import '../../data/models/attendance_response.dart';
import '../../data/models/bus_event.dart';
import '../../data/models/capacity_summary.dart';
import '../../data/models/guest_request.dart';
import '../../data/models/route_stop.dart';
import '../../data/repositories/demo_repository.dart';
import '../guests/guest_request_screen.dart';
import '../route_stops/route_stops_screen.dart';

class EventDetailScreen extends StatefulWidget {
  const EventDetailScreen({
    required this.event,
    required this.repository,
    super.key,
  });

  final BusEvent event;
  final DemoRepository repository;

  @override
  State<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends State<EventDetailScreen> {
  final Map<String, AttendanceStatus?> _statuses = <String, AttendanceStatus?>{};
  final Map<String, String?> _pickupStops = <String, String?>{};
  final Map<String, String?> _returnStops = <String, String?>{};

  @override
  void initState() {
    super.initState();
    for (final response in widget.repository.responsesForEvent(widget.event.id)) {
      _statuses[response.memberId] = response.status;
      _pickupStops[response.memberId] = response.outboundPickupStopId;
      _returnStops[response.memberId] = response.returnDropoffStopId;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final event = widget.event;
    final members = widget.repository.linkedMembersForCurrentUser();
    final stops = widget.repository.stopsForEvent(event.id);
    final outboundStops = stops.where((stop) => stop.type == RouteStopType.outboundPickup).toList();
    final returnStops = stops.where((stop) => stop.type == RouteStopType.returnDropoff).toList();
    final summary = widget.repository.capacitySummaryFor(event.id);
    final guests = widget.repository.guestRequestsForEvent(event.id);

    return Scaffold(
      appBar: AppBar(title: Text(event.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text(event.destinationName, style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(event.generalNotes),
          const SizedBox(height: 16),
          _CapacityCard(event: event, summary: summary),
          const SizedBox(height: 16),
          LargeActionButton(
            label: 'View route stops and maps',
            icon: Icons.map_outlined,
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => RouteStopsScreen(
                    event: event,
                    stops: stops,
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 16),
          Text('Your represented members', style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          for (final member in members)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(member.displayName, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 12),
                    SegmentedButton<AttendanceStatus>(
                      segments: const <ButtonSegment<AttendanceStatus>>[
                        ButtonSegment<AttendanceStatus>(
                          value: AttendanceStatus.attending,
                          label: Text('Attending'),
                          icon: Icon(Icons.check_circle_outline),
                        ),
                        ButtonSegment<AttendanceStatus>(
                          value: AttendanceStatus.notAttending,
                          label: Text('Not going'),
                          icon: Icon(Icons.cancel_outlined),
                        ),
                      ],
                      selected: <AttendanceStatus>{
                        if (_statuses[member.id] != null) _statuses[member.id]!,
                      },
                      emptySelectionAllowed: true,
                      onSelectionChanged: (Set<AttendanceStatus> selected) {
                        setState(() {
                          _statuses[member.id] = selected.isEmpty ? null : selected.first;
                        });
                      },
                    ),
                    if (_statuses[member.id] == AttendanceStatus.attending) ...<Widget>[
                      const SizedBox(height: 12),
                      _StopDropdown(
                        label: 'Outbound pickup stop',
                        value: _pickupStops[member.id],
                        stops: outboundStops,
                        onChanged: (value) => setState(() => _pickupStops[member.id] = value),
                      ),
                      const SizedBox(height: 12),
                      if (returnStops.isNotEmpty)
                        _StopDropdown(
                          label: 'Return drop-off stop',
                          value: _returnStops[member.id],
                          stops: returnStops,
                          onChanged: (value) => setState(() => _returnStops[member.id] = value),
                        ),
                    ],
                  ],
                ),
              ),
            ),
          const SizedBox(height: 8),
          LargeActionButton(
            label: 'Save attendance',
            icon: Icons.save_outlined,
            onPressed: () {
              for (final member in members) {
                final status = _statuses[member.id];
                if (status == null) {
                  continue;
                }
                widget.repository.upsertMemberResponse(
                  AttendanceResponse(
                    eventId: event.id,
                    eventTitle: event.title,
                    eventDate: event.eventDate,
                    memberId: member.id,
                    memberDisplayName: member.displayName,
                    respondingUserId: widget.repository.currentUser.id,
                    status: status,
                    outboundPickupStopId:
                        status == AttendanceStatus.attending ? _pickupStops[member.id] : null,
                    returnDropoffStopId:
                        status == AttendanceStatus.attending ? _returnStops[member.id] : null,
                    updatedAt: DateTime.now(),
                  ),
                );
              }
              setState(() {});
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Attendance saved for this event.')),
              );
            },
          ),
          const SizedBox(height: 24),
          Text('Guest requests', style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          if (guests.isEmpty)
            const Text('No guest seats requested yet.')
          else
            for (final guest in guests) _GuestTile(guest: guest),
          const SizedBox(height: 8),
          LargeActionButton(
            label: 'Request a guest seat',
            icon: Icons.person_add_alt_1_outlined,
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => GuestRequestScreen(
                    event: event,
                    repository: widget.repository,
                  ),
                ),
              );
              setState(() {});
            },
          ),
        ],
      ),
    );
  }
}

class _CapacityCard extends StatelessWidget {
  const _CapacityCard({required this.event, required this.summary});

  final BusEvent event;
  final CapacitySummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      color: switch (summary.status) {
        CapacityStatus.under => theme.colorScheme.surfaceContainerHighest,
        CapacityStatus.near => Colors.amber.shade100,
        CapacityStatus.at => Colors.orange.shade100,
        CapacityStatus.over => Colors.red.shade100,
      },
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Capacity', style: theme.textTheme.titleLarge),
            Text('Confirmed seats: ${summary.approvedTotal} of ${event.capacityMax}'),
            Text('Pending guest requests: ${summary.pendingGuestSeats}'),
            if (summary.pendingGuestRisk)
              const Text('Pending guests could exceed capacity if approved.'),
          ],
        ),
      ),
    );
  }
}

class _StopDropdown extends StatelessWidget {
  const _StopDropdown({
    required this.label,
    required this.value,
    required this.stops,
    required this.onChanged,
  });

  final String label;
  final String? value;
  final List<RouteStop> stops;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      value: value,
      decoration: InputDecoration(labelText: label),
      items: stops
          .map(
            (stop) => DropdownMenuItem<String>(
              value: stop.id,
              child: Text(stop.name),
            ),
          )
          .toList(),
      onChanged: onChanged,
    );
  }
}

class _GuestTile extends StatelessWidget {
  const _GuestTile({required this.guest});

  final GuestRequest guest;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: const Icon(Icons.airline_seat_recline_extra_outlined),
      title: Text(guest.guestName),
      subtitle: Text('Status: ${guest.status.label}'),
    );
  }
}
