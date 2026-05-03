import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:maps_launcher/maps_launcher.dart';

import '../../data/models/event.dart';
import '../../data/repositories/events_repository.dart';
import '../../data/repositories/notifications_service.dart';

/// Helper-side ops console for a single event:
///
/// - Set parked-bus location (use my location, or paste coordinates).
/// - Send an operational update to attending users + admins + assigned
///   helpers.
class HelperEventScreen extends ConsumerStatefulWidget {
  const HelperEventScreen({super.key, required this.eventId});

  final String eventId;

  @override
  ConsumerState<HelperEventScreen> createState() => _HelperEventScreenState();
}

class _HelperEventScreenState extends ConsumerState<HelperEventScreen> {
  // Location form state.
  final _latController = TextEditingController();
  final _lngController = TextEditingController();
  final _labelController = TextEditingController();
  final _notesController = TextEditingController();
  bool _notifyAttending = true;
  bool _busyLocation = false;
  String? _locationError;
  String? _locationInfo;

  // Operational update form state.
  final _updateTitle = TextEditingController();
  final _updateBody = TextEditingController();
  bool _busyUpdate = false;
  String? _updateError;
  String? _updateInfo;

  @override
  void dispose() {
    _latController.dispose();
    _lngController.dispose();
    _labelController.dispose();
    _notesController.dispose();
    _updateTitle.dispose();
    _updateBody.dispose();
    super.dispose();
  }

