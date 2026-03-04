import { AccessToken } from 'livekit-server-sdk';
import { ApiError, handleApi } from '../server/lib/http.js';
import { assertRoomCode, requireAuthContext, requireRoomMember } from '../server/lib/auth.js';
import { adminGet } from '../server/lib/firebase-rest.js';

const DEFAULT_TTL_SECONDS = 900;

function resolveTtlSeconds() {
  const raw = Number.parseInt(process.env.LIVEKIT_TOKEN_TTL_SECONDS ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(raw, 3600);
}

function requireLiveKitConfig() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    throw new ApiError(500, 'Missing LIVEKIT_API_KEY, LIVEKIT_API_SECRET, or LIVEKIT_URL');
  }

  return { apiKey, apiSecret, livekitUrl };
}

async function buildLiveKitToken({ roomCode, identity, displayName }) {
  const { apiKey, apiSecret, livekitUrl } = requireLiveKitConfig();
  const ttlSeconds = resolveTtlSeconds();

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: displayName,
    ttl: ttlSeconds,
  });

  token.addGrant({
    roomJoin: true,
    room: roomCode,
    canPublish: true,
    canSubscribe: true,
  });

  return {
    token: await token.toJwt(),
    url: livekitUrl,
    expiresIn: ttlSeconds,
  };
}

export default async function handler(req, res) {
  return handleApi(req, res, async (payload) => {
    const auth = await requireAuthContext(req);
    const roomCode = assertRoomCode(payload.roomName || payload.roomCode);

    const playerId = await requireRoomMember(roomCode, auth.uid);
    const player = await adminGet(`roomsV2/${roomCode}/public/players/${playerId}`);
    if (!player || typeof player !== 'object') {
      throw new ApiError(403, 'Room membership is invalid.');
    }

    const displayName = String(player.name || 'Player').slice(0, 32);
    const identity = `${roomCode}:${playerId}`;

    return buildLiveKitToken({ roomCode, identity, displayName });
  });
}
