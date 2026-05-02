import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export {
  onMemberResponseWrite,
  onGuestRequestWrite,
  onEventCapacityWrite,
} from './triggers/capacityTriggers';

export {
  approveGuestRequest,
  rejectGuestRequest,
} from './callables/guestApproval';

export {
  sendAttendanceRequest,
  sendAttendanceReminder,
  sendPendingGuestReminder,
  sendOperationalUpdate,
} from './callables/notifications';

export {
  updateParkedBusLocation,
} from './callables/parkedBusLocation';

export {
  assignEventHelper,
  unassignEventHelper,
} from './callables/helperAssignment';

export {
  setUserRole,
  approveMemberUserLink,
  rejectMemberUserLink,
} from './callables/admin';
