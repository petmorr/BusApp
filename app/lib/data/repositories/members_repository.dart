import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/member.dart';
import '../models/member_user_link.dart';

final membersRepositoryProvider = Provider<MembersRepository>((ref) {
  return MembersRepository(FirebaseFirestore.instance);
});

class MembersRepository {
  MembersRepository(this._db);

  final FirebaseFirestore _db;

  /// Active members linked to the given user account.
  Stream<List<Member>> watchLinkedMembers(String userId) async* {
    yield* _db
        .collection('memberUserLinks')
        .where('userId', isEqualTo: userId)
        .where('status', isEqualTo: LinkStatus.active.name)
        .snapshots()
        .asyncMap((linksSnap) async {
      final memberIds = linksSnap.docs
          .map((d) => d.data()['memberId'] as String? ?? '')
          .where((id) => id.isNotEmpty)
          .toList();
      if (memberIds.isEmpty) return <Member>[];
      // Firestore "whereIn" supports up to 30 values; the supporters group is
      // expected to be ~60 members, so pagination is not required for the
      // typical case of one user representing a small handful of members.
      final docs = await Future.wait(
        memberIds.map((id) => _db.collection('members').doc(id).get()),
      );
      return docs
          .where((d) => d.exists)
          .map(Member.fromDoc)
          .toList();
    });
  }

  Stream<List<MemberUserLink>> watchPendingLinks() {
    return _db
        .collection('memberUserLinks')
        .where('status', isEqualTo: LinkStatus.pending.name)
        .orderBy('createdAt')
        .snapshots()
        .map((s) => s.docs.map(MemberUserLink.fromDoc).toList());
  }

  /// Admin-only: list all members ordered by display name.
  Stream<List<Member>> watchAllMembers() {
    return _db
        .collection('members')
        .orderBy('displayName')
        .snapshots()
        .map((s) => s.docs.map(Member.fromDoc).toList());
  }

  Stream<Member?> watchMember(String memberId) {
    return _db
        .collection('members')
        .doc(memberId)
        .snapshots()
        .map((s) => s.exists ? Member.fromDoc(s) : null);
  }

  /// Admin-only: create a new member.
  Future<DocumentReference<Map<String, dynamic>>> createMember({
    required String firstName,
    required String lastName,
    required String displayName,
    required String primaryPhoneE164,
    String? memberNumber,
    String? generalNotes,
  }) async {
    return _db.collection('members').add({
      'firstName': firstName,
      'lastName': lastName,
      'displayName': displayName,
      'primaryPhoneE164': primaryPhoneE164,
      'memberNumber': memberNumber,
      'status': MemberStatus.active.name,
      'generalNotes': generalNotes ?? '',
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateMember({
    required String memberId,
    String? firstName,
    String? lastName,
    String? displayName,
    String? primaryPhoneE164,
    String? memberNumber,
    String? generalNotes,
    MemberStatus? status,
  }) async {
    final patch = <String, dynamic>{
      'updatedAt': FieldValue.serverTimestamp(),
    };
    if (firstName != null) patch['firstName'] = firstName;
    if (lastName != null) patch['lastName'] = lastName;
    if (displayName != null) patch['displayName'] = displayName;
    if (primaryPhoneE164 != null) patch['primaryPhoneE164'] = primaryPhoneE164;
    if (memberNumber != null) patch['memberNumber'] = memberNumber;
    if (generalNotes != null) patch['generalNotes'] = generalNotes;
    if (status != null) patch['status'] = status.name;
    await _db.collection('members').doc(memberId).update(patch);
  }

  Future<void> deleteMember(String memberId) async {
    await _db.collection('members').doc(memberId).delete();
  }

  /// Active links for a given member, used by the admin Members → links
  /// drill-down to show "this member is represented by these users".
  Stream<List<MemberUserLink>> watchLinksForMember(String memberId) {
    return _db
        .collection('memberUserLinks')
        .where('memberId', isEqualTo: memberId)
        .snapshots()
        .map((s) => s.docs.map(MemberUserLink.fromDoc).toList());
  }

  /// All `active` member-user links across the directory. Admin-only.
  /// Powers the attendance board "Still to confirm" panel: the universe
  /// of members admins expect to see a response for is the set of members
  /// covered by an active link.
  Stream<List<MemberUserLink>> watchAllActiveLinks() {
    return _db
        .collection('memberUserLinks')
        .where('status', isEqualTo: LinkStatus.active.name)
        .snapshots()
        .map((s) => s.docs.map(MemberUserLink.fromDoc).toList());
  }

  /// Admin-only: directly create an active link from a user to a member.
  /// The Firestore rules accept this as long as the document id matches
  /// the canonical `${userId}_${memberId}` shape.
  Future<void> createAdminLink({
    required String adminUserId,
    required String userId,
    required String memberId,
    Relationship relationship = Relationship.other,
  }) async {
    final id = MemberUserLink.idFor(userId, memberId);
    await _db.collection('memberUserLinks').doc(id).set({
      'userId': userId,
      'memberId': memberId,
      'status': LinkStatus.active.name,
      'relationshipToUser': relationship.name,
      'requestedDuringSignup': false,
      'createdByAdminId': adminUserId,
      'approvedByAdminId': adminUserId,
      'approvedAt': FieldValue.serverTimestamp(),
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }

  /// Admin-only: flip an existing link to `inactive`. Used when a user
  /// changes their phone number or no longer represents that member.
  Future<void> deactivateLink(String linkId, String adminUserId) async {
    await _db.collection('memberUserLinks').doc(linkId).update({
      'status': LinkStatus.inactive.name,
      'approvedByAdminId': adminUserId,
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
