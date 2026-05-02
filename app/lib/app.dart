import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/routing/app_router.dart';
import 'core/widgets/theme.dart';

class SupportersBusApp extends ConsumerWidget {
  const SupportersBusApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'Supporters Bus',
      theme: buildAppTheme(),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
      builder: (context, child) {
        // Slightly enlarge text app-wide for older / less technical users
        // (per the spec's non-functional requirements). Capped to avoid
        // breaking layouts when the OS already scales text up.
        final mq = MediaQuery.of(context);
        final scaler = mq.textScaler.clamp(minScaleFactor: 1.1);
        return MediaQuery(
          data: mq.copyWith(textScaler: scaler),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
