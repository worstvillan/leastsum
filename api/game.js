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

const RATE_LIMIT_WINDOW_MS = 60_000;
const JOIN_MAX_ATTEMPTS = 12;
const RECLAIM_MAX_ATTEMPTS = 60;
const actionBuckets = new Map();

function readClientIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  const xri = req.headers?.['x-real-ip'];
  if (typeof xri === 'string' && xri.trim()) {
    return xri.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function enforceJoinReclaimRateLimit(req, uid, action) {
  if (action !== 'join' && action !== 'reclaim') return;

  const maxAttempts = action === 'join' ? JOIN_MAX_ATTEMPTS : RECLAIM_MAX_ATTEMPTS;
  const now = Date.now();
  const key = `${action}:${uid}:${readClientIp(req)}`;
  const current = actionBuckets.get(key) || [];
  const fresh = current.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (fresh.length >= maxAttempts) {
    if (action === 'reclaim') {
      throw new ApiError(429, 'Too many restore attempts. Please wait a minute and try again.');
    }
    throw new ApiError(429, 'Too many join attempts. Please wait a minute and try again.');
  }

  fresh.push(now);
  actionBuckets.set(key, fresh);

  if (actionBuckets.size > 5000) {
    for (const [bucketKey, bucket] of actionBuckets.entries()) {
      const keep = bucket.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
      if (keep.length === 0) {
        actionBuckets.delete(bucketKey);
      } else if (keep.length !== bucket.length) {
        actionBuckets.set(bucketKey, keep);
      }
    }
  }
}

async function requireMemberActionContext(payload, auth) {
  const roomCode = assertRoomCode(payload.roomCode);
  const memberPlayerId = await requireRoomMember(roomCode, auth.uid);
  return { roomCode, memberPlayerId };
}

export default async function handler(req, res) {
  return handleApi(req, res, async (payload) => {
    const auth = await requireAuthContext(req);
    const action = String(payload.action || '').trim();
    enforceJoinReclaimRateLimit(req, auth.uid, action);

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
