import * as adminSdk from 'firebase-admin';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithCustomToken,
  signOut,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
} from 'firebase/firestore';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
  Functions,
} from 'firebase/functions';

export const PROJECT_ID = 'supporters-bus-e2e';

const FAKE_API_KEY = 'fake-api-key';
const AUTH_HOST = '127.0.0.1';
const AUTH_PORT = 9099;
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const REGION = 'europe-west2';

// firebase-admin uses these env vars to connect to the emulators.
process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `${AUTH_HOST}:${AUTH_PORT}`;
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;

let _admin: typeof adminSdk | null = null;

/**
 * Returns an initialised firebase-admin SDK pointed at the emulator. Used
 * by tests to seed Firestore and to mint custom tokens for users.
 */
export function getAdmin(): typeof adminSdk {
  if (_admin) return _admin;
  if (adminSdk.apps.length === 0) {
    adminSdk.initializeApp({ projectId: PROJECT_ID });
  }
  _admin = adminSdk;
  return _admin;
}

/**
 * Reset all emulator state between tests. Wipes Firestore + Auth users.
 */
export async function resetEmulators(): Promise<void> {
  const a = getAdmin();
  // Firestore — delete all collections by listing them and deleting docs.
  await deleteAllCollections(a.firestore());
  // Auth — delete all users.
  const list = await a.auth().listUsers(1000);
  await Promise.all(list.users.map((u) => a.auth().deleteUser(u.uid)));
}

async function deleteAllCollections(db: adminSdk.firestore.Firestore): Promise<void> {
  const cols = await db.listCollections();
  for (const col of cols) {
    await deleteCollection(db, col);
  }
}

async function deleteCollection(
  db: adminSdk.firestore.Firestore,
  col: adminSdk.firestore.CollectionReference,
): Promise<void> {
  const snap = await col.limit(500).get();
  if (snap.empty) return;
  const batch = db.batch();
  for (const doc of snap.docs) {
    // Recurse into subcollections first.
    const subs = await doc.ref.listCollections();
    for (const sub of subs) {
      await deleteCollection(db, sub);
    }
    batch.delete(doc.ref);
  }
  await batch.commit();
  if (snap.size === 500) {
    await deleteCollection(db, col);
  }
}

/**
 * Create (or update) an Auth user with the given uid and custom claims, and
 * return a `Caller` bound to that user's identity. The caller exposes
 * Firestore + a callable() helper for invoking Cloud Functions as that user.
 */
export async function makeCaller(
  uid: string,
  options: { admin?: boolean; helper?: boolean } = {},
): Promise<Caller> {
  const a = getAdmin();
  try {
    await a.auth().getUser(uid);
  } catch {
    await a.auth().createUser({
      uid,
      // Auth emulator does not require these to be unique across runs.
      phoneNumber: `+44770090${String(Math.floor(Math.random() * 9000) + 1000)}`,
    });
  }
  const claims: Record<string, boolean> = {};
  if (options.admin) claims.admin = true;
  if (options.helper) claims.helper = true;
  await a.auth().setCustomUserClaims(uid, claims);
  const customToken = await a.auth().createCustomToken(uid, claims);

  const app: FirebaseApp = initializeApp(
    { apiKey: FAKE_API_KEY, projectId: PROJECT_ID },
    `e2e-${uid}-${Math.random().toString(36).slice(2)}`,
  );
  const auth: Auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}:${AUTH_PORT}`, {
    disableWarnings: true,
  });
  const firestore: Firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);
  const functions: Functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, FUNCTIONS_HOST, FUNCTIONS_PORT);

  await signInWithCustomToken(auth, customToken);

  return {
    uid,
    app,
    auth,
    firestore,
    callable<R = unknown>(name: string, payload: unknown): Promise<R> {
      return httpsCallable<unknown, R>(functions, name)(payload).then(
        (r) => r.data,
      );
    },
    async dispose(): Promise<void> {
      await signOut(auth);
      await deleteApp(app);
    },
  };
}

export interface Caller {
  uid: string;
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  callable<R = unknown>(name: string, payload: unknown): Promise<R>;
  dispose(): Promise<void>;
}

export const REGION_FOR_CALLABLES = REGION;
