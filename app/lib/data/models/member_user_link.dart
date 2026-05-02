import 'package:cloud_firestore/cloud_firestore.dart';

enum LinkStatus { pending, active, inactive, rejected }

enum Relationship { self, child, dependent, other }

class MemberUserLink {
  const MemberUserLink({
    required this.id,
    required this.userId,
    required this.memberId,
    required this.status,
    required this.relationship,
    this.requestedDuringSignup = false,
    this.approvedAt,
  });

  factory MemberUserLink.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return MemberUserLink(
      id: doc.id,
      userId: data['userId'] as String? ?? '',
      memberId: data['memberId'] as String? ?? '',
      status: LinkStatus.values.firstWhere(
        (s) => s.name == (data['status'] as String? ?? 'pending'),
        orElse: () => LinkStatus.pending,
      ),
      relationship: Relationship.values.firstWhere(
        (r) => r.name == (data['relationshipToUser'] as String? ?? 'self'),
        orElse: () => Relationship.self,
      ),
      requestedDuringSignup:
          data['requestedDuringSignup'] as bool? ?? false,
      approvedAt: (data['approvedAt'] as Timestamp?)?.toDate(),
    );
  }

  static String idFor(String userId, String memberId) => '${userId}_$memberId';

  final String id;
  final String userId;
  final String memberId;
  final LinkStatus status;
  final Relationship relationship;
  final bool requestedDuringSignup;
  final DateTime? approvedAt;
}
