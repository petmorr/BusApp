import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:supporters_bus_app/core/widgets/theme.dart';

/// Accessibility baseline checks. The Flutter test framework exposes
/// `meetsGuideline(...)` matchers that map to the WCAG / Material rules
/// for tap target size, contrast, and labelled tap targets. We run them
/// against the elevated-button styling that the rest of the app builds on.
///
/// These are intentionally narrow MVP-level checks; full accessibility
/// auditing happens at QA time on real devices using TalkBack / VoiceOver.
void main() {
  testWidgets('elevated buttons meet the 48dp tap target guideline',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () {},
              child: const Text('Confirm attendance'),
            ),
          ),
        ),
      ),
    );
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  });

  testWidgets('icon-only buttons in the AppBar must have a tooltip / label',
      (tester) async {
    // Mirrors the events-list screen's AppBar actions: each icon button is
    // accompanied by a tooltip so screen readers announce its purpose.
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: Scaffold(
          appBar: AppBar(
            title: const Text('Upcoming events'),
            actions: [
              IconButton(
                icon: const Icon(Icons.admin_panel_settings_outlined),
                tooltip: 'Admin',
                onPressed: () {},
              ),
              IconButton(
                icon: const Icon(Icons.logout),
                tooltip: 'Sign out',
                onPressed: () {},
              ),
            ],
          ),
          body: const SizedBox.shrink(),
        ),
      ),
    );
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });

  testWidgets('text scale floor (1.1) does not crash the theme',
      (tester) async {
    // The app sets a MediaQuery textScaler floor of 1.1 to help older /
    // less technical users. Verify the theme still renders without
    // assertion failures at higher scales.
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(1.5)),
        child: MaterialApp(
          theme: buildAppTheme(),
          home: const Scaffold(
            body: Center(child: Text('Confirm attendance')),
          ),
        ),
      ),
    );
    expect(find.text('Confirm attendance'), findsOneWidget);
  });
}
