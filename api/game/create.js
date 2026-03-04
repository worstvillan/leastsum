import { withGameApi } from '../_lib/game-api.js';
import { createRoomService } from '../_lib/game-service.js';

export default withGameApi(async ({ payload, auth }) => {
  return createRoomService(auth.uid, payload.name);
}, { requireMembership: false, requireRoomCode: false });
