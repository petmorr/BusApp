import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/admin/admin_attendance_board_screen.dart';
import '../../features/admin/admin_attendance_history_screen.dart';
import '../../features/admin/admin_dashboard_screen.dart';
import '../../features/admin/admin_event_edit_screen.dart';
import '../../features/admin/admin_events_screen.dart';
import '../../features/admin/admin_guest_queue_screen.dart';
import '../../features/admin/admin_members_screen.dart';
import '../../features/admin/admin_pending_links_screen.dart';
import '../../features/attendance/attendance_form_screen.dart';
import '../../features/events/event_detail_screen.dart';
import '../../features/events/events_list_screen.dart';
import '../../features/guests/guest_request_screen.dart';
import '../../features/helper/helper_assigned_events_screen.dart';
import '../../features/helper/helper_dashboard_screen.dart';
import '../../features/helper/helper_event_screen.dart';
import '../../features/login/phone_login_screen.dart';
import '../../features/signup/profile_setup_screen.dart';
import '../auth/auth_state.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final auth = ref.read(authStateProvider);
      final roles = ref.read(currentUserRolesProvider).asData?.value;
      final isSignedIn = auth.value != null;
      final goingToLogin = state.matchedLocation == '/login';
      if (!isSignedIn && !goingToLogin) return '/login';
      if (isSignedIn && goingToLogin) return '/';

      // Role-aware client-side guards. The Firestore rules are still the
      // source of truth, but redirecting unauthorised users *before* they
      // see admin/helper surfaces avoids confusing "permission denied"
      // errors for the common case of a misclick.
      if (state.matchedLocation.startsWith('/admin') &&
          !(roles?.isAdmin ?? false)) {
        return '/';
      }
      if (state.matchedLocation.startsWith('/helper') &&
          !(roles?.isHelper ?? false) &&
          !(roles?.isAdmin ?? false)) {
        return '/';
      }
      return null;
    },
    refreshListenable: GoRouterRefreshNotifier(ref),
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, __) => const PhoneLoginScreen(),
      ),
      GoRoute(
        path: '/signup',
        builder: (_, __) => const ProfileSetupScreen(),
      ),
      GoRoute(
        path: '/',
        builder: (_, __) => const EventsListScreen(),
        routes: [
          GoRoute(
            path: 'events/:eventId',
            builder: (context, state) =>
                EventDetailScreen(eventId: state.pathParameters['eventId']!),
            routes: [
              GoRoute(
                path: 'attendance',
                builder: (context, state) => AttendanceFormScreen(
                  eventId: state.pathParameters['eventId']!,
                ),
              ),
              GoRoute(
                path: 'guest',
                builder: (context, state) => GuestRequestScreen(
                  eventId: state.pathParameters['eventId']!,
                ),
              ),
            ],
          ),
          GoRoute(
            path: 'admin',
            builder: (_, __) => const AdminDashboardScreen(),
            routes: [
              GoRoute(
                path: 'members',
                builder: (_, __) => const AdminMembersScreen(),
              ),
              GoRoute(
                path: 'pending-links',
                builder: (_, __) => const AdminPendingLinksScreen(),
              ),
              GoRoute(
                path: 'guest-requests',
                builder: (_, __) => const AdminGuestQueueScreen(),
              ),
              GoRoute(
                path: 'attendance-history',
                builder: (_, __) => const AdminAttendanceHistoryScreen(),
              ),
              GoRoute(
                path: 'events',
                builder: (_, __) => const AdminEventsScreen(),
                routes: [
                  GoRoute(
                    path: 'new',
                    builder: (_, __) => const AdminEventEditScreen(),
                  ),
                  GoRoute(
                    path: ':eventId',
                    builder: (context, state) => AdminEventEditScreen(
                      eventId: state.pathParameters['eventId']!,
                    ),
                    routes: [
                      GoRoute(
                        path: 'board',
                        builder: (context, state) =>
                            AdminAttendanceBoardScreen(
                          eventId: state.pathParameters['eventId']!,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: 'helper',
            builder: (_, __) => const HelperDashboardScreen(),
            routes: [
              GoRoute(
                path: 'events',
                builder: (_, __) => const HelperAssignedEventsScreen(),
                routes: [
                  GoRoute(
                    path: ':eventId',
                    builder: (context, state) => HelperEventScreen(
                      eventId: state.pathParameters['eventId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

/// GoRouter rebuilds when this listener fires. We notify on any change to
/// auth state or to the (claim-derived) role snapshot, so role downgrades
/// take effect on the next navigation event.
class GoRouterRefreshNotifier extends ChangeNotifier {
  GoRouterRefreshNotifier(Ref ref) {
    ref.listen(authStateProvider, (_, __) => notifyListeners());
    ref.listen(currentUserRolesProvider, (_, __) => notifyListeners());
  }
}
