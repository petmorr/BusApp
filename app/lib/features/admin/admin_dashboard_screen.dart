import 'package:flutter/material.dart';

import '../../core/widgets/large_action_button.dart';
import '../../data/repositories/demo_repository.dart';

class AdminDashboardScreen extends StatelessWidget {
  const AdminDashboardScreen({super.key, required this.repository});

  final DemoRepository repository;

  @override
  Widget build(BuildContext context) {
    final events = repository.events;
    final firstEvent = events.first;

    return Scaffold(
      appBar: AppBar(title: const Text('Admin dashboard')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Manage members, events, guests, reminders, helpers, and capacity.',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 16),
          LargeActionButton(
            label: 'Members and representation links',
            icon: Icons.group,
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => MemberManagementScreen(repository: repository),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          LargeActionButton(
            label: 'Attendance board',
            icon: Icons.fact_check,
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => AttendanceBoardScreen(
                    repository: repository,
                    event: firstEvent,
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          LargeActionButton(
            label: 'Send attendance reminder',
            icon: Icons.notifications_active,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Firebase function integration point: sendAttendanceReminder',
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          LargeActionButton(
            label: 'Assign event helpers',
            icon: Icons.admin_panel_settings,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Firebase function integration point: assignEventHelper',
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class MemberManagementScreen extends StatelessWidget {
  const MemberManagementScreen({super.key, required this.repository});

  final DemoRepository repository;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Members')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: repository.members.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final member = repository.members[index];
          return Card(
            child: ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(member.displayName),
              subtitle: Text([
                if (member.primaryPhoneE164 != null) member.primaryPhoneE164!,
                'Status: ${member.status.name}',
                if (member.relationshipToUser != null) 'Link: ${member.relationshipToUser}',
              ].join('\n')),
            ),
          );
        },
      ),
    );
  }
}

class AttendanceBoardScreen extends StatelessWidget {
  const AttendanceBoardScreen({
    super.key,
    required this.repository,
    required this.event,
  });

  final DemoRepository repository;
  final BusEvent event;

  @override
  Widget build(BuildContext context) {
    final responses = repository.responsesForEvent(event.id);
    final attendingIds = responses
        .where((response) => response.status == AttendanceStatus.attending)
        .map((response) => response.memberId)
        .toSet();
    final notAttendingIds = responses
        .where((response) => response.status == AttendanceStatus.notAttending)
        .map((response) => response.memberId)
        .toSet();
    final guests = repository.guestRequestsForEvent(event.id);
    final summary = repository.capacitySummaryFor(event.id);

    return Scaffold(
      appBar: AppBar(title: Text('Attendance: ${event.title}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _BoardSection(
            title: 'Attending',
            children: [
              for (final member in repository.members.where((member) => attendingIds.contains(member.id)))
                ListTile(title: Text(member.displayName)),
            ],
          ),
          _BoardSection(
            title: 'Not attending',
            children: [
              for (final member in repository.members.where((member) => notAttendingIds.contains(member.id)))
                ListTile(title: Text(member.displayName)),
            ],
          ),
          _BoardSection(
            title: 'Still to confirm',
            children: [
              for (final member in repository.membersStillToConfirm(event.id))
                ListTile(title: Text(member.displayName)),
            ],
          ),
          _BoardSection(
            title: 'Guest requests',
            children: [
              for (final guest in guests)
                ListTile(
                  title: Text(guest.guestName),
                  subtitle: Text(guest.status.label),
                ),
            ],
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                'Capacity: ${summary.approvedTotal}/${event.capacityMax} approved, '
                '${summary.pendingGuestSeats} pending. Status: ${summary.status.label}.',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BoardSection extends StatelessWidget {
  const _BoardSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            if (children.isEmpty) const Text('None yet.') else ...children,
          ],
        ),
      ),
    );
  }
}
