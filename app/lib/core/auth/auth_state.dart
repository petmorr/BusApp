import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Streams the currently signed-in Firebase user. Null when signed out.
final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

/// Convenience: current Firebase Auth UID, or null if signed out.
final currentUserIdProvider = Provider<String?>((ref) {
  return ref.watch(authStateProvider).asData?.value?.uid;
});

/// Custom-claim-derived role flags. Read with `await user.getIdTokenResult()`
/// in flows that need the freshest value; this provider caches the last-known
/// snapshot for the current user.
final currentUserRolesProvider = FutureProvider<UserRoles>((ref) async {
  final user = ref.watch(authStateProvider).asData?.value;
  if (user == null) return const UserRoles();
  final token = await user.getIdTokenResult();
  return UserRoles(
    isAdmin: token.claims?['admin'] == true,
    isHelper: token.claims?['helper'] == true,
  );
});

class UserRoles {
  const UserRoles({this.isAdmin = false, this.isHelper = false});

  final bool isAdmin;
  final bool isHelper;
}
