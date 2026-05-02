import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';

class HelperDashboardScreen extends ConsumerWidget {
  const HelperDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final roles = ref.watch(currentUserRolesProvider).asData?.value;
    if (roles?.isHelper != true && roles?.isAdmin != true) {
      return Scaffold(
        appBar: AppBar(title: const Text('Helper')),
        body: const Center(child: Text('Helper access required.')),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Helper'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          // TODO(milestone-8): assigned events + parked-bus pin update.
          ListTile(
            leading: Icon(Icons.event_outlined),
            title: Text('Assigned events'),
            subtitle: Text('Coming soon'),
          ),
          ListTile(
            leading: Icon(Icons.directions_bus_outlined),
            title: Text('Set parked-bus location'),
            subtitle: Text('Coming soon'),
          ),
          ListTile(
            leading: Icon(Icons.notifications_active_outlined),
            title: Text('Send operational update'),
            subtitle: Text('Coming soon'),
          ),
        ],
      ),
    );
  }
}
