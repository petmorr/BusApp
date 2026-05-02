import 'package:flutter/material.dart';

/// Builds a high-contrast, large-touch-target theme suitable for older or
/// less technical users (per the spec's non-functional requirements).
ThemeData buildAppTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFF0B5394),
      brightness: Brightness.light,
    ),
  );
  return base.copyWith(
    visualDensity: VisualDensity.comfortable,
    textTheme: base.textTheme.apply(
      fontSizeFactor: 1.1,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    ),
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 18),
    ),
    appBarTheme: const AppBarTheme(centerTitle: true),
  );
}
