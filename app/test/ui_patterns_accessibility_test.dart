import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:supporters_bus_app/core/widgets/theme.dart';

/// Accessibility regression suite for the UI patterns the new
/// member, admin, and helper screens build on top of:
///
/// - Form fields with explicit `labelText`.
/// - SegmentedButton (used in the attendance form).
/// - SwitchListTile (used in the helpers tab + parked-bus form).
/// - Card / ListTile actions with leading icons + titles.
/// - DropdownButtonFormField (used everywhere a user picks a
///   member, stop, or relationship).
///
/// We run the same `meetsGuideline(...)` matchers that the existing
/// `accessibility_test.dart` uses on real Material primitives, plus
/// targeted assertions on the labels we hand to screen readers. These
/// are intentionally light-weight smoke tests rather than a full audit:
/// the e2e harness on real devices catches the deeper TalkBack /
/// VoiceOver behaviour.
void main() {
  testWidgets('form fields with labelText are announced by screen readers',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  decoration: const InputDecoration(labelText: 'First name'),
                  controller: TextEditingController(text: 'John'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: 'self',
                  decoration: const InputDecoration(labelText: 'Relationship'),
                  items: const [
                    DropdownMenuItem(value: 'self', child: Text('Myself')),
                    DropdownMenuItem(value: 'child', child: Text('My child')),
                  ],
                  onChanged: (_) {},
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    expect(find.text('First name'), findsOneWidget);
    expect(find.text('Relationship'), findsOneWidget);
  });

  testWidgets('SegmentedButton meets tap target and labelled-target guidelines',
      (tester) async {
    int selected = 0;
    await tester.pumpWidget(
      StatefulBuilder(
        builder: (context, setState) {
          return MaterialApp(
            theme: buildAppTheme(),
            home: Scaffold(
              body: Center(
                child: SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(
                      value: 0,
                      label: Text('Attending'),
                      icon: Icon(Icons.check),
                    ),
                    ButtonSegment(
                      value: 1,
                      label: Text('Not attending'),
                      icon: Icon(Icons.close),
                    ),
                  ],
                  selected: {selected},
                  onSelectionChanged: (s) => setState(() => selected = s.first),
                ),
              ),
            ),
          );
        },
      ),
    );
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  testWidgets('SwitchListTile has a label that screen readers can announce',
      (tester) async {
    bool value = true;
    await tester.pumpWidget(
      StatefulBuilder(
        builder: (context, setState) {
          return MaterialApp(
            theme: buildAppTheme(),
            home: Scaffold(
              body: SwitchListTile(
                value: value,
                onChanged: (v) => setState(() => value = v),
                title: const Text('Notify attending users'),
                subtitle: const Text('Sends a push to users on the bus.'),
              ),
            ),
          );
        },
      ),
    );
    expect(find.text('Notify attending users'), findsOneWidget);
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  });

  testWidgets('Approve / Reject row tap targets meet 48dp guideline',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.close),
                    label: const Text('Reject'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.check),
                    label: const Text('Approve'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  testWidgets('Card list tiles in admin/helper menus expose their title',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: Scaffold(
          body: ListView(
            children: [
              Card(
                child: ListTile(
                  leading: const Icon(Icons.people_outline),
                  title: const Text('Members'),
                  subtitle: const Text('Add, edit, search supporters'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {},
                ),
              ),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.event_outlined),
                  title: const Text('Events'),
                  subtitle: const Text('Create, edit, set capacity & stops'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {},
                ),
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('Members'), findsOneWidget);
    expect(find.text('Events'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });
}
