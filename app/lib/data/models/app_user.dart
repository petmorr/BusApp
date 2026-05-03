import 'package:cloud_firestore/cloud_firestore.dart';

/// Mirrors `users/{userId}`. Keep this type small — the rules only let users
/// read their own profile or admins read any profile, so we don't lean on it
/// for cross-user data.
class AppUser {
  const AppUser({
    required this.id,
    required this.phoneE164,
    required this.displayName,
    required this.roles,
    required this.isActive,
  });

  factory AppUser.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? const <String, dynamic>{};
    final rawRoles = data['roles'];
    final roles = rawRoles is List
        ? rawRoles.whereType<String>().toList(growable: false)
        : const <String>['user'];
    return AppUser(
      id: doc.id,
      phoneE164: data['phoneE164'] as String? ?? '',
      displayName: data['displayName'] as String? ?? '',
      roles: roles,
      isActive: data['isActive'] as bool? ?? true,
    );
  }

  final String id;
  final String phoneE164;
  final String displayName;
  final List<String> roles;
  final bool isActive;

  bool get isAdmin => roles.contains('admin');
  bool get isHelper => roles.contains('helper');
}
