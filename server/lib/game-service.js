import { ApiError } from './http.js';
import {
  bluffObjection,
  bluffPass,
  bluffPlaceClaim,
  createWaitingEngine,
  isWaitingRoomExpired,
  joinWaitingRoom,
  knock,
  leaveRoom,
  makePlayerId,
  makeRoomCode,
  markPlayerConnected,
  markPlayerStale,
  nextRound,
  normalizeName,
  pickCard,
  playAgain,
  reclaimPlayer,
  sanitizePlayerName,
  sanitizeConfigPatch,
  startGame,
  throwCards,
  timeoutTick,
  updateConfig,
} from './game-engine.js';
import {
  deleteRoomEverywhere,
  listRoomCodesShallow,
  readEngine,
  readRoomMeta,
  transactionEngine,
  writeWholeRoom,
  writeRoomProjection,
} from './game-store.js';
import { adminGet } from './firebase-rest.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertRoomMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    throw new ApiError(404, 'Room not found.');
  }
}

const WAITING_EXPIRED_MESSAGE = 'Room expired due to inactivity. Create or join a new room.';
let lastWaitingSweepAt = 0;

function waitingFallbackActivity(meta) {
  return Number(meta?.updatedAt || meta?.createdAt || 0);
}

async function deleteIfWaitingExpired(roomCode, knownMeta = null) {
  const meta = knownMeta || (await readRoomMeta(roomCode));
  if (!meta) return false;

  const engine = await readEngine(roomCode);
  if (!engine || typeof engine !== 'object') {
    await deleteRoomEverywhere(roomCode);
    return true;
  }

  if (!isWaitingRoomExpired(engine, Date.now(), waitingFallbackActivity(meta))) {
    return false;
  }

  await deleteRoomEverywhere(roomCode);
  return true;
}

async function maybeSweepExpiredWaitingRooms() {
  const now = Date.now();
  if (now - lastWaitingSweepAt < 60_000) return;
  lastWaitingSweepAt = now;

  let roomCodes = [];
  try {
    roomCodes = await listRoomCodesShallow(8);
  } catch {
    return;
  }

  for (const code of roomCodes) {
    if (!/^[A-Z0-9]{4}$/.test(String(code || ''))) continue;
    try {
      await deleteIfWaitingExpired(code);
    } catch {
      // best-effort sweep; ignore per-room failures
    }
  }
}

async function runEngineMutation(roomCode, mutateFn, updateMetaFn) {
  const meta = await readRoomMeta(roomCode);
  assertRoomMeta(meta);

  let actionResult = null;

  const tx = await transactionEngine(roomCode, (engine) => {
    if (!engine) {
      throw new ApiError(404, 'Room not found.');
    }

    markPlayerStale(engine);
    actionResult = mutateFn(engine, meta);
    return engine;
  });

  const committedEngine = tx.engine;
  if (!committedEngine) {
    throw new ApiError(404, 'Room not found.');
  }

  if (actionResult?.deleteRoom) {
    await deleteRoomEverywhere(roomCode);
    return {
      roomDeleted: true,
      result: actionResult,
      engine: null,
      meta: null,
    };
  }

  const nextMeta = updateMetaFn ? updateMetaFn(clone(meta), committedEngine, actionResult) : clone(meta);
  await writeRoomProjection(roomCode, committedEngine, nextMeta);

  return {
    roomDeleted: false,
    result: actionResult,
    engine: committedEngine,
    meta: nextMeta,
  };
}

async function assertSecureRoomExists(roomCode, { enforceWaitingTtl = false } = {}) {
  const meta = await readRoomMeta(roomCode);
  if (meta) {
    if (enforceWaitingTtl) {
      const expired = await deleteIfWaitingExpired(roomCode, meta);
      if (expired) {
        throw new ApiError(404, WAITING_EXPIRED_MESSAGE);
      }
    }
    return;
  }

  const legacy = await adminGet(`rooms/${roomCode}`);
  if (legacy) {
    throw new ApiError(410, 'Legacy insecure room is disabled. Create a new secure room.');
  }

  throw new ApiError(404, 'Room not found.');
}