  Future<void> _useMyLocation() async {
    setState(() {
      _busyLocation = true;
      _locationError = null;
      _locationInfo = null;
    });
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw StateError(
          'Location permission denied. Enable it in Settings to drop the '
          'parked-bus pin from your current GPS location.',
        );
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      _latController.text = pos.latitude.toStringAsFixed(6);
      _lngController.text = pos.longitude.toStringAsFixed(6);
    } catch (err) {
      setState(() => _locationError = '$err');
    } finally {
      if (mounted) setState(() => _busyLocation = false);
    }
  }

  Future<void> _saveLocation() async {
    final lat = double.tryParse(_latController.text.trim());
    final lng = double.tryParse(_lngController.text.trim());
    if (lat == null || lng == null) {
      setState(
        () => _locationError =
            'Please provide latitude and longitude (e.g. from "Use my location").',
      );
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setState(
        () =>
            _locationError = 'Coordinates out of range (lat ±90, lng ±180).',
      );
      return;
    }
    setState(() {
      _busyLocation = true;
      _locationError = null;
      _locationInfo = null;
    });
    try {
      await ref.read(notificationsServiceProvider).updateParkedBusLocation(
            eventId: widget.eventId,
            lat: lat,
            lng: lng,
            label: _labelController.text.trim().isEmpty
                ? null
                : _labelController.text.trim(),
            notes: _notesController.text.trim().isEmpty
                ? null
                : _notesController.text.trim(),
            notifyAttending: _notifyAttending,
          );
      if (mounted) {
        setState(() {
          _locationInfo = _notifyAttending
              ? 'Bus location updated and attending users notified.'
              : 'Bus location updated.';
        });
      }
    } on FirebaseFunctionsException catch (err) {
      setState(() => _locationError = err.message ?? 'Failed.');
    } catch (err) {
      setState(() => _locationError = '$err');
    } finally {
      if (mounted) setState(() => _busyLocation = false);
    }
  }

  Future<void> _sendUpdate() async {
    final title = _updateTitle.text.trim();
    final body = _updateBody.text.trim();
    if (title.isEmpty || body.isEmpty) {
      setState(
        () => _updateError = 'Please provide both a title and a message body.',
      );
      return;
    }
    setState(() {
      _busyUpdate = true;
      _updateError = null;
      _updateInfo = null;
    });
    try {
      await ref.read(notificationsServiceProvider).sendOperationalUpdate(
            eventId: widget.eventId,
            title: title,
            body: body,
          );
      if (mounted) {
        _updateTitle.clear();
        _updateBody.clear();
        setState(() => _updateInfo = 'Operational update sent.');
      }
    } on FirebaseFunctionsException catch (err) {
      setState(() => _updateError = err.message ?? 'Failed.');
    } catch (err) {
      setState(() => _updateError = '$err');
    } finally {
      if (mounted) setState(() => _busyUpdate = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final eventAsync = ref.watch(_helperEventProvider(widget.eventId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Event ops'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back',
          onPressed: () => context.go('/helper/events'),
        ),
      ),
      body: eventAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
        data: (event) {
          // Pre-fill from existing parked-bus location if we have one and
          // the form has not been touched yet.
          final existing = event.parkedBusLocation;
          if (existing != null &&
              _latController.text.isEmpty &&
              _lngController.text.isEmpty) {
            _latController.text = existing.lat.toStringAsFixed(6);
            _lngController.text = existing.lng.toStringAsFixed(6);
            _labelController.text = existing.label ?? '';
            _notesController.text = existing.notes ?? '';
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                event.title,
                style:
                    const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Text(
                DateFormat('EEE d MMM, HH:mm').format(event.eventDate.toLocal()),
              ),
              if (existing != null) ...[
                const SizedBox(height: 12),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.directions_bus),
                    title: Text(
                      existing.label?.isNotEmpty == true
                          ? existing.label!
                          : 'Current parked-bus pin',
                    ),
                    subtitle: Text(
                      '${existing.lat.toStringAsFixed(5)}, '
                      '${existing.lng.toStringAsFixed(5)} • updated '
                      '${DateFormat('HH:mm, EEE d MMM').format(existing.updatedAt.toLocal())}',
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.map_outlined),
                      tooltip: 'Open in Maps',
                      onPressed: () => MapsLauncher.launchCoordinates(
                        existing.lat,
                        existing.lng,
                        existing.label ?? 'Parked bus',
                      ),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              const Text(
                'Set parked-bus location',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _busyLocation ? null : _useMyLocation,
                icon: const Icon(Icons.my_location),
                label: const Text('Use my location'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _latController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                        signed: true,
                      ),
                      decoration: const InputDecoration(labelText: 'Latitude'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _lngController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                        signed: true,
                      ),
                      decoration:
                          const InputDecoration(labelText: 'Longitude'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _labelController,
                decoration: const InputDecoration(
                  labelText: 'Label (optional)',
                  hintText: 'e.g. East car park, by the trees',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _notesController,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Notes (optional)',
                ),
              ),
              const SizedBox(height: 4),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _notifyAttending,
                onChanged: (v) => setState(() => _notifyAttending = v),
                title: const Text('Notify attending users'),
                subtitle: const Text('Sends a push to users on the bus.'),
              ),
              if (_locationError != null) ...[
                const SizedBox(height: 8),
                Text(
                  _locationError!,
                  style:
                      TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              if (_locationInfo != null) ...[
                const SizedBox(height: 8),
                Text(
                  _locationInfo!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.tertiary,
                  ),
                ),
              ],
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _busyLocation ? null : _saveLocation,
                icon: const Icon(Icons.location_on),
                label: Text(
                  _busyLocation ? 'Saving…' : 'Save parked-bus location',
                ),
              ),
              const SizedBox(height: 32),
              const Divider(),
              const SizedBox(height: 16),
              const Text(
                'Send operational update',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              const Text(
                'Reaches attending users + admins + assigned helpers.',
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _updateTitle,
                decoration: const InputDecoration(labelText: 'Title'),
                maxLength: 200,
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _updateBody,
                maxLines: 4,
                maxLength: 1000,
                decoration: const InputDecoration(labelText: 'Message'),
              ),
              if (_updateError != null) ...[
                const SizedBox(height: 8),
                Text(
                  _updateError!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              if (_updateInfo != null) ...[
                const SizedBox(height: 8),
                Text(
                  _updateInfo!,
                  style:
                      TextStyle(color: Theme.of(context).colorScheme.tertiary),
                ),
              ],
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _busyUpdate ? null : _sendUpdate,
                icon: const Icon(Icons.send),
                label: Text(_busyUpdate ? 'Sending…' : 'Send update'),
              ),
            ],
          );
        },
      ),
    );
  }
}

final _helperEventProvider =
    StreamProvider.family<BusEvent, String>((ref, id) {
  return ref.watch(eventsRepositoryProvider).watchEvent(id);
});
