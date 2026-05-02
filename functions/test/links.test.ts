import {
  isCanonicalLinkId,
  memberUserLinkId,
  parseMemberUserLinkId,
} from '../src/utils/links';

describe('memberUserLinkId schema invariants', () => {
  it('formats the canonical id as `${userId}_${memberId}`', () => {
    expect(memberUserLinkId('user1', 'member1')).toBe('user1_member1');
  });

  it('rejects empty userId or memberId', () => {
    expect(() => memberUserLinkId('', 'm')).toThrow();
    expect(() => memberUserLinkId('u', '')).toThrow();
  });

  it('rejects ids that contain an underscore (would collide)', () => {
    expect(() => memberUserLinkId('user_1', 'member1')).toThrow();
    expect(() => memberUserLinkId('user1', 'member_1')).toThrow();
  });

  it('isCanonicalLinkId matches only the exact `${userId}_${memberId}`', () => {
    expect(isCanonicalLinkId('u1_m1', 'u1', 'm1')).toBe(true);
    expect(isCanonicalLinkId('u1_m1', 'u1', 'm2')).toBe(false);
    expect(isCanonicalLinkId('u1m1', 'u1', 'm1')).toBe(false);
    expect(isCanonicalLinkId('u1__m1', 'u1', 'm1')).toBe(false);
  });

  it('parses canonical ids back into their parts', () => {
    expect(parseMemberUserLinkId('u1_m1')).toEqual({
      userId: 'u1',
      memberId: 'm1',
    });
    expect(parseMemberUserLinkId('user-abc_member-xyz')).toEqual({
      userId: 'user-abc',
      memberId: 'member-xyz',
    });
  });

  it('returns null for ids that lack a separator', () => {
    expect(parseMemberUserLinkId('nounderscore')).toBeNull();
    expect(parseMemberUserLinkId('_leading')).toBeNull();
    expect(parseMemberUserLinkId('trailing_')).toBeNull();
  });
});
