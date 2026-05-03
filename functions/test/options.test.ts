/**
 * Verifies the App Check bypass matrix. The module reads env vars at
 * import time so we reset modules + env between scenarios.
 */

describe('callableDefaults App Check bypass', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BYPASS_APP_CHECK;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GCP_PROJECT;
    delete process.env.FIREBASE_CONFIG;
    jest.doMock('firebase-functions/v2', () => ({
      logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    }));
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function load(): typeof import('../src/utils/options') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../src/utils/options') as typeof import('../src/utils/options');
  }

  it('enforces App Check by default (no bypass env)', () => {
    const mod = load();
    expect(mod.isAppCheckEnforced()).toBe(true);
    expect(mod.callableDefaults.enforceAppCheck).toBe(true);
    expect(mod.callableDefaults.consumeAppCheckToken).toBe(true);
  });

  it('bypasses App Check for demo-* projects when BYPASS_APP_CHECK=true', () => {
    process.env.BYPASS_APP_CHECK = 'true';
    process.env.GCLOUD_PROJECT = 'demo-supporters-bus';
    const mod = load();
    expect(mod.isAppCheckEnforced()).toBe(false);
  });

  it('bypasses App Check for allow-listed project ids', () => {
    process.env.BYPASS_APP_CHECK = 'true';
    process.env.GCLOUD_PROJECT = 'supporters-bus-e2e';
    const mod = load();
    expect(mod.isAppCheckEnforced()).toBe(false);
  });

  it('DOES NOT bypass App Check for non-emulator project ids, even with BYPASS_APP_CHECK=true', () => {
    process.env.BYPASS_APP_CHECK = 'true';
    process.env.GCLOUD_PROJECT = 'supporters-bus-prod';
    const mod = load();
    expect(mod.isAppCheckEnforced()).toBe(true);
  });

  it('DOES NOT bypass App Check when BYPASS_APP_CHECK is unset', () => {
    process.env.GCLOUD_PROJECT = 'demo-supporters-bus';
    const mod = load();
    expect(mod.isAppCheckEnforced()).toBe(true);
  });

  it('treats a missing project id as emulator-only (avoids breaking local builds)', () => {
    process.env.BYPASS_APP_CHECK = 'true';
    const mod = load();
    expect(mod.isAppCheckEnforced()).toBe(false);
  });

  it('falls back to FIREBASE_CONFIG.projectId when GCLOUD_PROJECT is unset', () => {
    process.env.BYPASS_APP_CHECK = 'true';
    process.env.FIREBASE_CONFIG = JSON.stringify({
      projectId: 'supporters-bus-prod',
    });
    const mod = load();
    // Non-emulator project id → bypass must be ignored.
    expect(mod.isAppCheckEnforced()).toBe(true);
  });
});
