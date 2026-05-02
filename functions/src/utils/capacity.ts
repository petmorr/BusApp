import { CapacityStatus } from '../types/domain';

export interface CapacityInputs {
  confirmedMemberSeats: number;
  approvedGuestSeats: number;
  pendingGuestSeats: number;
  capacityMax: number;
  capacityNearThresholdPercent: number;
}

export interface CapacityResult {
  confirmedMemberSeats: number;
  approvedGuestSeats: number;
  pendingGuestSeats: number;
  approvedSeats: number;
  potentialSeats: number;
  capacityStatus: CapacityStatus;
  pendingGuestRisk: boolean;
  nearLimit: number;
}

export function calculateCapacity(input: CapacityInputs): CapacityResult {
  const {
    confirmedMemberSeats,
    approvedGuestSeats,
    pendingGuestSeats,
    capacityMax,
    capacityNearThresholdPercent,
  } = input;

  const approvedSeats = confirmedMemberSeats + approvedGuestSeats;
  const potentialSeats = approvedSeats + pendingGuestSeats;
  const nearLimit = Math.ceil(
    (capacityMax * capacityNearThresholdPercent) / 100,
  );

  let capacityStatus: CapacityStatus;
  if (approvedSeats > capacityMax) {
    capacityStatus = 'over';
  } else if (approvedSeats === capacityMax) {
    capacityStatus = 'at';
  } else if (approvedSeats >= nearLimit) {
    capacityStatus = 'near';
  } else {
    capacityStatus = 'under';
  }

  const pendingGuestRisk = potentialSeats > capacityMax;

  return {
    confirmedMemberSeats,
    approvedGuestSeats,
    pendingGuestSeats,
    approvedSeats,
    potentialSeats,
    capacityStatus,
    pendingGuestRisk,
    nearLimit,
  };
}
