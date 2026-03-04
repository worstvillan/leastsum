import { withGameApi } from '../../_lib/game-api.js';
import { knockService } from '../../_lib/game-service.js';

export default withGameApi(async ({ roomCode, memberPlayerId }) => {
  return knockService(roomCode, memberPlayerId);
});
