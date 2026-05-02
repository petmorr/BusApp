/**
 * Re-export the firebase-admin Firestore namespace pieces we use, in a
 * shape that works under both `import * as admin from 'firebase-admin'`
 * and modular subpath imports.
 *
 * In firebase-admin v12 the namespace returned by the default star
 * import (`import * as admin from 'firebase-admin'`) is wrapped by
 * TypeScript's __importStar helper; the wrap leaves `admin.firestore`
 * usable as a function (so `admin.firestore()` works) but loses the
 * static `admin.firestore.FieldValue` accessor in some emulator
 * loaders. Pulling the symbols from the explicit subpath avoids that
 * gotcha.
 */
import { FieldValue, Timestamp, Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { getAuth, Auth } from 'firebase-admin/auth';

export { FieldValue, Timestamp };

export function db(): Firestore {
  return getFirestore();
}

export function messaging(): Messaging {
  return getMessaging();
}

export function authAdmin(): Auth {
  return getAuth();
}

export function serverTimestamp(): FieldValue {
  return FieldValue.serverTimestamp();
}

export function timestampNow(): Timestamp {
  return Timestamp.now();
}
