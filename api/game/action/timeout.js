import { withGameApi } from '../../_lib/game-api.js';
import { timeoutService } from '../../_lib/game-service.js';

export default withGameApi(async ({ roomCode, memberPlayerId }) => {
  return timeoutService(roomCode, memberPlayerId);
});
