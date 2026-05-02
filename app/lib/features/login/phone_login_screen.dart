import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Phone-OTP login flow:
///   1. User enters their phone number (E.164 format).
///   2. Firebase sends an SMS code.
///   3. User enters the 6-digit code, app calls `signInWithCredential`.
///
/// Once signed in, the router redirects to the events list. Member-link
/// approval is requested separately during signup.
class PhoneLoginScreen extends ConsumerStatefulWidget {
  const PhoneLoginScreen({super.key});

  @override
  ConsumerState<PhoneLoginScreen> createState() => _PhoneLoginScreenState();
}

class _PhoneLoginScreenState extends ConsumerState<PhoneLoginScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  String? _verificationId;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: _phoneController.text.trim(),
        timeout: const Duration(seconds: 60),
        verificationCompleted: (cred) async {
          await FirebaseAuth.instance.signInWithCredential(cred);
        },
        verificationFailed: (e) =>
            setState(() => _error = e.message ?? 'Verification failed'),
        codeSent: (id, _) => setState(() => _verificationId = id),
        codeAutoRetrievalTimeout: (id) =>
            setState(() => _verificationId = id),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmCode() async {
    final id = _verificationId;
    if (id == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final cred = PhoneAuthProvider.credential(
        verificationId: id,
        smsCode: _codeController.text.trim(),
      );
      await FirebaseAuth.instance.signInWithCredential(cred);
    } on FirebaseAuthException catch (e) {
      setState(() => _error = e.message ?? 'Sign-in failed');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Enter your phone number to receive a one-time code.',
              style: TextStyle(fontSize: 16),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone number',
                hintText: '+447700900123',
              ),
              enabled: !_busy && _verificationId == null,
            ),
            const SizedBox(height: 16),
            if (_verificationId == null)
              ElevatedButton(
                onPressed: _busy ? null : _sendCode,
                child: const Text('Send code'),
              )
            else ...[
              TextField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'SMS code'),
                enabled: !_busy,
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _busy ? null : _confirmCode,
                child: const Text('Confirm'),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
