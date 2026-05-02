import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:supporters_bus_app/core/widgets/theme.dart';

void main() {
  testWidgets('builds the theme without errors', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAppTheme(),
        home: const Scaffold(body: Text('hello')),
      ),
    );
    expect(find.text('hello'), findsOneWidget);
  });
}
