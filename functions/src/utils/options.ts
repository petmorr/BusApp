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
 * App Check enforcement is *opt-out* via `bypassAppCheckForLocal` because the
 * Firebase emulator does not mint App Check tokens. Production deploys
 * never set the bypass; integration / local testing flips it on via the
 * BYPASS_APP_CHECK environment variable.
 */
const bypassAppCheckForLocal = process.env.BYPASS_APP_CHECK === 'true';

export const callableDefaults: CallableOptions = {
  enforceAppCheck: !bypassAppCheckForLocal,
  consumeAppCheckToken: !bypassAppCheckForLocal,
  region: process.env.FUNCTIONS_REGION ?? 'europe-west2',
};
