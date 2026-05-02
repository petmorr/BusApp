module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testTimeout: 60000,
  // Tests share the same emulator process; running serially keeps Firestore
  // / Auth state predictable per test file.
  maxWorkers: 1,
};
