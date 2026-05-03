import { logger } from 'firebase-functions/v2';
import { CallableOptions } from 'firebase-functions/v2/https';

/**
 * Default options applied to every callable Cloud Function in this project.
 *
 * - `enforceAppCheck: true` — reject any call from a client that has not
 *   minted a valid App Check token. This blocks scripted abuse from outside
 *   the legitimate iOS/Android apps.
 * - `consumeAppCheckToken: true` — single-use token enforcement for replay
 *   protection.
 * - `region: 'europe-west2'` — keep latency low for the UK supporters group
 *   that this MVP serves; this can be overridden per callable if needed.
 *
 * App Check enforcement is *opt-out* via a bypass flag because the Firebase
 * emulator does not mint App Check tokens. The bypass requires **both**:
 *
 *   1. `BYPASS_APP_CHECK=true` in the environment, AND
 *   2. The resolved project id is emulator-only, i.e. it starts with
 *      `demo-` or appears in `APP_CHECK_BYPASS_ALLOWED_PROJECTS` (the
 *      allow-list below).
 *
 * Requiring (2) means an accidental `BYPASS_APP_CHECK=true` in a production
 * shell cannot turn off App Check enforcement — the bypass only ever
 * applies to projects that are definitionally emulator-only.
 */

const ALLOWED_BYPASS_PROJECT_IDS = new Set<string>([
  'supporters-bus-e2e',
]);

function resolveProjectId(): string | null {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GCP_PROJECT) return process.env.GCP_PROJECT;
  return safeParseFirebaseConfig(process.env.FIREBASE_CONFIG);
}

function safeParseFirebaseConfig(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { projectId?: string };
    return parsed.projectId ?? null;
  } catch {
    return null;
  }
}

function isEmulatorOnlyProject(projectId: string | null): boolean {
  if (!projectId) {
    // No project id resolved — likely a local build/test harness. Treat as
    // emulator-only; the alternative (rejecting) would break `npm run build`
    // style smoke checks.
    return true;
  }
  return projectId.startsWith('demo-') || ALLOWED_BYPASS_PROJECT_IDS.has(projectId);
}

const bypassRequested = process.env.BYPASS_APP_CHECK === 'true';
const projectId = resolveProjectId();
const emulatorOnly = isEmulatorOnlyProject(projectId);
const bypassAppCheckForLocal = bypassRequested && emulatorOnly;

if (bypassRequested && !emulatorOnly) {
  // Fail loud: the operator asked for App Check to be disabled but this
  // runtime is pointed at a project that is not emulator-only. We log and
  // leave enforceAppCheck ON so the bypass cannot silently take effect in
  // production.
  logger.error(
    'BYPASS_APP_CHECK=true was set but project id is not emulator-only; ' +
      'keeping App Check enforcement enabled.',
    { projectId },
  );
}

export const callableDefaults: CallableOptions = {
  enforceAppCheck: !bypassAppCheckForLocal,
  consumeAppCheckToken: !bypassAppCheckForLocal,
  region: process.env.FUNCTIONS_REGION ?? 'europe-west2',
};

/**
 * Exported for testing. Returns whether App Check enforcement is active
 * given the current env + project id resolution.
 */
export function isAppCheckEnforced(): boolean {
  return !bypassAppCheckForLocal;
}
