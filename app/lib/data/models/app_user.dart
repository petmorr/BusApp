class AppUser {
  const AppUser({
    required this.id,
    required this.phoneE164,
    required this.displayName,
    required this.roles,
    required this.isActive,
  });

  final String id;
  final String phoneE164;
  final String displayName;
  final Set<UserRole> roles;
  final bool isActive;

  bool get isAdmin => roles.contains(UserRole.admin);
  bool get isHelper => roles.contains(UserRole.helper);
}

enum UserRole {
  user,
  helper,
  admin,
}
