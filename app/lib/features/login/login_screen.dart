import 'package:flutter/material.dart';

import '../../core/widgets/large_action_button.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key, required this.onSignedIn});

  final VoidCallback onSignedIn;

  @override
  Widget build(BuildContext context) {
    final phoneController = TextEditingController(text: '+447700900123');

    return Scaffold(
      appBar: AppBar(title: const Text('Supporters bus')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(
              'Sign in with your mobile number',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            Text(
              'The production app will use Firebase phone sign-in. This scaffold keeps a demo sign-in so the MVP screens can be reviewed before Firebase projects are connected.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            TextField(
              controller: phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Mobile number',
                helperText: 'Use international format, for example +447700900123',
                prefixIcon: Icon(Icons.phone),
              ),
            ),
            const SizedBox(height: 24),
            LargeActionButton(
              icon: Icons.sms,
              label: 'Send one-time code',
              onPressed: onSignedIn,
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onSignedIn,
              icon: const Icon(Icons.admin_panel_settings),
              label: const Text('Continue as demo admin'),
            ),
          ],
        ),
      ),
    );
  }
}
