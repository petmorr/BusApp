import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/app_user.dart';

final usersRepositoryProvider = Provider<UsersRepository>((ref) {
  return UsersRepository(FirebaseFirestore.instance, FirebaseAuth.instance);
});

/// CRUD for `users/{uid}` profiles.
///
/// The Firestore rules allow a signed-in user to create their own profile,
/// and to update only their own display name. Role / active flags are
/// admin-only and flow through the `setUserRole` callable.
class UsersRepository {
  UsersRepository(this._db, this._auth);

  final FirebaseFirestore _db;
  final FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> get _users =>
      _db.collection('users');

  /// The currently signed-in user's Firebase Auth uid, or null.
  String? get currentUid => _auth.currentUser?.uid;

  /// Creates the `users/{uid}` document if it does not exist yet. Idempotent
  /// — safe to call on every successful sign-in. Does not overwrite an
  /// existing profile (the Firestore rules would reject a roles override
  /// anyway, but we don't want to clobber a `displayName` either).
  Future<void> ensureProfileForCurrentUser() async {
    final user = _auth.currentUser;
    if (user == null) return;
    final ref = _users.doc(user.uid);
    final snap = await ref.get();
    if (snap.exists) {
      await ref.set({
        'lastLoginAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true),);
      return;
    }
    await ref.set({
      'phoneE164': user.phoneNumber ?? '',
      'displayName': user.displayName ?? '',
      'roles': ['user'],
      'isActive': true,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
      'lastLoginAt': FieldValue.serverTimestamp(),
    });
  }

  Stream<AppUser?> watchCurrentUser() {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return const Stream.empty();
    return _users
        .doc(uid)
        .snapshots()
        .map((s) => s.exists ? AppUser.fromDoc(s) : null);
  }

  Future<void> updateDisplayName(String displayName) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return;
    await _users.doc(uid).set({
      'displayName': displayName,
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true),);
  }

  /// Admin-only: list all users with role badges, ordered by display name.
  Stream<List<AppUser>> watchAllUsers() {
    return _users
        .orderBy('displayName')
        .snapshots()
        .map((s) => s.docs.map(AppUser.fromDoc).toList());
  }

  Stream<AppUser?> watchUser(String userId) {
    return _users
        .doc(userId)
        .snapshots()
        .map((s) => s.exists ? AppUser.fromDoc(s) : null);
  }
}
