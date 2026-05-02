enum MemberStatus {
  pending,
  active,
  rejected,
  inactive,
}

class Member {
  const Member({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.displayName,
    required this.status,
    this.primaryPhoneE164,
    this.memberNumber,
    this.generalNotes,
    this.relationshipToUser,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String displayName;
  final MemberStatus status;
  final String? primaryPhoneE164;
  final String? memberNumber;
  final String? generalNotes;
  final String? relationshipToUser;
}
