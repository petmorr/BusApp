import {
  requireAuth,
  requireAdmin,
  requireAdminOrHelperFor,
} from '../src/utils/auth';

/** Minimal fake CallableRequest for testing auth helpers. */
function fakeReq(auth: unknown): { auth: unknown; data: unknown } {
  return { auth, data: {} };
}

describe('requireAuth', () => {
  it('throws unauthenticated when req.auth is absent', () => {
    expect(() => requireAuth(fakeReq(undefined) as any)).toThrow(
      expect.objectContaining({ code: 'unauthenticated' }),
    );
  });

  it('throws unauthenticated when req.auth is null', () => {
    expect(() => requireAuth(fakeReq(null) as any)).toThrow(
      expect.objectContaining({ code: 'unauthenticated' }),
    );
  });

  it('returns uid and token when auth is present', () => {
    const token = { admin: false, helper: false };
    const result = requireAuth(
      fakeReq({ uid: 'user-1', token }) as any,
    );
    expect(result.uid).toBe('user-1');
    expect(result.token).toBe(token);
  });
});

describe('requireAdmin', () => {
  it('throws permission-denied when the token has no admin claim', () => {
    expect(() =>
      requireAdmin(fakeReq({ uid: 'u1', token: { admin: false } }) as any),
    ).toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('throws permission-denied when admin claim is missing entirely', () => {
    expect(() =>
      requireAdmin(fakeReq({ uid: 'u1', token: {} }) as any),
    ).toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('returns uid when admin claim is true', () => {
    const result = requireAdmin(
      fakeReq({ uid: 'admin-1', token: { admin: true } }) as any,
    );
    expect(result.uid).toBe('admin-1');
  });

  it('throws unauthenticated when not signed in', () => {
    expect(() => requireAdmin(fakeReq(null) as any)).toThrow(
      expect.objectContaining({ code: 'unauthenticated' }),
    );
  });
});

describe('requireAdminOrHelperFor', () => {
  it('allows admins regardless of isAssignedHelper', () => {
    const result = requireAdminOrHelperFor(
      fakeReq({ uid: 'a1', token: { admin: true } }) as any,
      false,
    );
    expect(result.uid).toBe('a1');
    expect(result.isAdmin).toBe(true);
  });

  it('allows helpers who are assigned to the event', () => {
    const result = requireAdminOrHelperFor(
      fakeReq({ uid: 'h1', token: { admin: false, helper: true } }) as any,
      true,
    );
    expect(result.uid).toBe('h1');
    expect(result.isAdmin).toBe(false);
  });

  it('throws permission-denied for a helper who is NOT assigned', () => {
    expect(() =>
      requireAdminOrHelperFor(
        fakeReq({ uid: 'h2', token: { admin: false, helper: true } }) as any,
        false,
      ),
    ).toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('throws permission-denied for a plain user (no helper or admin claim)', () => {
    expect(() =>
      requireAdminOrHelperFor(
        fakeReq({ uid: 'u1', token: {} }) as any,
        true,
      ),
    ).toThrow(expect.objectContaining({ code: 'permission-denied' }));
  });

  it('throws unauthenticated when not signed in', () => {
    expect(() =>
      requireAdminOrHelperFor(fakeReq(null) as any, true),
    ).toThrow(expect.objectContaining({ code: 'unauthenticated' }));
  });
});
