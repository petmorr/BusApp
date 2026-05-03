import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

/// Cross-event attendance history. Uses the denormalised `eventDate`,
/// `eventTitle`, and `memberDisplayName` fields written into every
/// memberResponse doc to power a collection-group query without joins.
class AdminAttendanceHistoryScreen extends ConsumerStatefulWidget {
  const AdminAttendanceHistoryScreen({super.key});

  @override
  ConsumerState<AdminAttendanceHistoryScreen> createState() =>
      _AdminAttendanceHistoryScreenState();
}

class _AdminAttendanceHistoryScreenState
    extends ConsumerState<AdminAttendanceHistoryScreen> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(_attendanceHistoryProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance history'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to admin',
          onPressed: () => context.go('/admin'),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                labelText: 'Filter by member or event',
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.clear),
                        tooltip: 'Clear',
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _query = '');
                        },
                      ),
              ),
              onChanged: (v) => setState(() => _query = v.toLowerCase().trim()),
            ),
          ),
          Expanded(
            child: history.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('$e')),
              data: (entries) {
                final filtered = _query.isEmpty
                    ? entries
                    : entries.where((e) {
                        return e.memberDisplayName
                                .toLowerCase()
                                .contains(_query) ||
                            e.eventTitle.toLowerCase().contains(_query);
                      }).toList();
                if (filtered.isEmpty) {
                  return const Center(child: Text('No matching responses.'));
                }
                return ListView.separated(
                  itemBuilder: (_, i) => _HistoryTile(entry: filtered[i]),
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemCount: filtered.length,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _AttendanceHistoryEntry {
  const _AttendanceHistoryEntry({
    required this.memberDisplayName,
    required this.eventTitle,
    required this.eventDate,
    required this.status,
    required this.isAdminOverride,
  });
  final String memberDisplayName;
  final String eventTitle;
  final DateTime eventDate;
  final String status;
  final bool isAdminOverride;
}

final _attendanceHistoryProvider =
    StreamProvider<List<_AttendanceHistoryEntry>>((ref) {
  return FirebaseFirestore.instance
      .collectionGroup('memberResponses')
      .orderBy('eventDate', descending: true)
      .limit(500)
      .snapshots()
      .map((snap) {
    return snap.docs.map((d) {
      final data = d.data();
      return _AttendanceHistoryEntry(
        memberDisplayName: data['memberDisplayName'] as String? ?? d.id,
        eventTitle: data['eventTitle'] as String? ?? '',
        eventDate: (data['eventDate'] as Timestamp?)?.toDate() ??
            DateTime.fromMillisecondsSinceEpoch(0),
        status: data['status'] as String? ?? 'unknown',
        isAdminOverride: data['isAdminOverride'] as bool? ?? false,
      );
    }).toList();
  });
});

class _HistoryTile extends StatelessWidget {
  const _HistoryTile({required this.entry});

  final _AttendanceHistoryEntry entry;

  @override
  Widget build(BuildContext context) {
    final isAttending = entry.status == 'attending';
    return ListTile(
      leading: Icon(
        isAttending ? Icons.check_circle_outline : Icons.do_not_disturb,
        color: isAttending
            ? Theme.of(context).colorScheme.tertiary
            : Theme.of(context).disabledColor,
      ),
      title: Text(entry.memberDisplayName),
      subtitle: Text(
        '${entry.eventTitle} • '
        '${DateFormat('d MMM yyyy').format(entry.eventDate.toLocal())} • '
        '${entry.status.replaceAll('_', ' ')}'
        '${entry.isAdminOverride ? ' • admin override' : ''}',
      ),
    );
  }
}
