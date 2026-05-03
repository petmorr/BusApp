import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../data/models/member.dart';
import '../../data/repositories/members_repository.dart';

class AdminMembersScreen extends ConsumerStatefulWidget {
  const AdminMembersScreen({super.key});

  @override
  ConsumerState<AdminMembersScreen> createState() =>
      _AdminMembersScreenState();
}

class _AdminMembersScreenState extends ConsumerState<AdminMembersScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final membersAsync = ref.watch(_allMembersProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Members'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to admin',
          onPressed: () => context.go('/admin'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add member',
            onPressed: () => _editMember(context, member: null),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                labelText: 'Search by name or member number',
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        tooltip: 'Clear',
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _query = '');
                        },
                      ),
              ),
              onChanged: (v) => setState(() => _query = v.toLowerCase().trim()),
            ),
          ),
          Expanded(
            child: membersAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => _ErrorBox('$e'),
              data: (members) {
                final filtered = _query.isEmpty
                    ? members
                    : members.where((m) {
                        final number = (m.memberNumber ?? '').toLowerCase();
                        return m.displayName.toLowerCase().contains(_query) ||
                            number.contains(_query);
                      }).toList();
                if (filtered.isEmpty) {
                  return const Center(child: Text('No matching members.'));
                }
                return ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  itemBuilder: (_, i) => _MemberTile(
                    member: filtered[i],
                    onTap: () => _editMember(context, member: filtered[i]),
                  ),
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemCount: filtered.length,
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _editMember(
    BuildContext context, {
    required Member? member,
  }) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => AdminMemberEditScreen(member: member),
        fullscreenDialog: true,
      ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  const _MemberTile({required this.member, required this.onTap});

  final Member member;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      title: Text(member.displayName),
      subtitle: Text(
        [
          if (member.memberNumber != null) '#${member.memberNumber}',
          member.primaryPhoneE164,
          if (member.status != MemberStatus.active) 'status: ${member.status.name}',
        ].join('  •  '),
      ),
      leading: CircleAvatar(
        child: Text(_initials(member.displayName)),
      ),
      trailing: const Icon(Icons.chevron_right),
    );
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0].characters.first.toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first)
        .toUpperCase();
  }
}

class AdminMemberEditScreen extends ConsumerStatefulWidget {
  const AdminMemberEditScreen({super.key, this.member});

  final Member? member;

  @override
  ConsumerState<AdminMemberEditScreen> createState() =>
      _AdminMemberEditScreenState();
}

class _AdminMemberEditScreenState
    extends ConsumerState<AdminMemberEditScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _firstName;
  late final TextEditingController _lastName;
  late final TextEditingController _displayName;
  late final TextEditingController _phone;
  late final TextEditingController _memberNumber;
  late final TextEditingController _notes;
  late MemberStatus _status;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final m = widget.member;
    _firstName = TextEditingController(text: m?.firstName ?? '');
    _lastName = TextEditingController(text: m?.lastName ?? '');
    _displayName = TextEditingController(text: m?.displayName ?? '');
    _phone = TextEditingController(text: m?.primaryPhoneE164 ?? '');
    _memberNumber = TextEditingController(text: m?.memberNumber ?? '');
    _notes = TextEditingController(text: m?.generalNotes ?? '');
    _status = m?.status ?? MemberStatus.active;
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _displayName.dispose();
    _phone.dispose();
    _memberNumber.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = ref.read(membersRepositoryProvider);
      final display = _displayName.text.trim().isEmpty
          ? '${_firstName.text.trim()} ${_lastName.text.trim()}'.trim()
          : _displayName.text.trim();
      if (widget.member == null) {
        await repo.createMember(
          firstName: _firstName.text.trim(),
          lastName: _lastName.text.trim(),
          displayName: display,
          primaryPhoneE164: _phone.text.trim(),
          memberNumber: _memberNumber.text.trim().isEmpty
              ? null
              : _memberNumber.text.trim(),
          generalNotes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        );
      } else {
        await repo.updateMember(
          memberId: widget.member!.id,
          firstName: _firstName.text.trim(),
          lastName: _lastName.text.trim(),
          displayName: display,
          primaryPhoneE164: _phone.text.trim(),
          memberNumber: _memberNumber.text.trim().isEmpty
              ? null
              : _memberNumber.text.trim(),
          generalNotes: _notes.text.trim(),
          status: _status,
        );
      }
      if (mounted) Navigator.of(context).pop();
    } catch (err) {
      setState(() => _error = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final m = widget.member;
    if (m == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this member?'),
        content: Text(
          'This will remove ${m.displayName} from the supporters '
          'directory. Existing event responses will be preserved for audit '
          'history. Continue?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(membersRepositoryProvider).deleteMember(m.id);
      if (mounted) Navigator.of(context).pop();
    } catch (err) {
      setState(() {
        _error = '$err';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isCreate = widget.member == null;
    return Scaffold(
      appBar: AppBar(
        title: Text(isCreate ? 'New member' : 'Edit member'),
        actions: [
          if (!isCreate)
            IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Delete member',
              onPressed: _busy ? null : _delete,
            ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _firstName,
              decoration: const InputDecoration(labelText: 'First name'),
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _lastName,
              decoration: const InputDecoration(labelText: 'Last name'),
              validator: (v) =>
                  (v ?? '').trim().isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _displayName,
              decoration: const InputDecoration(
                labelText: 'Display name (optional)',
                helperText: 'Defaults to "First Last"',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone (E.164)',
                hintText: '+447700900123',
              ),
              validator: (v) {
                final value = (v ?? '').trim();
                if (value.isEmpty) return 'Required';
                if (!RegExp(r'^\+[1-9]\d{6,14}$').hasMatch(value)) {
                  return 'Must be in E.164 format (e.g. +447700900123)';
                }
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _memberNumber,
              decoration: const InputDecoration(
                labelText: 'Member number (optional)',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _notes,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Notes (optional)',
              ),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<MemberStatus>(
              value: _status,
              decoration: const InputDecoration(labelText: 'Status'),
              items: MemberStatus.values
                  .map(
                    (s) => DropdownMenuItem(
                      value: s,
                      child: Text(s.name),
                    ),
                  )
                  .toList(),
              onChanged: (v) =>
                  setState(() => _status = v ?? MemberStatus.active),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(isCreate ? 'Create member' : 'Save changes'),
            ),
          ],
        ),
      ),
    );
  }
}

final _allMembersProvider = StreamProvider<List<Member>>((ref) {
  return ref.watch(membersRepositoryProvider).watchAllMembers();
});

class _ErrorBox extends StatelessWidget {
  const _ErrorBox(this.message);
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
