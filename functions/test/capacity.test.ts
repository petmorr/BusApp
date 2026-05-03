import { calculateCapacity } from '../src/utils/capacity';

describe('calculateCapacity', () => {
  const base = {
    capacityMax: 50,
    capacityNearThresholdPercent: 90,
  };

  it('returns "under" when below the near-threshold', () => {
    const result = calculateCapacity({
      ...base,
      confirmedMemberSeats: 10,
      approvedGuestSeats: 0,
      pendingGuestSeats: 0,
    });
    expect(result.capacityStatus).toBe('under');
    expect(result.pendingGuestRisk).toBe(false);
    expect(result.approvedSeats).toBe(10);
    expect(result.potentialSeats).toBe(10);
    expect(result.nearLimit).toBe(45);
  });

  it('returns "near" when approved seats reach the threshold', () => {
    const result = calculateCapacity({
      ...base,
      confirmedMemberSeats: 45,
      approvedGuestSeats: 0,
      pendingGuestSeats: 0,
    });
    expect(result.capacityStatus).toBe('near');
  });

  it('returns "at" when approved seats equal capacity', () => {
    const result = calculateCapacity({
      ...base,
      confirmedMemberSeats: 49,
      approvedGuestSeats: 1,
      pendingGuestSeats: 0,
    });
    expect(result.capacityStatus).toBe('at');
  });

  it('returns "over" when approved seats exceed capacity', () => {
    const result = calculateCapacity({
      ...base,
      confirmedMemberSeats: 49,
      approvedGuestSeats: 5,
      pendingGuestSeats: 0,
    });
    expect(result.capacityStatus).toBe('over');
  });

  it('flags pendingGuestRisk when pending guests would exceed capacity', () => {
    const result = calculateCapacity({
      ...base,
      confirmedMemberSeats: 48,
      approvedGuestSeats: 0,
      pendingGuestSeats: 5,
    });
    expect(result.capacityStatus).toBe('near');
    expect(result.pendingGuestRisk).toBe(true);
    expect(result.potentialSeats).toBe(53);
  });

  it('does NOT flag pendingGuestRisk when potentialSeats equals capacityMax exactly', () => {
    const result = calculateCapacity({
      ...base,
      confirmedMemberSeats: 48,
      approvedGuestSeats: 0,
      pendingGuestSeats: 2, // 48 + 2 = 50 === capacityMax, not >
    });
    expect(result.pendingGuestRisk).toBe(false);
    expect(result.potentialSeats).toBe(50);
  });

  it('returns "under" with no risk when all seats are zero', () => {
    const result = calculateCapacity({
      ...base,
      confirmedMemberSeats: 0,
      approvedGuestSeats: 0,
      pendingGuestSeats: 0,
    });
    expect(result.capacityStatus).toBe('under');
    expect(result.pendingGuestRisk).toBe(false);
    expect(result.approvedSeats).toBe(0);
    expect(result.potentialSeats).toBe(0);
  });

  it('uses Math.ceil for nearLimit so fractional thresholds round up', () => {
    // 33% of 10 = 3.3, Math.ceil => 4. Approved = 3 → under; 4 → near.
    const opts = { capacityMax: 10, capacityNearThresholdPercent: 33 };
    const under = calculateCapacity({
      ...opts,
      confirmedMemberSeats: 3,
      approvedGuestSeats: 0,
      pendingGuestSeats: 0,
    });
    expect(under.capacityStatus).toBe('under');
    expect(under.nearLimit).toBe(4);

    const near = calculateCapacity({
      ...opts,
      confirmedMemberSeats: 4,
      approvedGuestSeats: 0,
      pendingGuestSeats: 0,
    });
    expect(near.capacityStatus).toBe('near');
  });

  it('exposes confirmedMemberSeats and approvedGuestSeats in the result', () => {
    const result = calculateCapacity({
      ...base,
      confirmedMemberSeats: 20,
      approvedGuestSeats: 5,
      pendingGuestSeats: 3,
    });
    expect(result.confirmedMemberSeats).toBe(20);
    expect(result.approvedGuestSeats).toBe(5);
    expect(result.pendingGuestSeats).toBe(3);
  });
});