export async function createRoomService(uid, rawName, configPatch = null) {
  await maybeSweepExpiredWaitingRooms();

  const playerName = sanitizePlayerName(rawName);
  const playerId = makePlayerId();

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const roomCode = makeRoomCode();
    const existingMeta = await readRoomMeta(roomCode);
    if (existingMeta) {
      continue;
    }

    const engine = createWaitingEngine({
      roomCode,
      hostPlayerId: playerId,
      hostName: playerName,
      hostUid: uid,
    });
    if (configPatch && typeof configPatch === 'object') {
      engine.config = sanitizeConfigPatch(configPatch, engine.config);
    }

    const now = Date.now();
    const meta = {
      version: 2,
      roomCode,
      hostPlayerId: playerId,
      members: { [uid]: playerId },
      createdAt: now,
      updatedAt: now,
    };

    await writeWholeRoom(roomCode, engine, meta);

    return {
      roomCode,
      playerId,
      playerName,
      status: engine.status,
      isHost: true,
    };
  }

  throw new ApiError(500, 'Unable to allocate room code. Please retry.');
}

export async function joinRoomService(uid, rawName, roomCode) {
  await maybeSweepExpiredWaitingRooms();
  await assertSecureRoomExists(roomCode, { enforceWaitingTtl: true });

  const playerName = sanitizePlayerName(rawName);
  const nameKey = normalizeName(playerName);

  let assignedPlayerId = null;

  const mutation = await runEngineMutation(
    roomCode,
    (engine, meta) => {
      if (engine.status !== 'waiting') {
        throw new ApiError(400, 'Game already started.');
      }

      const mappedPlayerId = meta?.members?.[uid];
      if (mappedPlayerId && engine.players?.[mappedPlayerId]) {
        assignedPlayerId = mappedPlayerId;
        reclaimPlayer(engine, {
          playerId: mappedPlayerId,
          uid,
          nameHint: playerName,
        });
        return { reused: true };
      }

      const byUid = Object.entries(engine.players || {}).find(([, player]) => player?.uid === uid)?.[0];
      if (byUid) {
        assignedPlayerId = byUid;
        reclaimPlayer(engine, {
          playerId: byUid,
          uid,
          nameHint: playerName,
        });
        return { reused: true };
      }

      const duplicateName = Object.entries(engine.players || {}).some(([, player]) => player?.nameKey === nameKey);
      if (duplicateName) {
        throw new ApiError(400, 'Name already taken in this room.');
      }

      assignedPlayerId = makePlayerId();
      joinWaitingRoom(engine, {
        playerId: assignedPlayerId,
        name: playerName,
        uid,
      });

      return { reused: false };
    },
    (meta, engine) => {
      meta.members = { ...(meta.members || {}), [uid]: assignedPlayerId };
      meta.hostPlayerId = engine.hostPlayerId || null;
      return meta;
    },
  );

  return {
    roomCode,
    playerId: assignedPlayerId,
    playerName,
    status: mutation.engine?.status || 'waiting',
    isHost: mutation.engine?.hostPlayerId === assignedPlayerId,
  };
}

export async function reclaimRoomService(uid, roomCode, rawName = '') {
  await assertSecureRoomExists(roomCode, { enforceWaitingTtl: true });

  const nameHint = String(rawName || '').trim();
  let assignedPlayerId = null;

  const mutation = await runEngineMutation(
    roomCode,
    (engine, meta) => {
      const mappedPlayerId = meta?.members?.[uid];
      if (!mappedPlayerId || !engine.players?.[mappedPlayerId]) {
        throw new ApiError(404, 'Session expired. Please join again from waiting room.');
      }
      assignedPlayerId = mappedPlayerId;
      reclaimPlayer(engine, {
        playerId: mappedPlayerId,
        uid,
        nameHint,
      });
      return { reclaimed: true };
    },
    (meta, engine) => {
      meta.members = { ...(meta.members || {}), [uid]: assignedPlayerId };
      meta.hostPlayerId = engine.hostPlayerId || null;
      return meta;
    },
  );

  return {
    roomCode,
    playerId: assignedPlayerId,
    playerName: mutation.engine?.players?.[assignedPlayerId]?.name || nameHint,
    status: mutation.engine?.status || 'waiting',
    isHost: mutation.engine?.hostPlayerId === assignedPlayerId,
  };
}

export async function startGameService(roomCode, actorPlayerId) {
  await assertSecureRoomExists(roomCode, { enforceWaitingTtl: true });
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    startGame(engine, actorPlayerId);
    return { ok: true };
  });
  return { ok: true };
}

