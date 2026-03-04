import { ApiError } from './http.js';
import { adminGet } from './firebase-rest.js';

const ROOM_CODE_PATTERN = /^[A-Z0-9]{4}$/;

function readApiKey() {
  return process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
}

function parseBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== 'string') return '';
  const [scheme, value] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return '';
  return value.trim();
}

export function assertRoomCode(roomCode) {
  const value = String(roomCode || '').trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(value)) {
    throw new ApiError(400, 'Invalid room code.');
  }
  return value;
}

export async function verifyFirebaseIdToken(idToken) {
  const apiKey = readApiKey();
  if (!apiKey) {
    throw new Error('Missing FIREBASE_WEB_API_KEY (or VITE_FIREBASE_API_KEY)');
  }

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(401, `Invalid auth token: ${text}`);
  }

  const data = await res.json();
  const user = Array.isArray(data?.users) ? data.users[0] : null;
  if (!user?.localId) {
    throw new ApiError(401, 'Invalid auth token.');
  }

  return {
    uid: user.localId,
    isAnonymous: user.providerUserInfo == null || user.providerUserInfo.length === 0,
  };
}

export async function requireAuthContext(req) {
  const idToken = parseBearerToken(req);
  if (!idToken) {
    throw new ApiError(401, 'Missing bearer auth token.');
  }

  const auth = await verifyFirebaseIdToken(idToken);
  return {
    ...auth,
    idToken,
  };
}

export async function requireRoomMember(roomCode, uid) {
  const playerId = await adminGet(`roomsV2/${roomCode}/meta/members/${uid}`);
  if (!playerId || typeof playerId !== 'string') {
    throw new ApiError(403, 'You are not a member of this room.');
  }
  return playerId;
}

export async function getRoomMembership(roomCode, uid) {
  const playerId = await adminGet(`roomsV2/${roomCode}/meta/members/${uid}`);
  return typeof playerId === 'string' ? playerId : null;
}
