import crypto from 'crypto';

const ENC_VERSION = 1;
let cachedKey = null;

function readKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.GAME_STATE_ENC_KEY_B64;
  if (!raw) {
    throw new Error('Missing GAME_STATE_ENC_KEY_B64');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('GAME_STATE_ENC_KEY_B64 must decode to exactly 32 bytes');
  }
  cachedKey = key;
  return key;
}

function aadFor(roomCode, version = 2) {
  return `leastsum|room:${roomCode}|version:${version}`;
}

export function encryptEngineState(roomCode, state, version = 2) {
  const key = readKey();
  const iv = crypto.randomBytes(12);
  const aad = aadFor(roomCode, version);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));

  const plaintext = Buffer.from(JSON.stringify(state), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: ENC_VERSION,
    iv: iv.toString('base64'),
    ct: encrypted.toString('base64'),
    tag: tag.toString('base64'),
    aad,
  };
}

export function decryptEngineState(roomCode, payload, version = 2) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid encrypted payload');
  }

  const key = readKey();
  const iv = Buffer.from(String(payload.iv || ''), 'base64');
  const ct = Buffer.from(String(payload.ct || ''), 'base64');
  const tag = Buffer.from(String(payload.tag || ''), 'base64');
  const aad = String(payload.aad || aadFor(roomCode, version));

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}
