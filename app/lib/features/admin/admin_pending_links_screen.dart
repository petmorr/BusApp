import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/member.dart';
import '../../data/models/member_user_link.dart';
import '../../data/repositories/members_repository.dart';

/// Admin queue for member-user link requests.
///
/// Each `pending` link doc represents a user asking to represent a
/// supporter. We resolve the supporter row inline so the admin can verify
/// the match, then approve or reject via the Cloud Function callable
/// (which runs the canonical-id check and writes the audit log).
class AdminPendingLinksScreen extends ConsumerWidget {
  const AdminPendingLinksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(_pendingLinksProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pending member links'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to admin',
          onPressed: () => context.go('/admin'),
        ),
      ),
      body: pending.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (links) {
          if (links.isEmpty) {
            return const Center(
              child: Text(
                'No pending requests.',
                style: TextStyle(fontSize: 18),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemBuilder: (_, i) => _PendingLinkTile(link: links[i]),
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemCount: links.length,
          );
        },
      ),
    );
  }
}

class _PendingLinkTile extends ConsumerStatefulWidget {
  const _PendingLinkTile({required this.link});

  final MemberUserLink link;

  @override
  ConsumerState<_PendingLinkTile> createState() => _PendingLinkTileState();
}

class _PendingLinkTileState extends ConsumerState<_PendingLinkTile> {
  bool _busy = false;
  String? _error;

  Future<void> _decide({required bool approve}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await FirebaseFunctions.instance
          .httpsCallable(
            approve ? 'approveMemberUserLink' : 'rejectMemberUserLink',
          )
          .call({'linkId': widget.link.id});
    } on FirebaseFunctionsException catch (err) {
      setState(() => _error = err.message ?? 'Failed.');
    } catch (err) {
      setState(() => _error = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final memberAsync =
        ref.watch(_memberByIdProvider(widget.link.memberId));
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            memberAsync.when(
              loading: () => const _LoadingLine(),
              error: (e, _) => Text('Member ${widget.link.memberId}: $e'),
              data: (m) => Text(
                m == null
                    ? 'Member ${widget.link.memberId} (not found)'
                    : '${m.displayName}'
                      '${m.memberNumber != null ? "  #${m.memberNumber}" : ""}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text('User: ${widget.link.userId}'),
            Text(
              'Relationship: ${widget.link.relationship.name}',
              style: const TextStyle(color: Colors.black54),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : () => _decide(approve: false),
                    icon: const Icon(Icons.close),
                    label: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy ? null : () => _decide(approve: true),
                    icon: const Icon(Icons.check),
                    label: Text(_busy ? '…' : 'Approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadingLine extends StatelessWidget {
  const _LoadingLine();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 18,
      child: LinearProgressIndicator(),
    );
  }
}

final _pendingLinksProvider = StreamProvider<List<MemberUserLink>>((ref) {
  return ref.watch(membersRepositoryProvider).watchPendingLinks();
});

final _memberByIdProvider =
    StreamProvider.family<Member?, String>((ref, memberId) {
  return ref.watch(membersRepositoryProvider).watchMember(memberId);
});
