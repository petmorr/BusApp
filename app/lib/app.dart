import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'data/repositories/demo_repository.dart';
import 'features/events/events_list_screen.dart';
import 'features/login/login_screen.dart';

class SupportersBusApp extends StatefulWidget {
  const SupportersBusApp({super.key});

  @override
  State<SupportersBusApp> createState() => _SupportersBusAppState();
}

class _SupportersBusAppState extends State<SupportersBusApp> {
  final DemoRepository _repository = DemoRepository();
  bool _isSignedIn = false;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Supporters Bus',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: _isSignedIn
          ? EventsListScreen(
              currentUser: _repository.currentUser,
              repository: _repository,
            )
          : LoginScreen(onSignedIn: () => setState(() => _isSignedIn = true)),
    );
  }
}
