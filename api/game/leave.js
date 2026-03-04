import { withGameApi } from '../_lib/game-api.js';
import { leaveService } from '../_lib/game-service.js';

export default withGameApi(async ({ auth, roomCode, memberPlayerId }) => {
  return leaveService(roomCode, memberPlayerId, auth.uid);
});
