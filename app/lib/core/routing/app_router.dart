import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/admin/admin_dashboard_screen.dart';
import '../../features/events/event_detail_screen.dart';
import '../../features/events/events_list_screen.dart';
import '../../features/helper/helper_dashboard_screen.dart';
import '../../features/login/phone_login_screen.dart';
import '../auth/auth_state.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authStateProvider);
  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isSignedIn = auth.value != null;
      final goingToLogin = state.matchedLocation == '/login';
      if (!isSignedIn && !goingToLogin) return '/login';
      if (isSignedIn && goingToLogin) return '/';
      return null;
    },
    refreshListenable: GoRouterRefreshNotifier(ref),
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, __) => const PhoneLoginScreen(),
      ),
      GoRoute(
        path: '/',
        builder: (_, __) => const EventsListScreen(),
        routes: [
          GoRoute(
            path: 'events/:eventId',
            builder: (context, state) =>
                EventDetailScreen(eventId: state.pathParameters['eventId']!),
          ),
          GoRoute(
            path: 'admin',
            builder: (_, __) => const AdminDashboardScreen(),
          ),
          GoRoute(
            path: 'helper',
            builder: (_, __) => const HelperDashboardScreen(),
          ),
        ],
      ),
    ],
  );
});

class GoRouterRefreshNotifier extends ChangeNotifier {
  GoRouterRefreshNotifier(Ref ref) {
    ref.listen(authStateProvider, (_, __) => notifyListeners());
  }
}
