import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final roles = ref.watch(currentUserRolesProvider).asData?.value;

    if (roles?.isAdmin != true) {
      return Scaffold(
        appBar: AppBar(title: const Text('Admin')),
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Admin access required.',
              style: TextStyle(fontSize: 18),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to events',
          onPressed: () => context.go('/'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(8),
        children: [
          _AdminTile(
            icon: Icons.people_outline,
            title: 'Members',
            subtitle: 'Add, edit, search supporters',
            onTap: () => context.go('/admin/members'),
          ),
          _AdminTile(
            icon: Icons.person_add_outlined,
            title: 'Pending member-user links',
            subtitle: 'Approve or reject signup requests',
            onTap: () => context.go('/admin/pending-links'),
          ),
          _AdminTile(
            icon: Icons.event_outlined,
            title: 'Events',
            subtitle: 'Create, edit, set capacity & stops',
            onTap: () => context.go('/admin/events'),
          ),
          _AdminTile(
            icon: Icons.group_add_outlined,
            title: 'Pending guest requests',
            subtitle: 'Approve or reject named guest seats',
            onTap: () => context.go('/admin/guest-requests'),
          ),
          _AdminTile(
            icon: Icons.dashboard_outlined,
            title: 'Attendance board',
            subtitle: 'Pick an event to see live capacity',
            onTap: () => context.go('/admin/events'),
          ),
          _AdminTile(
            icon: Icons.history,
            title: 'Attendance history',
            subtitle: 'Cross-event responses (last 500)',
            onTap: () => context.go('/admin/attendance-history'),
          ),
        ],
      ),
    );
  }
}

class _AdminTile extends StatelessWidget {
  const _AdminTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: ListTile(
        leading: Icon(icon),
        title: Text(
          title,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
