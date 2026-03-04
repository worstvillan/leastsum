import { withGameApi } from '../_lib/game-api.js';
import { joinRoomService } from '../_lib/game-service.js';

export default withGameApi(async ({ payload, auth, roomCode }) => {
  return joinRoomService(auth.uid, payload.name, roomCode);
}, { requireMembership: false });
