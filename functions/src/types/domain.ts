import { Timestamp } from 'firebase-admin/firestore';

export type MemberStatus = 'pending' | 'active' | 'rejected' | 'inactive';
export type EventStatus = 'draft' | 'open' | 'closed' | 'completed' | 'cancelled';
export type CapacityStatus = 'under' | 'near' | 'at' | 'over';
export type StopType =
  | 'outbound_pickup'
  | 'event_dropoff'
  | 'event_pickup'
  | 'return_dropoff';
export type MemberResponseStatus = 'attending' | 'not_attending';
export type GuestRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LinkStatus = 'pending' | 'active' | 'inactive' | 'rejected';

export interface UserDoc {
  phoneE164: string;
  displayName?: string;
  roles: Array<'user' | 'helper' | 'admin'>;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
}

export interface MemberDoc {
  firstName: string;
  lastName: string;
  displayName: string;
  primaryPhoneE164: string;
  memberNumber?: string;
  status: MemberStatus;
  generalNotes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemberUserLinkDoc {
  userId: string;
  memberId: string;
  status: LinkStatus;
  relationshipToUser: 'self' | 'child' | 'dependent' | 'other';
  requestedDuringSignup: boolean;
  createdByAdminId: string | null;
  approvedByAdminId: string | null;
  approvedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventDoc {
  title: string;
  eventDate: Timestamp;
  status: EventStatus;
  capacityMax: number;
  capacityNearThresholdPercent: number;
  cutoffAt: Timestamp | null;
  destinationName?: string;
  generalNotes?: string;
  parkedBusLocation?: {
    lat: number;
    lng: number;
    label?: string;
    notes?: string;
    updatedByUserId: string;
    updatedAt: Timestamp;
  };
  capacityStatus: CapacityStatus;
  pendingGuestRisk: boolean;
  capacityConfirmedMemberSeats?: number;
  capacityApprovedGuestSeats?: number;
  capacityPendingGuestSeats?: number;
  capacityApprovedTotal?: number;
  capacityPotentialTotal?: number;
  capacityLastCalculatedAt?: Timestamp;
  lastCapacityAlertSentAt: Timestamp | null;
  createdByAdminId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StopDoc {
  name: string;
  type: StopType;
  sequence: number;
  scheduledAt: Timestamp | null;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
  notes?: string;
  isActive: boolean;
  updatedByUserId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MemberResponseDoc {
  memberId: string;
  respondingUserId: string;
  status: MemberResponseStatus;
  outboundPickupStopId: string | null;
  returnDropoffStopId: string | null;
  generalNotes?: string;
  isAdminOverride: boolean;
  overriddenByAdminId: string | null;
  // Denormalised fields for collection-group queries.
  eventId: string;
  eventTitle: string;
  eventDate: Timestamp;
  memberDisplayName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GuestRequestDoc {
  guestName: string;
  requestedByUserId: string;
  linkedMemberId: string | null;
  initialPickupStopId: string;
  status: GuestRequestStatus;
  decisionByAdminId: string | null;
  decisionAt: Timestamp | null;
  generalNotes?: string;
  eventId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type NotificationType =
  | 'attendance_request'
  | 'attendance_reminder'
  | 'pending_guest_reminder'
  | 'guest_approved'
  | 'guest_rejected'
  | 'capacity_alert'
  | 'operational_update';

export interface NotificationDoc {
  eventId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  targetUserIds: string[];
  sentByUserId: string;
  status: 'queued' | 'sent' | 'partial_failure' | 'failed';
  data?: Record<string, string>;
  createdAt: Timestamp;
  sentAt: Timestamp | null;
}
