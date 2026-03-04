import { assertRoomCode, requireAuthContext, requireRoomMember } from '../server/lib/auth.js';
import {
  createRoomService,
  joinRoomService,
  knockService,
  leaveService,
  nextRoundService,
  pickService,
  playAgainService,
  reclaimRoomService,
  startGameService,
  throwService,
  timeoutService,
  updateConfigService,
} from '../server/lib/game-service.js';
import { ApiError, handleApi } from '../server/lib/http.js';

async function requireMemberActionContext(payload, auth) {
  const roomCode = assertRoomCode(payload.roomCode);
  const memberPlayerId = await requireRoomMember(roomCode, auth.uid);
  return { roomCode, memberPlayerId };
}

export default async function handler(req, res) {
  return handleApi(req, res, async (payload) => {
    const auth = await requireAuthContext(req);
    const action = String(payload.action || '').trim();

    switch (action) {
      case 'create': {
        return createRoomService(auth.uid, payload.name);
      }

      case 'join': {
        const roomCode = assertRoomCode(payload.roomCode);
        return joinRoomService(auth.uid, payload.name, roomCode);
      }

      case 'reclaim': {
        const roomCode = assertRoomCode(payload.roomCode);
        return reclaimRoomService(auth.uid, roomCode, payload.name);
      }

      case 'start': {
        const { roomCode, memberPlayerId } = await requireMemberActionContext(payload, auth);
        return startGameService(roomCode, memberPlayerId);
      }

      case 'updateConfig': {
        const { roomCode, memberPlayerId } = await requireMemberActionContext(payload, auth);
        return updateConfigService(roomCode, memberPlayerId, payload.config || {});
      }

      case 'throw': {
        const { roomCode, memberPlayerId } = await requireMemberActionContext(payload, auth);
        const indices = Array.isArray(payload.indices) ? payload.indices : [];
        return throwService(roomCode, memberPlayerId, indices);
      }

      case 'pick': {
        const { roomCode, memberPlayerId } = await requireMemberActionContext(payload, auth);
        const source = payload.source === 'deck' || payload.source === 'previous' ? payload.source : null;
        if (!source) {
          throw new ApiError(400, 'Pick source must be "deck" or "previous".');
        }
        return pickService(roomCode, memberPlayerId, source);
      }

      case 'knock': {
        const { roomCode, memberPlayerId } = await requireMemberActionContext(payload, auth);
        return knockService(roomCode, memberPlayerId);
      }

      case 'timeout': {
        const { roomCode, memberPlayerId } = await requireMemberActionContext(payload, auth);
        return timeoutService(roomCode, memberPlayerId);
      }

      case 'leave': {
        const { roomCode, memberPlayerId } = await requireMemberActionContext(payload, auth);
        return leaveService(roomCode, memberPlayerId, auth.uid);
      }

      case 'nextRound': {
        const { roomCode, memberPlayerId } = await requireMemberActionContext(payload, auth);
        return nextRoundService(roomCode, memberPlayerId);
      }

      case 'playAgain': {
        const { roomCode, memberPlayerId } = await requireMemberActionContext(payload, auth);
        return playAgainService(roomCode, memberPlayerId);
      }

      default:
        throw new ApiError(400, 'Invalid game action.');
    }
  });
}
