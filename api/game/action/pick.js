import { ApiError } from '../../_lib/http.js';
import { withGameApi } from '../../_lib/game-api.js';
import { pickService } from '../../_lib/game-service.js';

export default withGameApi(async ({ payload, roomCode, memberPlayerId }) => {
  const source = payload.source === 'previous' ? 'previous' : payload.source === 'deck' ? 'deck' : null;
  if (!source) {
    throw new ApiError(400, 'Pick source must be "deck" or "previous".');
  }
  return pickService(roomCode, memberPlayerId, source);
});
