import { withGameApi } from '../_lib/game-api.js';
import { updateConfigService } from '../_lib/game-service.js';

export default withGameApi(async ({ payload, roomCode, memberPlayerId }) => {
  return updateConfigService(roomCode, memberPlayerId, payload.config || {});
});
