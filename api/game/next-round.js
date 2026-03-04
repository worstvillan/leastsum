import { withGameApi } from '../_lib/game-api.js';
import { nextRoundService } from '../_lib/game-service.js';

export default withGameApi(async ({ roomCode, memberPlayerId }) => {
  return nextRoundService(roomCode, memberPlayerId);
});
