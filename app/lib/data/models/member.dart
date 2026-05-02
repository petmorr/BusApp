import 'package:cloud_firestore/cloud_firestore.dart';

enum MemberStatus { pending, active, rejected, inactive }

class Member {
  const Member({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.displayName,
    required this.primaryPhoneE164,
    required this.status,
    this.memberNumber,
    this.generalNotes,
  });

  factory Member.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data()!;
    return Member(
      id: doc.id,
      firstName: data['firstName'] as String? ?? '',
      lastName: data['lastName'] as String? ?? '',
      displayName: data['displayName'] as String? ?? '',
      primaryPhoneE164: data['primaryPhoneE164'] as String? ?? '',
      status: MemberStatus.values.firstWhere(
        (s) => s.name == (data['status'] as String? ?? 'active'),
        orElse: () => MemberStatus.active,
      ),
      memberNumber: data['memberNumber'] as String?,
      generalNotes: data['generalNotes'] as String?,
    );
  }

  final String id;
  final String firstName;
  final String lastName;
  final String displayName;
  final String primaryPhoneE164;
  final MemberStatus status;
  final String? memberNumber;
  final String? generalNotes;
}
