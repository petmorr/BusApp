/**
 * Load `firestore/seed/seed.sample.json` into the Firestore emulator.
 *
 * Usage (with the Firebase emulator already running):
 *
 *   cd scripts
 *   npm install
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *     npm run seed-emulator
 *
 * Safety guards — the script aborts UNLESS **all** of the following hold:
 *
 *   1. `FIRESTORE_EMULATOR_HOST` is set so Firestore writes target the
 *      local emulator.
 *   2. `FIREBASE_AUTH_EMULATOR_HOST` is set so the seeded admin user and
 *      its `{ admin: true }` custom claim are created in the Auth
 *      emulator — without this guard an operator with real Firebase
 *      credentials (ADC) could accidentally create a production admin
 *      user because `auth.createUser` / `setCustomUserClaims` fall back
 *      to the real Auth service when the emulator env var is unset.
 *   3. The resolved project id starts with `demo-` OR matches the
 *      allow-list below. Firebase documents that project ids beginning
 *      with `demo-` are reserved for local/emulator use and never
 *      correspond to real Firebase projects. This is defence-in-depth
 *      against a stray `GCLOUD_PROJECT=supporters-bus-prod` in the
 *      operator's shell.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps } from 'firebase-admin/app';
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_FILE = path.resolve(
  __dirname,
  '..',
  'firestore',
  'seed',
  'seed.sample.json',
);

interface SeedFile {
  members: Record<string, MemberRow>;
  events: Record<string, EventRow>;
}

interface MemberRow {
  firstName: string;
  lastName: string;
  displayName: string;
  primaryPhoneE164: string;
  memberNumber?: string;
  status: 'pending' | 'active' | 'rejected' | 'inactive';
  generalNotes?: string;
}

interface EventRow {
  title: string;
  eventDate: string;
  status: 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';
  capacityMax: number;
  capacityNearThresholdPercent: number;
  capacityStatus: 'under' | 'near' | 'at' | 'over';
  pendingGuestRisk: boolean;
  destinationName?: string;
  generalNotes?: string;
  cutoffAt?: string | null;
  lastCapacityAlertSentAt: string | null;
  stops: Record<string, StopRow>;
}

interface StopRow {
  name: string;
  type:
    | 'outbound_pickup'
    | 'event_dropoff'
    | 'event_pickup'
    | 'return_dropoff';
  sequence: number;
  scheduledAt?: string | null;
  isActive: boolean;
  location?: { lat: number; lng: number; address?: string };
  notes?: string;
}

// Project ids that are explicitly permitted in addition to the `demo-*`
// convention. Keep this list in lockstep with `.firebaserc`. The
// `supporters-bus-e2e` project is an emulator-only project used by the
// e2e harness; it must never be provisioned against real GCP.
const ALLOWED_PROJECT_IDS = new Set<string>([
  'supporters-bus-e2e',
]);

function assertEmulatorEnvironment(projectId: string): void {
  const missing: string[] = [];
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    missing.push('FIRESTORE_EMULATOR_HOST');
  }
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    missing.push('FIREBASE_AUTH_EMULATOR_HOST');
  }
  if (missing.length > 0) {
    console.error(
      `Refusing to run: the following emulator env var(s) are not set: ` +
        `${missing.join(', ')}.\n\n` +
        `This script writes Firestore documents AND creates an Auth user ` +
        `with the { admin: true } custom claim. If either emulator host is ` +
        `unset, the firebase-admin SDK will fall back to the real Firebase ` +
        `backend and the corresponding writes will hit your live project.`,
    );
    process.exit(1);
  }
  const isDemoProject = projectId.startsWith('demo-');
  if (!isDemoProject && !ALLOWED_PROJECT_IDS.has(projectId)) {
    console.error(
      `Refusing to run: project id "${projectId}" is not a demo-* project ` +
        `and is not on the seed-emulator allow-list (${[...ALLOWED_PROJECT_IDS].join(', ') || '(empty)'}).\n\n` +
        `Set GCLOUD_PROJECT to a project id that starts with "demo-" (e.g. ` +
        `"demo-supporters-bus"), or add the project id to ALLOWED_PROJECT_IDS ` +
        `if it is a real emulator-only project.`,
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT ?? 'demo-supporters-bus';
  assertEmulatorEnvironment(projectId);

  if (getApps().length === 0) {
    initializeApp({ projectId });
  }
  const db = getFirestore();
  const auth = getAuth();

  const text = await readFile(SEED_FILE, 'utf8');
  const data = JSON.parse(text) as SeedFile;

  // ----- Members -----
  console.log(`seeding ${Object.keys(data.members).length} member(s)…`);
  const memberWrites = Object.entries(data.members).map(([id, row]) =>
    db.collection('members').doc(id).set({
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: row.displayName,
      primaryPhoneE164: row.primaryPhoneE164,
      memberNumber: row.memberNumber ?? null,
      status: row.status,
      generalNotes: row.generalNotes ?? '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  );
  await Promise.all(memberWrites);

  // ----- Demo admin user -----
  // Create a deterministic admin user in the auth emulator + a matching
  // user profile + admin custom claim. Sign in to the app on the device
  // by entering this phone number and using any 6-digit code in the
  // emulator UI.
  const adminUid = 'demoAdminUid';
  const adminPhone = '+15555550100';
  try {
    await auth.deleteUser(adminUid);
  } catch (_) {
    // user did not exist
  }
  await auth.createUser({
    uid: adminUid,
    phoneNumber: adminPhone,
    displayName: 'Demo Admin',
  });
  await auth.setCustomUserClaims(adminUid, { admin: true });
  await db.collection('users').doc(adminUid).set({
    phoneE164: adminPhone,
    displayName: 'Demo Admin',
    roles: ['user', 'admin'],
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // ----- Events + stops -----
  console.log(`seeding ${Object.keys(data.events).length} event(s)…`);
  for (const [eventId, ev] of Object.entries(data.events)) {
    const eventRef = db.collection('events').doc(eventId);
    await eventRef.set({
      title: ev.title,
      eventDate: Timestamp.fromDate(new Date(ev.eventDate)),
      status: ev.status,
      capacityMax: ev.capacityMax,
      capacityNearThresholdPercent: ev.capacityNearThresholdPercent,
      capacityStatus: ev.capacityStatus,
      pendingGuestRisk: ev.pendingGuestRisk,
      destinationName: ev.destinationName ?? null,
      generalNotes: ev.generalNotes ?? '',
      cutoffAt: ev.cutoffAt ? Timestamp.fromDate(new Date(ev.cutoffAt)) : null,
      lastCapacityAlertSentAt: ev.lastCapacityAlertSentAt
        ? Timestamp.fromDate(new Date(ev.lastCapacityAlertSentAt))
        : null,
      createdByAdminId: adminUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const [stopId, stop] of Object.entries(ev.stops)) {
      await eventRef.collection('stops').doc(stopId).set({
        name: stop.name,
        type: stop.type,
        sequence: stop.sequence,
        scheduledAt: stop.scheduledAt
          ? Timestamp.fromDate(new Date(stop.scheduledAt))
          : null,
        isActive: stop.isActive,
        location: stop.location ?? null,
        notes: stop.notes ?? '',
        updatedByUserId: adminUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  console.log('done. emulator seeded successfully.');
  console.log(
    `\nDemo admin: phone=${adminPhone}  uid=${adminUid} (admin claim set).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
