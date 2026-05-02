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

  Future<void> requestPendingLink({
    required String userId,
    required String memberId,
    required Relationship relationship,
  }) async {
    final docId = MemberUserLink.idFor(userId, memberId);
    await _db.collection('memberUserLinks').doc(docId).set({
      'userId': userId,
      'memberId': memberId,
      'status': LinkStatus.pending.name,
      'relationshipToUser': relationship.name,
      'requestedDuringSignup': true,
      'createdByAdminId': null,
      'approvedByAdminId': null,
      'approvedAt': null,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    });
  }
}
