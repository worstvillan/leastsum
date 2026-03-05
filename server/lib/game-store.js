import {
  adminDelete,
  adminGet,
  adminPatch,
  adminRequest,
  adminSet,
  runAdminTransaction,
} from './firebase-rest.js';
import { decryptEngineState, encryptEngineState } from './game-crypto.js';
import { buildAllPrivateProjections, buildPublicProjection, GAME_VERSION } from './game-engine.js';

function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

function enginePath(roomCode) {
  return `roomsV2_engine/${roomCode}`;
}

function roomRoot(roomCode) {
  return `roomsV2/${roomCode}`;
}

export async function readRoomMeta(roomCode) {
  const meta = await adminGet(`${roomRoot(roomCode)}/meta`);
  return meta && typeof meta === 'object' ? meta : null;
}

export async function readEngine(roomCode) {
  const node = await adminGet(enginePath(roomCode));
  if (!node || typeof node !== 'object' || !node.engineCipher) return null;
  return decryptEngineState(roomCode, node.engineCipher, GAME_VERSION);
}

export async function writeEncryptedEngine(roomCode, engine) {
  const payload = {
    version: GAME_VERSION,
    roomCode,
    engineCipher: encryptEngineState(roomCode, engine, GAME_VERSION),
    updatedAt: Date.now(),
  };
  await adminSet(enginePath(roomCode), payload);
}

export async function transactionEngine(roomCode, mutator) {
  let committedEngine = null;

  const tx = await runAdminTransaction(enginePath(roomCode), (currentNode) => {
    const currentEngine = currentNode?.engineCipher
      ? decryptEngineState(roomCode, currentNode.engineCipher, GAME_VERSION)
      : null;

    const working = clone(currentEngine);
    const nextEngine = mutator(working, currentEngine);
    if (nextEngine === undefined) {
      committedEngine = clone(currentEngine);
      return undefined;
    }

    nextEngine.updatedAt = Date.now();
    committedEngine = clone(nextEngine);

    return {
      version: GAME_VERSION,
      roomCode,
      engineCipher: encryptEngineState(roomCode, nextEngine, GAME_VERSION),
      updatedAt: Date.now(),
    };
  });

  return {
    committed: tx.committed,
    engine: committedEngine,
  };
}

export async function writeRoomProjection(roomCode, engine, meta) {
  const now = Date.now();
  const safeMeta = {
    version: GAME_VERSION,
    roomCode,
    hostPlayerId: engine.hostPlayerId || null,
    members: meta?.members || {},
    createdAt: meta?.createdAt || now,
    updatedAt: now,
  };

  const updates = {
    [`${roomRoot(roomCode)}/public`]: buildPublicProjection(engine),
    [`${roomRoot(roomCode)}/private`]: buildAllPrivateProjections(engine),
    [`${roomRoot(roomCode)}/meta`]: safeMeta,
  };

  await adminPatch('', updates);
}

export async function writeWholeRoom(roomCode, engine, meta) {
  await writeEncryptedEngine(roomCode, engine);
  await writeRoomProjection(roomCode, engine, meta);
}

export async function deleteRoomEverywhere(roomCode) {
  await adminPatch('', {
    [`roomsV2/${roomCode}`]: null,
    [`roomsV2_engine/${roomCode}`]: null,
    [`rooms/${roomCode}`]: null,
  });
}

export async function deleteLegacyRoom(roomCode) {
  await adminDelete(`rooms/${roomCode}`);
}

export async function listRoomCodesShallow(limit = 32) {
  const max = Math.max(1, Math.min(128, Number(limit) || 32));
  const resp = await adminRequest({
    path: 'roomsV2',
    method: 'GET',
    query: { shallow: 'true' },
  });
  if (!resp.ok) {
    return [];
  }
  const keys = Object.keys(resp.data || {});
  return keys.slice(0, max);
}
