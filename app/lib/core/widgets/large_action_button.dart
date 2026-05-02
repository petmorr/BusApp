import 'package:flutter/material.dart';

class LargeActionButton extends StatelessWidget {
  const LargeActionButton({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.subtitle,
    this.isPrimary = false,
    super.key,
  });

  final String label;
  final String? subtitle;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool isPrimary;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final foreground = isPrimary ? theme.colorScheme.onPrimary : theme.colorScheme.primary;
    final background = isPrimary ? theme.colorScheme.primary : theme.colorScheme.surface;

    return SizedBox(
      width: double.infinity,
      child: Card(
        elevation: 0,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: Ink(
            color: background,
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Icon(icon, color: foreground, size: 34),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: theme.textTheme.titleLarge?.copyWith(
                          color: isPrimary ? foreground : null,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          subtitle!,
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: isPrimary ? foreground.withValues(alpha: 0.88) : theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: foreground, size: 32),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
