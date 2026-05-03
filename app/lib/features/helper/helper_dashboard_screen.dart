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
        body: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Helper access required.',
              style: TextStyle(fontSize: 18),
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Helper'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to events',
          onPressed: () => context.go('/'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(8),
        children: [
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: ListTile(
              leading: const Icon(Icons.event_available_outlined),
              title: const Text(
                'Assigned events',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
              ),
              subtitle: const Text(
                'Events admins have assigned you to as a helper',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.go('/helper/events'),
            ),
          ),
          const Card(
            margin: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: ListTile(
              leading: Icon(Icons.info_outline),
              title: Text(
                'How helpers work',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
              ),
              subtitle: Text(
                'Open an assigned event to set the parked-bus pin or send '
                'an operational update.',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
