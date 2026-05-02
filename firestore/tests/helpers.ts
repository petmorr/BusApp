import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const TEST_PROJECT = 'supporters-bus-test';
export const FIRESTORE_HOST = '127.0.0.1';
export const FIRESTORE_PORT = 8088;

export async function makeTestEnv(): Promise<RulesTestEnvironment> {
  const rulesPath = resolve(__dirname, '..', 'rules', 'firestore.rules');
  return initializeTestEnvironment({
    projectId: TEST_PROJECT,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules: readFileSync(rulesPath, 'utf8'),
    },
  });
}

export interface UserSpec {
  uid: string;
  admin?: boolean;
  helper?: boolean;
}

export function authedDb(env: RulesTestEnvironment, user: UserSpec): RulesTestContext {
  const claims: Record<string, unknown> = {};
  if (user.admin) claims.admin = true;
  if (user.helper) claims.helper = true;
  return env.authenticatedContext(user.uid, claims);
}

export function unauthedDb(env: RulesTestEnvironment): RulesTestContext {
  return env.unauthenticatedContext();
}

export function memberUserLinkId(userId: string, memberId: string): string {
  return `${userId}_${memberId}`;
}
