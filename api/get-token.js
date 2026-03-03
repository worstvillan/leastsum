import { AccessToken } from 'livekit-server-sdk';

const ROOM_NAME_PATTERN = /^[A-Za-z0-9_-]{2,32}$/;
const PARTICIPANT_NAME_PATTERN = /^.{1,32}$/;
const PARTICIPANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_TTL_SECONDS = 900;
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://naredlarohithreddy.github.io',
];

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return new Set(DEFAULT_ALLOWED_ORIGINS);
  const values = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return new Set(values.length > 0 ? values : DEFAULT_ALLOWED_ORIGINS);
}

function setCorsHeaders(res, origin, allowedOrigins) {
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function json(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (typeof body === 'object') return body;
  return null;
}

function resolveTtlSeconds() {
  const raw = Number.parseInt(process.env.LIVEKIT_TOKEN_TTL_SECONDS ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(raw, 3600);
}

async function createToken({ roomName, participantName, participantId }) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    throw new Error('Missing LIVEKIT_API_KEY, LIVEKIT_API_SECRET, or LIVEKIT_URL');
  }

  const identitySuffix = participantId || participantName;
  const identity = `${roomName}:${identitySuffix}`;
  const ttlSeconds = resolveTtlSeconds();

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: participantName,
    ttl: ttlSeconds,
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
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
  const method = req.method?.toUpperCase();
  const origin = req.headers?.origin;
  const allowedOrigins = getAllowedOrigins();

  if (origin && !allowedOrigins.has(origin)) {
    return json(res, 403, { error: 'Origin not allowed' });
  }

  setCorsHeaders(res, origin, allowedOrigins);

  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  const payload = parseBody(req.body);
  if (!payload) {
    return json(res, 400, { error: 'Invalid JSON body' });
  }

  const roomName = toTrimmedString(payload.roomName);
  const participantName = toTrimmedString(payload.participantName);
  const participantId = toTrimmedString(payload.participantId);

  if (!ROOM_NAME_PATTERN.test(roomName)) {
    return json(res, 400, {
      error: 'roomName is required (2-32 chars, alphanumeric, "_" or "-")',
    });
  }

  if (!PARTICIPANT_NAME_PATTERN.test(participantName)) {
    return json(res, 400, { error: 'participantName is required (1-32 chars)' });
  }

  if (participantId && !PARTICIPANT_ID_PATTERN.test(participantId)) {
    return json(res, 400, {
      error: 'participantId must be 1-64 chars (alphanumeric, "_" or "-")',
    });
  }

  try {
    const result = await createToken({ roomName, participantName, participantId });
    return json(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token generation failed';
    return json(res, 500, { error: message });
  }
}
