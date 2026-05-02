import 'package:flutter/material.dart';

import '../../core/widgets/large_action_button.dart';
import '../../data/models/attendance_response.dart';
import '../../data/models/bus_event.dart';
import '../../data/models/member.dart';
import '../../data/models/route_stop.dart';

class AttendanceFormScreen extends StatefulWidget {
  const AttendanceFormScreen({
    required this.event,
    required this.members,
    required this.stops,
    super.key,
  });

  final BusEvent event;
  final List<Member> members;
  final List<RouteStop> stops;

  @override
  State<AttendanceFormScreen> createState() => _AttendanceFormScreenState();
}

class _AttendanceFormScreenState extends State<AttendanceFormScreen> {
  late final Map<String, MemberAttendanceDraft> _drafts;

  List<RouteStop> get _pickupStops => widget.stops
      .where((stop) => stop.isActive && stop.type == RouteStopType.outboundPickup)
      .toList();

  List<RouteStop> get _returnStops => widget.stops
      .where((stop) => stop.isActive && stop.type == RouteStopType.returnDropoff)
      .toList();

  @override
  void initState() {
    super.initState();
    _drafts = {
      for (final member in widget.members)
        member.id: MemberAttendanceDraft(memberId: member.id),
    };
  }

  @override
  Widget build(BuildContext context) {
    final isClosed = widget.event.isPastCutoff;

    return Scaffold(
      appBar: AppBar(title: const Text('Confirm seats')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (isClosed)
            Card(
              color: Theme.of(context).colorScheme.errorContainer,
              child: const Padding(
                padding: EdgeInsets.all(16),
                child: Text('This event is past the cutoff. Contact an admin for changes.'),
              ),
            ),
          for (final member in widget.members) _MemberResponseCard(
            member: member,
            draft: _drafts[member.id]!,
            pickupStops: _pickupStops,
            returnStops: _returnStops,
            enabled: !isClosed,
            onChanged: (draft) => setState(() => _drafts[member.id] = draft),
          ),
          const SizedBox(height: 16),
          LargeActionButton(
            label: 'Save attendance',
            icon: Icons.check_circle_outline,
            onPressed: isClosed
                ? null
                : () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Attendance saved in demo mode.')),
                    );
                    Navigator.of(context).pop();
                  },
          ),
        ],
      ),
    );
  }
}

class _MemberResponseCard extends StatelessWidget {
  const _MemberResponseCard({
    required this.member,
    required this.draft,
    required this.pickupStops,
    required this.returnStops,
    required this.enabled,
    required this.onChanged,
  });

  final Member member;
  final MemberAttendanceDraft draft;
  final List<RouteStop> pickupStops;
  final List<RouteStop> returnStops;
  final bool enabled;
  final ValueChanged<MemberAttendanceDraft> onChanged;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(member.displayName, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            SegmentedButton<AttendanceStatus>(
              segments: const [
                ButtonSegment(value: AttendanceStatus.attending, label: Text('Going')),
                ButtonSegment(value: AttendanceStatus.notAttending, label: Text('Not going')),
              ],
              selected: <AttendanceStatus>{
                if (draft.status != null) draft.status!,
              },
              emptySelectionAllowed: true,
              onSelectionChanged: enabled
                  ? (values) => onChanged(draft.copyWith(status: values.firstOrNull))
                  : null,
            ),
            if (draft.status == AttendanceStatus.attending) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: draft.outboundPickupStopId,
                decoration: const InputDecoration(labelText: 'Pickup stop'),
                items: [
                  for (final stop in pickupStops)
                    DropdownMenuItem(value: stop.id, child: Text(stop.name)),
                ],
                onChanged: enabled
                    ? (value) => onChanged(draft.copyWith(outboundPickupStopId: value))
                    : null,
              ),
              if (returnStops.isNotEmpty) ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: draft.returnDropoffStopId,
                  decoration: const InputDecoration(labelText: 'Return drop-off'),
                  items: [
                    for (final stop in returnStops)
                      DropdownMenuItem(value: stop.id, child: Text(stop.name)),
                  ],
                  onChanged: enabled
                      ? (value) => onChanged(draft.copyWith(returnDropoffStopId: value))
                      : null,
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class MemberAttendanceDraft {
  const MemberAttendanceDraft({
    required this.memberId,
    this.status,
    this.outboundPickupStopId,
    this.returnDropoffStopId,
  });

  final String memberId;
  final AttendanceStatus? status;
  final String? outboundPickupStopId;
  final String? returnDropoffStopId;

  MemberAttendanceDraft copyWith({
    AttendanceStatus? status,
    String? outboundPickupStopId,
    String? returnDropoffStopId,
  }) {
    return MemberAttendanceDraft(
      memberId: memberId,
      status: status,
      outboundPickupStopId: outboundPickupStopId,
      returnDropoffStopId: returnDropoffStopId,
    );
  }
}