export async function updateConfigService(roomCode, actorPlayerId, configPatch) {
  await assertSecureRoomExists(roomCode, { enforceWaitingTtl: true });
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    updateConfig(engine, actorPlayerId, configPatch || {});
    return { ok: true };
  });
  return { ok: true };
}

export async function throwService(roomCode, actorPlayerId, indices) {
  let actionInfo = null;
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    actionInfo = throwCards(engine, actorPlayerId, indices);
    return { ok: true };
  });
  return { ok: true, ...(actionInfo || {}) };
}

export async function bluffPlaceClaimService(roomCode, actorPlayerId, indices, declaredRank) {
  let actionInfo = null;
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    actionInfo = bluffPlaceClaim(engine, actorPlayerId, indices, declaredRank);
    return { ok: true };
  });
  return { ok: true, ...(actionInfo || {}) };
}

export async function bluffPlayService(roomCode, actorPlayerId, indices, declaredRank) {
  return bluffPlaceClaimService(roomCode, actorPlayerId, indices, declaredRank);
}

export async function bluffPassService(roomCode, actorPlayerId) {
  let actionInfo = null;
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    actionInfo = bluffPass(engine, actorPlayerId);
    return { ok: true };
  });
  return { ok: true, ...(actionInfo || {}) };
}

export async function bluffObjectionService(roomCode, actorPlayerId) {
  let actionInfo = null;
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    actionInfo = bluffObjection(engine, actorPlayerId);
    return { ok: true };
  });
  return { ok: true, ...(actionInfo || {}) };
}

export async function bluffChallengeService(roomCode, actorPlayerId) {
  return bluffObjectionService(roomCode, actorPlayerId);
}

export async function pickService(roomCode, actorPlayerId, source) {
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    pickCard(engine, actorPlayerId, source);
    return { ok: true };
  });
  return { ok: true };
}

export async function knockService(roomCode, actorPlayerId) {
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    knock(engine, actorPlayerId);
    return { ok: true };
  });
  return { ok: true };
}

export async function timeoutService(roomCode, actorPlayerId) {
  let mutation;
  try {
    mutation = await runEngineMutation(
      roomCode,
      (engine) => {
        markPlayerConnected(engine, actorPlayerId, true);
        return timeoutTick(engine, actorPlayerId);
      },
      (meta, engine) => {
        const nextMembers = { ...(meta.members || {}) };
        Object.entries(nextMembers).forEach(([memberUid, playerId]) => {
          if (!engine.players?.[playerId]) {
            delete nextMembers[memberUid];
          }
        });
        meta.members = nextMembers;
        meta.hostPlayerId = engine.hostPlayerId || null;
        return meta;
      },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Room might already be deleted by another timeout arbiter tick.
      return { ok: true, roomDeleted: true, reason: 'ROOM_NOT_FOUND' };
    }
    throw err;
  }

  if (mutation.roomDeleted) {
    console.info(`[timeout] room ${roomCode} deleted after inactivity kick/leave left no players`);
    return { ok: true, roomDeleted: true };
  }

  return { ok: true, ...(mutation.result || {}) };
}

export async function leaveService(roomCode, actorPlayerId, uid) {
  await assertSecureRoomExists(roomCode, { enforceWaitingTtl: true });
  const mutation = await runEngineMutation(
    roomCode,
    (engine) => {
      const result = leaveRoom(engine, actorPlayerId);
      return result;
    },
    (meta, engine) => {
      const nextMembers = { ...(meta.members || {}) };
      if (uid) {
        delete nextMembers[uid];
      }

      Object.entries(nextMembers).forEach(([memberUid, playerId]) => {
        if (!engine.players?.[playerId]) {
          delete nextMembers[memberUid];
        }
      });

      meta.members = nextMembers;
      meta.hostPlayerId = engine.hostPlayerId || null;
      return meta;
    },
  );

  return {
    ok: true,
    roomDeleted: mutation.roomDeleted,
  };
}

export async function nextRoundService(roomCode, actorPlayerId) {
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    nextRound(engine);
    return { ok: true };
  });
  return { ok: true };
}

export async function playAgainService(roomCode, actorPlayerId) {
  await runEngineMutation(roomCode, (engine) => {
    markPlayerConnected(engine, actorPlayerId, true);
    playAgain(engine);
    return { ok: true };
  });
  return { ok: true };
}
