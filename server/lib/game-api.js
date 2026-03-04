import { ApiError, handleApi } from './http.js';
import { assertRoomCode, requireAuthContext, requireRoomMember } from './auth.js';

export function withGameApi(handler, options = {}) {
  const { requireMembership = true, requireRoomCode = true } = options;

  return async function routeHandler(req, res) {
    return handleApi(req, res, async (payload) => {
      const auth = await requireAuthContext(req);
      const roomCode = requireRoomCode ? assertRoomCode(payload.roomCode) : null;

      let memberPlayerId = null;
      if (requireMembership) {
        if (!roomCode) {
          throw new ApiError(400, 'roomCode is required.');
        }
        memberPlayerId = await requireRoomMember(roomCode, auth.uid);
      }

      return handler({ payload, auth, roomCode, memberPlayerId });
    });
  };
}
