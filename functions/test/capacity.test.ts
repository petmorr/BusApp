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
});
