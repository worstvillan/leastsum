import { withGameApi } from '../../_lib/game-api.js';
import { throwService } from '../../_lib/game-service.js';

export default withGameApi(async ({ payload, roomCode, memberPlayerId }) => {
  return throwService(roomCode, memberPlayerId, payload.indices || []);
});
