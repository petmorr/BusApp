import 'package:flutter/material.dart';

import '../../data/models/bus_event.dart';
import '../../data/models/guest_request.dart';
import '../../data/repositories/demo_repository.dart';

class GuestRequestScreen extends StatefulWidget {
  const GuestRequestScreen({
    super.key,
    required this.event,
    required this.repository,
  });

  final BusEvent event;
  final DemoRepository repository;

  @override
  State<GuestRequestScreen> createState() => _GuestRequestScreenState();
}

class _GuestRequestScreenState extends State<GuestRequestScreen> {
  final _guestNameController = TextEditingController();
  String? _selectedPickupStopId;

  @override
  void dispose() {
    _guestNameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pickupStops = widget.event.outboundPickupStops;
    final existingGuests = widget.repository.guestRequestsForEvent(widget.event.id);

    return Scaffold(
      appBar: AppBar(title: const Text('Guest seats')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Request named guest seats for ${widget.event.title}. Guests need admin approval before they count as confirmed seats.',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _guestNameController,
            decoration: const InputDecoration(
              labelText: 'Guest full name',
              border: OutlineInputBorder(),
            ),
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _selectedPickupStopId,
            decoration: const InputDecoration(
              labelText: 'Initial pickup stop',
              border: OutlineInputBorder(),
            ),
            items: [
              for (final stop in pickupStops)
                DropdownMenuItem(
                  value: stop.id,
                  child: Text(stop.name),
                ),
            ],
            onChanged: (value) => setState(() => _selectedPickupStopId = value),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _canSubmit ? _submitGuestRequest : null,
            icon: const Icon(Icons.person_add_alt_1),
            label: const Text('Submit guest request'),
          ),
          const SizedBox(height: 32),
          Text(
            'Current guest requests',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          if (existingGuests.isEmpty)
            const Text('No guest requests for this event yet.')
          else
            for (final guest in existingGuests)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.person_outline),
                  title: Text(guest.guestName),
                  subtitle: Text('Status: ${guest.status.label}'),
                ),
              ),
        ],
      ),
    );
  }

  bool get _canSubmit =>
      _guestNameController.text.trim().isNotEmpty &&
      _selectedPickupStopId != null;

  void _submitGuestRequest() {
    final guestName = _guestNameController.text.trim();
    widget.repository.addGuestRequest(
      GuestRequest(
        id: 'guest-${DateTime.now().millisecondsSinceEpoch}',
        eventId: widget.event.id,
        guestName: guestName,
        requestedByUserId: widget.repository.currentUser.id,
        initialPickupStopId: _selectedPickupStopId!,
        status: GuestRequestStatus.pending,
      ),
    );

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '$guestName was submitted as a pending guest request.',
        ),
      ),
    );
    _guestNameController.clear();
    setState(() => _selectedPickupStopId = null);
  }
}
