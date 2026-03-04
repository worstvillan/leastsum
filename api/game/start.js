import { withGameApi } from '../_lib/game-api.js';
import { startGameService } from '../_lib/game-service.js';

export default withGameApi(async ({ roomCode, memberPlayerId }) => {
  return startGameService(roomCode, memberPlayerId);
});
