import 'dart:io' show Platform;

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/auth/auth_state.dart';
import '../../data/models/event.dart';
import '../../data/repositories/events_repository.dart';
import '../../data/repositories/notifications_service.dart';
import '../../data/repositories/users_repository.dart';

class EventsListScreen extends ConsumerStatefulWidget {
  const EventsListScreen({super.key});

  @override
  ConsumerState<EventsListScreen> createState() => _EventsListScreenState();
}

class _EventsListScreenState extends ConsumerState<EventsListScreen> {
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    // Fire and forget: ensure user profile + register FCM token after
    // sign-in. Both calls are idempotent.
    Future.microtask(_postSignInBootstrap);
  }

  Future<void> _postSignInBootstrap() async {
    try {
      await ref.read(usersRepositoryProvider).ensureProfileForCurrentUser();
    } catch (_) {
      // Profile creation failures are non-fatal — the user can still use
      // the app once an admin sets them up.
    }
    if (!kIsWeb) {
      try {
        final platform = Platform.isIOS ? 'ios' : 'android';
        await ref
            .read(notificationsServiceProvider)
            .registerCurrentDevice(platform: platform);
      } catch (_) {
        // Notifications failure does not block the app.
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final events = ref.watch(_upcomingEventsProvider);
    final roles = ref.watch(currentUserRolesProvider).asData?.value;
    final user = ref.watch(_currentUserDocProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Upcoming events'),
        actions: [
          if (roles?.isAdmin == true)
            IconButton(
              icon: const Icon(Icons.admin_panel_settings_outlined),
              tooltip: 'Admin',
              onPressed: () => context.go('/admin'),
            ),
          if (roles?.isHelper == true)
            IconButton(
              icon: const Icon(Icons.handyman_outlined),
              tooltip: 'Helper',
              onPressed: () => context.go('/helper'),
            ),
          IconButton(
            icon: const Icon(Icons.account_circle_outlined),
            tooltip: 'Profile',
            onPressed: () => context.go('/signup'),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () => FirebaseAuth.instance.signOut(),
          ),
        ],
      ),
      body: events.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (list) {
          final widgets = <Widget>[];
          // Onboarding hint: if profile has no displayName yet, nudge the
          // user to complete their profile so admins can review their
          // member-link request.
          final profile = user.asData?.value;
          if (profile != null && profile.displayName.trim().isEmpty) {
            widgets.add(_OnboardingBanner(onTap: () => context.go('/signup')));
          }
          if (list.isEmpty) {
            widgets.add(
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 64, horizontal: 16),
                child: Center(
                  child: Text(
                    'No upcoming events.',
                    style: TextStyle(fontSize: 18),
                  ),
                ),
              ),
            );
          } else {
            for (var i = 0; i < list.length; i++) {
              widgets.add(_EventCard(event: list[i]));
              if (i != list.length - 1) widgets.add(const SizedBox(height: 12));
            }
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: widgets,
          );
        },
      ),
    );
  }
}

final _upcomingEventsProvider = StreamProvider<List<BusEvent>>((ref) {
  return ref.watch(eventsRepositoryProvider).watchUpcomingEvents();
});

final _currentUserDocProvider = StreamProvider((ref) {
  return ref.watch(usersRepositoryProvider).watchCurrentUser();
});

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event});

  final BusEvent event;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('EEE d MMM, HH:mm');
    return Semantics(
      button: true,
      label: '${event.title}, ${dateFmt.format(event.eventDate.toLocal())}',
      child: Card(
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 12,
          ),
          title: Text(
            event.title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(dateFmt.format(event.eventDate.toLocal())),
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.go('/events/${event.id}'),
        ),
      ),
    );
  }
}

class _OnboardingBanner extends StatelessWidget {
  const _OnboardingBanner({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Theme.of(context).colorScheme.secondaryContainer,
      child: ListTile(
        leading: const Icon(Icons.info_outline),
        title: const Text('Finish setting up your profile'),
        subtitle: const Text(
          'Add your name and link to a supporter so you can confirm seats.',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
