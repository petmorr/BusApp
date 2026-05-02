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
          onPressed: () => context.go('/'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          // TODO(milestone-3): Members + member-user link approvals.
          ListTile(
            leading: Icon(Icons.people_outline),
            title: Text('Members'),
            subtitle: Text('Coming soon'),
          ),
          ListTile(
            leading: Icon(Icons.person_add_outlined),
            title: Text('Pending member-user links'),
            subtitle: Text('Coming soon'),
          ),
          // TODO(milestone-4): Event create/edit + route stops.
          ListTile(
            leading: Icon(Icons.event_outlined),
            title: Text('Events'),
            subtitle: Text('Coming soon'),
          ),
          // TODO(milestone-9): Attendance board + history.
          ListTile(
            leading: Icon(Icons.dashboard_outlined),
            title: Text('Attendance board'),
            subtitle: Text('Coming soon'),
          ),
          ListTile(
            leading: Icon(Icons.history),
            title: Text('Attendance history'),
            subtitle: Text('Coming soon'),
          ),
        ],
      ),
    );
  }
}
