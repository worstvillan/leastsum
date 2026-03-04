import { withGameApi } from '../_lib/game-api.js';
import { reclaimRoomService } from '../_lib/game-service.js';

export default withGameApi(async ({ payload, auth, roomCode }) => {
  return reclaimRoomService(auth.uid, roomCode, payload.name);
}, { requireMembership: false });
