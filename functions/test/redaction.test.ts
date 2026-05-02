import { redactForAudit } from '../src/utils/redaction';

describe('redactForAudit', () => {
  it('masks phone numbers to country code + last 2', () => {
    const out = redactForAudit({ primaryPhoneE164: '+447700900123' });
    expect(out.primaryPhoneE164).toBe('+447***23');
  });

  it('returns a stable marker for short phones', () => {
    const out = redactForAudit({ primaryPhoneE164: '12' });
    expect(out.primaryPhoneE164).toBe('«phone:short»');
  });

  it('replaces names with a length-only marker', () => {
    const out = redactForAudit({
      firstName: 'John',
      lastName: 'Smith',
      displayName: 'John Smith',
      memberDisplayName: 'John Smith',
      guestName: 'Jane Guest',
    });
    expect(out).toEqual({
      firstName: '«name:len=4»',
      lastName: '«name:len=5»',
      displayName: '«name:len=10»',
      memberDisplayName: '«name:len=10»',
      guestName: '«name:len=10»',
    });
  });

  it('replaces free-text notes / addresses with a length marker', () => {
    const out = redactForAudit({
      generalNotes: 'wheelchair access required',
      notes: 'park under bridge',
      address: '1 Main St, Glasgow',
      label: 'Car Park B',
    });
    expect(out).toEqual({
      generalNotes: '«text:len=26»',
      notes: '«text:len=17»',
      address: '«text:len=18»',
      label: '«text:len=10»',
    });
  });

  it('rounds lat/lng to ~1km grid (2 dp)', () => {
    const out = redactForAudit({
      parkedBusLocation: { lat: 55.860916, lng: -4.251433 },
      location: { lat: 55.864237, lng: -4.251806 },
    });
    expect(out.parkedBusLocation).toEqual({ lat: 55.86, lng: -4.25 });
    expect(out.location).toEqual({ lat: 55.86, lng: -4.25 });
  });

  it('passes unknown fields through unchanged', () => {
    const input = {
      eventId: 'event1',
      capacityMax: 50,
      status: 'pending',
      nested: { eventTitle: 'Match', isAdminOverride: false },
    };
    expect(redactForAudit(input)).toEqual(input);
  });

  it('is idempotent', () => {
    const once = redactForAudit({
      primaryPhoneE164: '+447700900123',
      guestName: 'Jane',
    });
    const twice = redactForAudit(once);
    expect(twice).toEqual(once);
  });

  it('redacts inside arrays', () => {
    const out = redactForAudit({
      members: [
        { displayName: 'A B', primaryPhoneE164: '+447700900111' },
        { displayName: 'C D', primaryPhoneE164: '+447700900222' },
      ],
    });
    expect(out.members[0]).toEqual({
      displayName: '«name:len=3»',
      primaryPhoneE164: '+447***11',
    });
  });

  it('handles null and undefined safely', () => {
    expect(redactForAudit(null)).toBeNull();
    expect(redactForAudit(undefined)).toBeUndefined();
    expect(redactForAudit({ a: null, b: undefined })).toEqual({ a: null, b: undefined });
  });
});
