import { withGameApi } from '../_lib/game-api.js';
import { playAgainService } from '../_lib/game-service.js';

export default withGameApi(async ({ roomCode, memberPlayerId }) => {
  return playAgainService(roomCode, memberPlayerId);
});
