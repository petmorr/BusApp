import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final notificationsServiceProvider = Provider<NotificationsService>((ref) {
  return NotificationsService(
    messaging: FirebaseMessaging.instance,
    db: FirebaseFirestore.instance,
    auth: FirebaseAuth.instance,
    functions: FirebaseFunctions.instance,
  );
});

class NotificationsService {
  NotificationsService({
    required FirebaseMessaging messaging,
    required FirebaseFirestore db,
    required FirebaseAuth auth,
    required FirebaseFunctions functions,
  })  : _messaging = messaging,
        _db = db,
        _auth = auth,
        _functions = functions;

  final FirebaseMessaging _messaging;
  final FirebaseFirestore _db;
  final FirebaseAuth _auth;
  final FirebaseFunctions _functions;

  /// Request notification permission, then store the FCM token under
  /// `users/{uid}/fcmTokens/{tokenId}`. Should be called after sign-in.
  Future<void> registerCurrentDevice({required String platform}) async {
    final user = _auth.currentUser;
    if (user == null) return;

    await _messaging.requestPermission();
    final token = await _messaging.getToken();
    if (token == null) return;

    await _writeToken(user.uid, token, platform);
    _messaging.onTokenRefresh.listen((newToken) async {
      await _writeToken(user.uid, newToken, platform);
    });
  }

  Future<void> _writeToken(String uid, String token, String platform) async {
    final tokenId = token.hashCode.toRadixString(16);
    await _db
        .collection('users')
        .doc(uid)
        .collection('fcmTokens')
        .doc(tokenId)
        .set({
      'token': token,
      'platform': platform,
      'createdAt': FieldValue.serverTimestamp(),
      'lastSeenAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true),);
  }

  // ----- Cloud Function callables -----

  Future<void> sendAttendanceRequest(String eventId) async {
    await _functions
        .httpsCallable('sendAttendanceRequest')
        .call({'eventId': eventId});
  }

  Future<void> sendAttendanceReminder(String eventId) async {
    await _functions
        .httpsCallable('sendAttendanceReminder')
        .call({'eventId': eventId});
  }

  Future<void> sendPendingGuestReminder(String eventId) async {
    await _functions
        .httpsCallable('sendPendingGuestReminder')
        .call({'eventId': eventId});
  }

  Future<void> sendOperationalUpdate({
    required String eventId,
    required String title,
    required String body,
  }) async {
    await _functions.httpsCallable('sendOperationalUpdate').call({
      'eventId': eventId,
      'title': title,
      'body': body,
    });
  }

  Future<void> approveGuestRequest({
    required String eventId,
    required String guestRequestId,
  }) async {
    await _functions.httpsCallable('approveGuestRequest').call({
      'eventId': eventId,
      'guestRequestId': guestRequestId,
    });
  }

  Future<void> rejectGuestRequest({
    required String eventId,
    required String guestRequestId,
  }) async {
    await _functions.httpsCallable('rejectGuestRequest').call({
      'eventId': eventId,
      'guestRequestId': guestRequestId,
    });
  }

  Future<void> updateParkedBusLocation({
    required String eventId,
    required double lat,
    required double lng,
    String? label,
    String? notes,
    bool notifyAttending = true,
  }) async {
    await _functions.httpsCallable('updateParkedBusLocation').call({
      'eventId': eventId,
      'lat': lat,
      'lng': lng,
      'label': label,
      'notes': notes,
      'notifyAttending': notifyAttending,
    });
  }
}
