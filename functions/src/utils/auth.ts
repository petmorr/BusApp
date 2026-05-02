import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';

export function requireAuth(req: CallableRequest<unknown>): { uid: string; token: NonNullable<CallableRequest<unknown>['auth']>['token'] } {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  return { uid: req.auth.uid, token: req.auth.token };
}

export function requireAdmin(req: CallableRequest<unknown>): { uid: string } {
  const { uid, token } = requireAuth(req);
  if (token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin role required.');
  }
  return { uid };
}

export function requireAdminOrHelperFor(
  req: CallableRequest<unknown>,
  isAssignedHelper: boolean,
): { uid: string; isAdmin: boolean } {
  const { uid, token } = requireAuth(req);
  const isAdmin = token.admin === true;
  if (isAdmin) return { uid, isAdmin: true };
  if (token.helper === true && isAssignedHelper) return { uid, isAdmin: false };
  throw new HttpsError(
    'permission-denied',
    'Admin or assigned helper role required.',
  );
}
