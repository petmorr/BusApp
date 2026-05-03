import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_state.dart';
import '../../data/models/member_user_link.dart';
import '../../data/repositories/users_repository.dart';

/// First-run setup. Collects the user's display name and lets them request
/// a `pending` link to one of the supporters in the directory.
///
/// We do **not** show the full member directory (privacy), so the user picks
/// by typing their member number; the same Cloud Function-side admin
/// approval flow then activates the link. If the supporter doesn't have a
/// member number we also accept a phone number, which the admin can match
/// from the queue.
class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  ConsumerState<ProfileSetupScreen> createState() =>
      _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _memberNumberController = TextEditingController();
  Relationship _relationship = Relationship.self;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _memberNumberController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final uid = ref.read(currentUserIdProvider);
    if (uid == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final users = ref.read(usersRepositoryProvider);
      await users.updateDisplayName(_nameController.text.trim());

      final memberNumber = _memberNumberController.text.trim();
      if (memberNumber.isNotEmpty) {
        // The members directory is privacy-gated to admins only, so the
        // lookup-by-number happens server-side via a callable. The
        // callable also validates the member is active and creates a
        // pending link in a single transaction.
        await FirebaseFunctions.instance
            .httpsCallable('requestMemberLinkByNumber')
            .call({
          'memberNumber': memberNumber,
          'relationshipToUser': _relationship.name,
        });
      }
      if (mounted) context.go('/');
    } on FirebaseFunctionsException catch (err) {
      setState(() => _error = err.message ?? 'Could not request link.');
    } catch (err) {
      setState(() => _error = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Welcome')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Text(
                'Tell us who you are',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const Text(
                'Your name is shown to admins when they review your link '
                'request. You can also request to represent a supporter — '
                'an admin will approve it before you can confirm seats for '
                'them.',
                style: TextStyle(fontSize: 16),
              ),
              const SizedBox(height: 24),
              TextFormField(
                controller: _nameController,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                decoration: const InputDecoration(
                  labelText: 'Your name',
                  helperText: 'Required',
                ),
                validator: (v) =>
                    (v ?? '').trim().isEmpty ? 'Please enter your name' : null,
              ),
              const SizedBox(height: 24),
              const Text(
                'Optional: link to a supporter',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const Text(
                'Member number is on your supporters card. Ask the club if '
                'you don\'t know it. You can leave this empty and add the '
                'link later.',
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _memberNumberController,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9A-Za-z\-]')),
                ],
                decoration: const InputDecoration(
                  labelText: 'Member number (optional)',
                  hintText: 'e.g. 042',
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<Relationship>(
                value: _relationship,
                decoration: const InputDecoration(
                  labelText: 'Relationship',
                ),
                items: Relationship.values
                    .map(
                      (r) => DropdownMenuItem(
                        value: r,
                        child: Text(_relationshipLabel(r)),
                      ),
                    )
                    .toList(),
                onChanged: (v) =>
                    setState(() => _relationship = v ?? Relationship.self),
              ),
              const SizedBox(height: 24),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    _error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
              ElevatedButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Continue'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _relationshipLabel(Relationship r) {
    switch (r) {
      case Relationship.self:
        return 'Myself';
      case Relationship.child:
        return 'My child';
      case Relationship.dependent:
        return 'A relative I look after';
      case Relationship.other:
        return 'Someone else';
    }
  }
}
