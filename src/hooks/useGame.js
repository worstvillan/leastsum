import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ref,
  set,
  update,
  onValue,
  onDisconnect,
  get,
  remove,
  runTransaction,
  serverTimestamp,
} from 'firebase/database';
import { db } from '../firebase';
import { freshDoubleDeck, hardShuffle, handSum } from '../utils/gameUtils';

const DEFAULT_TURN_TIME_SEC = 45;
const ROUND_ACTION_LOCK_TTL_MS = 8000;
const RECLAIM_STALE_MS = 30000;

const STORAGE_CLIENT_ID = 'leastsum.clientId';
const STORAGE_LAST_ROOM = 'leastsum.lastRoomCode';
const STORAGE_PLAYER_PREFIX = 'leastsum.playerByRoom.';

function makePlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 9);
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function normalizeName(value = '') {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hasWindow() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function resolveTurnTimeSec(config = {}) {
  const raw = Number.parseInt(config.turnTimeSec ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TURN_TIME_SEC;
  return Math.min(Math.max(raw, 5), 120);
}

function resolveHostPlayerId(room = {}) {
  if (room.hostPlayerId) return room.hostPlayerId;
  const entries = Object.entries(room.players || {}).sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));
  return entries[0]?.[0] ?? null;
}

function playerSessionKey(roomCode) {
  return `${STORAGE_PLAYER_PREFIX}${roomCode}`;
}

function getOrCreateClientId() {
  if (!hasWindow()) return 'c_' + Math.random().toString(36).slice(2, 10);
  const existing = window.localStorage.getItem(STORAGE_CLIENT_ID);
  if (existing) return existing;
  const next = 'c_' + Math.random().toString(36).slice(2, 10);
  window.localStorage.setItem(STORAGE_CLIENT_ID, next);
  return next;
}

function readRoomSession(roomCode) {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(playerSessionKey(roomCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.playerId || !parsed?.playerName) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistRoomSession(roomCode, data) {
  if (!hasWindow()) return;
  window.localStorage.setItem(
    playerSessionKey(roomCode),
    JSON.stringify({
      playerId: data.playerId,
      playerName: data.playerName,
      nameKey: data.nameKey ?? normalizeName(data.playerName),
    }),
  );
  window.localStorage.setItem(STORAGE_LAST_ROOM, roomCode);
}

function clearRoomSession(roomCode) {
  if (!hasWindow()) return;
  window.localStorage.removeItem(playerSessionKey(roomCode));
  if (window.localStorage.getItem(STORAGE_LAST_ROOM) === roomCode) {
    window.localStorage.removeItem(STORAGE_LAST_ROOM);
  }
}

export function useGame() {
  const [clientId] = useState(() => getOrCreateClientId());
  const [myId, setMyId] = useState(() => makePlayerId());
  const [myName, setMyName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceToken, setVoiceToken] = useState('');
  const [voiceUrl, setVoiceUrl] = useState(import.meta.env.VITE_LIVEKIT_URL || '');
  const [voiceError, setVoiceError] = useState('');

  const myIdRef = useRef(myId);
  const roomCodeRef = useRef('');
  const timeoutLockRef = useRef('');
  const disconnectRef = useRef(null);
  const restoredOnceRef = useRef(false);

  useEffect(() => { myIdRef.current = myId; }, [myId]);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  const clearError = useCallback(() => setError(''), []);

  const registerDisconnectPresence = useCallback(async (code, playerId) => {
    try {
      if (disconnectRef.current?.cancel) await disconnectRef.current.cancel();
    } catch {}

    try {
      const playerRef = ref(db, `rooms/${code}/players/${playerId}`);
      const dis = onDisconnect(playerRef);
      await dis.update({ connected: false, lastSeenAt: serverTimestamp() });
      disconnectRef.current = dis;
    } catch {}
  }, []);

  const markPresenceConnected = useCallback(async (code, playerId, name) => {
    await update(ref(db, `rooms/${code}/players/${playerId}`), {
      connected: true,
      lastSeenAt: Date.now(),
      ...(name ? { name, nameKey: normalizeName(name) } : {}),
    });
    await registerDisconnectPresence(code, playerId);
  }, [registerDisconnectPresence]);

  const requestVoiceToken = useCallback(async (room, name) => {
    const endpoint = import.meta.env.VITE_VOICE_TOKEN_ENDPOINT || '/api/get-token';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: room, participantName: name, participantId: myIdRef.current }),
      });
      if (!res.ok) throw new Error(`Token API failed: ${res.status}`);
      const data = await res.json();
      if (!data?.token) throw new Error('Token missing in response');
      setVoiceToken(data.token);
      if (typeof data.url === 'string' && data.url.length > 0) setVoiceUrl(data.url);
      setVoiceError('');
      return true;
    } catch {
      setVoiceToken('');
      setVoiceError('Voice unavailable. Game is still playable.');
      return false;
    }
  }, []);

  const attachLocalPlayer = useCallback(async ({ code, playerId, playerName, room }) => {
    setMyId(playerId);
    setMyName(playerName);
    setRoomCode(code);
    const hostId = resolveHostPlayerId(room);
    const waitingHost = (room?.status ?? 'waiting') === 'waiting' && hostId === playerId;
    setIsHost(waitingHost);

    persistRoomSession(code, { playerId, playerName, nameKey: normalizeName(playerName) });
    await markPresenceConnected(code, playerId, playerName);
  }, [markPresenceConnected]);

  const restoreSessionOnLoad = useCallback(async () => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;

    if (!hasWindow()) return;
    const storedRoom = window.localStorage.getItem(STORAGE_LAST_ROOM);
    if (!storedRoom) return;

    const stored = readRoomSession(storedRoom);
    if (!stored?.playerId) {
      clearRoomSession(storedRoom);
      return;
    }

    const snap = await get(ref(db, 'rooms/' + storedRoom));
    if (!snap.exists()) {
      clearRoomSession(storedRoom);
      return;
    }

    const room = snap.val() || {};
    const existing = room.players?.[stored.playerId];
    if (!existing) {
      clearRoomSession(storedRoom);
      return;
    }

    const finalName = existing.name || stored.playerName;
    await attachLocalPlayer({
      code: storedRoom,
      playerId: stored.playerId,
      playerName: finalName,
      room,
    });
  }, [attachLocalPlayer]);

  const createRoom = async (playerName) => {
    if (!playerName?.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const trimmed = playerName.trim();
      const nameKey = normalizeName(trimmed);
      const playerId = myIdRef.current || makePlayerId();

      let createdCode = '';
      for (let i = 0; i < 12; i += 1) {
        const candidate = makeRoomCode();
        const candidateRef = ref(db, 'rooms/' + candidate);
        const exists = await get(candidateRef);
        if (exists.exists()) continue;

        await set(candidateRef, {
          roomCode: candidate,
          status: 'waiting',
          timeoutStreak: 0,
          hostPlayerId: playerId,
          roundActionLock: null,
          config: {
            cardsPerPlayer: 6,
            maxPlayers: 4,
            elimScore: 200,
            minTurnsToKnock: 1,
            knockerPenalty: 60,
            useJoker: false,
            turnTimeSec: DEFAULT_TURN_TIME_SEC,
          },
          players: {
            [playerId]: {
              name: trimmed,
              nameKey,
              order: 0,
              score: 0,
              eliminated: false,
              connected: true,
              lastSeenAt: Date.now(),
            },
          },
          dealerIdx: 0,
          round: 0,
        });

        createdCode = candidate;
        break;
      }

      if (!createdCode) {
        setError('Failed to create room. Please try again.');
        return;
      }

      await attachLocalPlayer({
        code: createdCode,
        playerId,
        playerName: trimmed,
        room: { status: 'waiting', hostPlayerId: playerId, players: { [playerId]: { order: 0 } } },
      });
    } catch {
      setError('Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (playerName, code) => {
    if (!playerName?.trim() || !code || code.length !== 4 || loading) return;
    setLoading(true);
    setError('');
    try {
      const trimmed = playerName.trim();
      const nameKey = normalizeName(trimmed);
      const upperCode = code.toUpperCase();
      const roomSnap = await get(ref(db, 'rooms/' + upperCode));

      if (!roomSnap.exists()) {
        setError('Room not found.');
        return;
      }

      const room = roomSnap.val() || {};
      const players = room.players || {};

      if (room.status === 'waiting') {
        const maxPlayers = Number(room.config?.maxPlayers) || 4;
        if (Object.keys(players).length >= maxPlayers) {
          setError('Room is full.');
          return;
        }

        let playerId = myIdRef.current || makePlayerId();
        if (players[playerId]) playerId = makePlayerId();

        await set(ref(db, `rooms/${upperCode}/players/${playerId}`), {
          name: trimmed,
          nameKey,
          order: Object.keys(players).length,
          score: 0,
          eliminated: false,
          connected: true,
          lastSeenAt: Date.now(),
        });

        await attachLocalPlayer({
          code: upperCode,
          playerId,
          playerName: trimmed,
          room: { ...room, players: { ...players, [playerId]: { order: Object.keys(players).length } } },
        });
        return;
      }

      const now = Date.now();
      const reclaimEntry = Object.entries(players).find(([, p]) => p?.nameKey === nameKey);
      if (!reclaimEntry) {
        setError('Game already started.');
        return;
      }

      const [existingId, existingPlayer] = reclaimEntry;
      const connected = existingPlayer?.connected !== false;
      const lastSeen = Number(existingPlayer?.lastSeenAt || 0);
      const stale = !connected || (lastSeen > 0 && now - lastSeen > RECLAIM_STALE_MS);
      if (!stale) {
        setError('This player is already connected.');
        return;
      }

      await attachLocalPlayer({
        code: upperCode,
        playerId: existingId,
        playerName: existingPlayer?.name || trimmed,
        room,
      });
    } catch {
      setError('Failed to join room.');
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (newConfig) => {
    const code = roomCodeRef.current;
    if (!code || !gameState || gameState.status !== 'waiting') return;
    const hostId = resolveHostPlayerId(gameState);
    if (myIdRef.current !== hostId) return;
    await update(ref(db, `rooms/${code}/config`), newConfig);
  };

  const clearLocalRoomState = useCallback((codeToClear = roomCodeRef.current) => {
    if (codeToClear) clearRoomSession(codeToClear);
    setRoomCode('');
    setIsHost(false);
    setGameState(null);
    setError('');
    setVoiceToken('');
    setVoiceError('');
  }, []);

  const leaveRoom = async () => {
    const code = roomCodeRef.current;
    const leavingId = myIdRef.current;
    if (!code || !leavingId) {
      clearLocalRoomState(code);
      return;
    }

    try {
      if (disconnectRef.current?.cancel) await disconnectRef.current.cancel();
    } catch {}

    try {
      const roomRef = ref(db, 'rooms/' + code);
      const snap = await get(roomRef);
      if (!snap.exists()) {
        clearLocalRoomState(code);
        return;
      }
      const room = snap.val() || {};
      const players = room.players || {};
      if (!players[leavingId]) {
        clearLocalRoomState(code);
        return;
      }

      const remainingPlayers = { ...players };
      delete remainingPlayers[leavingId];
      if (Object.keys(remainingPlayers).length === 0) {
        await remove(roomRef);
        clearLocalRoomState(code);
        return;
      }

      const updates = {
        [`players/${leavingId}`]: null,
        [`hands/${leavingId}`]: null,
        [`roundResults/${leavingId}`]: null,
        timeoutStreak: 0,
      };

      const prevOrder = Array.isArray(room.turnOrder) ? room.turnOrder : [];
      const removedIdx = prevOrder.indexOf(leavingId);
      const nextOrder = prevOrder.filter((id) => id !== leavingId);
      if (prevOrder.length > 0) {
        updates.turnOrder = nextOrder;
        if (nextOrder.length > 0) {
          let nextTurnIdx = room.currentTurnIdx ?? 0;
          if (removedIdx >= 0 && removedIdx < nextTurnIdx) nextTurnIdx -= 1;
          if (removedIdx === (room.currentTurnIdx ?? 0)) nextTurnIdx = nextTurnIdx % nextOrder.length;
          if (nextTurnIdx < 0) nextTurnIdx = 0;
          updates.currentTurnIdx = nextTurnIdx;
        } else {
          updates.currentTurnIdx = 0;
        }
      }

      const remainingSorted = Object.entries(remainingPlayers).sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));
      const currentHost = resolveHostPlayerId(room);
      if (!currentHost || currentHost === leavingId) updates.hostPlayerId = remainingSorted[0]?.[0] ?? null;

      if (room.status === 'playing') {
        const activeIds = (Array.isArray(updates.turnOrder) ? updates.turnOrder : prevOrder)
          .filter((id) => remainingPlayers[id] && !remainingPlayers[id].eliminated);
        if (activeIds.length <= 1) {
          updates.status = 'gameover';
          updates.turnDeadlineAt = null;
        } else {
          const turnTimeSec = resolveTurnTimeSec(room.config || {});
          updates.turnDeadlineAt = Date.now() + turnTimeSec * 1000;
        }
      }

      await update(roomRef, updates);
    } finally {
      clearLocalRoomState(code);
    }
  };

  const dealRound = async (stateData, dealerIdxOverride) => {
    const code = roomCodeRef.current;
    if (!code) return;
    const players = stateData.players || {};
    const active = Object.entries(players)
      .filter(([, p]) => !p.eliminated)
      .sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));

    if (active.length < 2) {
      await update(ref(db, 'rooms/' + code), { status: 'gameover', turnDeadlineAt: null });
      return;
    }

    const config = stateData.config || {};
    const cPP = config.cardsPerPlayer || 6;
    const turnTimeSec = resolveTurnTimeSec(config);
    const deck = freshDoubleDeck();
    const hands = {};
    active.forEach(([id]) => { hands[id] = deck.splice(0, cPP); });
    const previousCard = deck.shift();
    const pile = [];
    const turnOrder = active.map(([id]) => id);
    const dealerIdx = dealerIdxOverride ?? ((stateData.dealerIdx ?? 0) + 1) % active.length;
    const firstTurnIdx = (dealerIdx + 1) % active.length;
    let jokerCard = null;
    if (config.useJoker) jokerCard = deck[Math.floor(Math.random() * deck.length)];

    await update(ref(db, 'rooms/' + code), {
      roomCode: code,
      status: 'playing',
      phase: 'throw',
      round: (stateData.round || 0) + 1,
      deck,
      previousCard,
      pile,
      hands,
      pendingThrownCards: null,
      knocker: null,
      knockerFailed: false,
      roundResults: null,
      dealerIdx,
      turnOrder,
      currentTurnIdx: firstTurnIdx,
      turnCount: 0,
      jokerCard,
      timeoutStreak: 0,
      turnDeadlineAt: Date.now() + turnTimeSec * 1000,
    });
  };

  const startGame = async () => {
    if (!gameState || gameState.status !== 'waiting') return;
    const hostId = resolveHostPlayerId(gameState);
    if (myIdRef.current !== hostId) return;
    const activeCount = Object.values(gameState.players || {}).filter((p) => !p?.eliminated).length;
    if (activeCount < 2) return;
    const randomDealerIdx = Math.floor(Math.random() * activeCount);
    await dealRound(gameState, randomDealerIdx);
  };

  const acquireRoundActionLock = useCallback(async (expectedStatus) => {
    const code = roomCodeRef.current;
    if (!code) return false;
    const lockRef = ref(db, `rooms/${code}/roundActionLock`);
    const now = Date.now();
    const tx = await runTransaction(lockRef, (current) => {
      if (!current) {
        return { by: myIdRef.current, at: now, status: expectedStatus };
      }
      const age = now - Number(current.at || 0);
      if (age > ROUND_ACTION_LOCK_TTL_MS) {
        return { by: myIdRef.current, at: now, status: expectedStatus };
      }
      return;
    });
    return !!tx.committed;
  }, []);

  const nextRound = async () => {
    const code = roomCodeRef.current;
    if (!code || !gameState || gameState.status !== 'roundEnd') return;

    const locked = await acquireRoundActionLock('roundEnd');
    if (!locked) return;

    try {
      const snap = await get(ref(db, 'rooms/' + code));
      if (!snap.exists()) return;
      const latest = snap.val() || {};
      if (latest.status !== 'roundEnd') return;
      await dealRound(latest);
    } finally {
      await remove(ref(db, `rooms/${code}/roundActionLock`));
    }
  };

  const playAgain = async () => {
    const code = roomCodeRef.current;
    if (!code || !gameState || gameState.status !== 'gameover') return;

    const locked = await acquireRoundActionLock('gameover');
    if (!locked) return;

    try {
      const snap = await get(ref(db, 'rooms/' + code));
      if (!snap.exists()) return;
      const latest = snap.val() || {};
      if (latest.status !== 'gameover') return;

      const players = latest.players || {};
      const updates = { status: 'waiting', round: 0, dealerIdx: 0, timeoutStreak: 0 };
      Object.keys(players).forEach((id) => {
        updates[`players/${id}/score`] = 0;
        updates[`players/${id}/eliminated`] = false;
      });
      await update(ref(db, 'rooms/' + code), updates);
    } finally {
      await remove(ref(db, `rooms/${code}/roundActionLock`));
    }
  };

  const advanceTurnFromLatest = async (latest, extraUpdates = {}) => {
    const code = roomCodeRef.current;
    if (!code) return;

    const players = latest.players || {};
    const turnOrder = Array.isArray(latest.turnOrder) ? latest.turnOrder : [];
    const activeTurnOrder = turnOrder.filter((id) => players[id] && !players[id].eliminated);

    if (activeTurnOrder.length <= 1) {
      await update(ref(db, 'rooms/' + code), { ...extraUpdates, status: 'gameover', turnDeadlineAt: null, pendingThrownCards: null });
      return;
    }

    const currentTurnId = turnOrder[latest.currentTurnIdx ?? 0] ?? null;
    const currentActiveIdx = activeTurnOrder.indexOf(currentTurnId);
    const nextActiveIdx = currentActiveIdx >= 0 ? (currentActiveIdx + 1) % activeTurnOrder.length : 0;
    const nextTurnId = activeTurnOrder[nextActiveIdx];
    const nextTurnIdx = turnOrder.indexOf(nextTurnId);
    const turnTimeSec = resolveTurnTimeSec(latest.config || {});

    await update(ref(db, 'rooms/' + code), {
      ...extraUpdates,
      phase: 'throw',
      pendingThrownCards: null,
      currentTurnIdx: nextTurnIdx >= 0 ? nextTurnIdx : 0,
      turnCount: (latest.turnCount ?? 0) + 1,
      timeoutStreak: 0,
      turnDeadlineAt: Date.now() + turnTimeSec * 1000,
    });
  };

  const throwSelected = async (indices) => {
    const code = roomCodeRef.current;
    if (!code || !Array.isArray(indices) || indices.length === 0) return { ok: false, reason: 'INVALID_SELECTION' };

    const snap = await get(ref(db, 'rooms/' + code));
    if (!snap.exists()) return { ok: false, reason: 'ROOM_MISSING' };
    const latest = snap.val() || {};
    if (latest.status !== 'playing' || latest.phase !== 'throw') return { ok: false, reason: 'NOT_THROW_PHASE' };

    const turnOrder = Array.isArray(latest.turnOrder) ? latest.turnOrder : [];
    const liveTurnId = turnOrder[latest.currentTurnIdx ?? 0] ?? null;
    if (liveTurnId && liveTurnId !== myIdRef.current) return { ok: false, reason: 'NOT_YOUR_TURN' };

    const myHand = [...(latest.hands?.[myIdRef.current] || [])];
    if (myHand.length === 0) return { ok: false, reason: 'EMPTY_HAND' };

    const sorted = [...indices].filter((i) => Number.isInteger(i) && i >= 0 && i < myHand.length).sort((a, b) => b - a);
    if (sorted.length === 0) return { ok: false, reason: 'INVALID_SELECTION' };

    const firstRank = myHand[sorted[0]]?.rank;
    if (!firstRank || !sorted.every((i) => myHand[i]?.rank === firstRank)) return { ok: false, reason: 'MIXED_RANK_SELECTION' };
    const oldPrevious = latest.previousCard || null;
    const isMatchBySelection = !!oldPrevious && firstRank === oldPrevious.rank;
    if (isMatchBySelection && sorted.length >= myHand.length) {
      return { ok: false, reason: 'MATCH_REQUIRES_ONE_CARD_LEFT' };
    }

    const thrown = [];
    sorted.forEach((i) => { thrown.unshift(myHand.splice(i, 1)[0]); });
    if (thrown.length === 0) return { ok: false, reason: 'INVALID_SELECTION' };

    const isMatch = !!oldPrevious && thrown[0]?.rank === oldPrevious.rank;

    if (isMatch) {
      const pile = Array.isArray(latest.pile) ? [...latest.pile] : [];
      if (oldPrevious) pile.push(oldPrevious);
      if (thrown.length > 1) pile.push(...thrown.slice(0, -1));
      await advanceTurnFromLatest(latest, {
        [`hands/${myIdRef.current}`]: myHand,
        previousCard: thrown[thrown.length - 1],
        pile,
      });
      return { ok: true, phase: 'throw' };
    }

    const turnTimeSec = resolveTurnTimeSec(latest.config || {});
    await update(ref(db, 'rooms/' + code), {
      [`hands/${myIdRef.current}`]: myHand,
      phase: 'pick',
      pendingThrownCards: thrown,
      timeoutStreak: 0,
      turnDeadlineAt: Date.now() + turnTimeSec * 1000,
    });
    return { ok: true, phase: 'pick' };
  };

  const pickFromDeck = async () => {
    const code = roomCodeRef.current;
    if (!code) return;

    const snap = await get(ref(db, 'rooms/' + code));
    if (!snap.exists()) return;
    const latest = snap.val() || {};
    if (latest.status !== 'playing' || latest.phase !== 'pick') return;

    const turnOrder = Array.isArray(latest.turnOrder) ? latest.turnOrder : [];
    const liveTurnId = turnOrder[latest.currentTurnIdx ?? 0] ?? null;
    if (liveTurnId && liveTurnId !== myIdRef.current) return;

    const pendingThrown = Array.isArray(latest.pendingThrownCards) ? latest.pendingThrownCards : [];
    if (pendingThrown.length === 0) return;

    let deck = Array.isArray(latest.deck) ? [...latest.deck] : [];
    let pile = Array.isArray(latest.pile) ? [...latest.pile] : [];

    if (deck.length === 0) {
      if (pile.length === 0) return;
      deck = hardShuffle(pile);
      pile = [];
    }
    if (deck.length === 0) return;

    const myHand = [...(latest.hands?.[myIdRef.current] || [])];
    const drawn = deck.shift();
    myHand.push(drawn);

    const oldPrevious = latest.previousCard || null;
    if (oldPrevious) pile.push(oldPrevious);
    if (pendingThrown.length > 1) pile.push(...pendingThrown.slice(0, -1));

    await advanceTurnFromLatest(latest, {
      [`hands/${myIdRef.current}`]: myHand,
      deck,
      pile,
      previousCard: pendingThrown[pendingThrown.length - 1],
    });
  };

  const pickFromPrevious = async () => {
    const code = roomCodeRef.current;
    if (!code) return;

    const snap = await get(ref(db, 'rooms/' + code));
    if (!snap.exists()) return;
    const latest = snap.val() || {};
    if (latest.status !== 'playing' || latest.phase !== 'pick') return;

    const turnOrder = Array.isArray(latest.turnOrder) ? latest.turnOrder : [];
    const liveTurnId = turnOrder[latest.currentTurnIdx ?? 0] ?? null;
    if (liveTurnId && liveTurnId !== myIdRef.current) return;

    const pendingThrown = Array.isArray(latest.pendingThrownCards) ? latest.pendingThrownCards : [];
    if (pendingThrown.length === 0) return;
    if (!latest.previousCard) return;

    const myHand = [...(latest.hands?.[myIdRef.current] || []), latest.previousCard];
    const pile = Array.isArray(latest.pile) ? [...latest.pile] : [];
    if (pendingThrown.length > 1) pile.push(...pendingThrown.slice(0, -1));

    await advanceTurnFromLatest(latest, {
      [`hands/${myIdRef.current}`]: myHand,
      pile,
      previousCard: pendingThrown[pendingThrown.length - 1],
    });
  };

  // Backward-compatible aliases for older UI paths.
  const matchCards = throwSelected;
  const swapCards = throwSelected;
  const drawFromDeck = pickFromDeck;
  const takeDiscard = pickFromPrevious;
  const discardDrawn = async () => {};

  const knock = async () => {
    const code = roomCodeRef.current;
    if (!code || !gameState) return { ok: false, reason: 'UNAVAILABLE' };

    const snap = await get(ref(db, 'rooms/' + code));
    if (!snap.exists()) return { ok: false, reason: 'ROOM_MISSING' };
    const latest = snap.val() || {};
    if (latest.status !== 'playing') return { ok: false, reason: 'NOT_PLAYING' };

    const turnOrder = Array.isArray(latest.turnOrder) ? latest.turnOrder : [];
    const liveTurnId = turnOrder[latest.currentTurnIdx ?? 0] ?? null;
    if (liveTurnId && liveTurnId !== myIdRef.current) return { ok: false, reason: 'NOT_YOUR_TURN' };

    const minTurnsToKnock = Number(latest.config?.minTurnsToKnock ?? 1);
    if ((latest.turnCount ?? 0) < minTurnsToKnock) return { ok: false, reason: 'MIN_TURNS' };

    const myCurrentSum = handSum(latest.hands?.[myIdRef.current] || [], latest.jokerCard);
    if (myCurrentSum >= 25) {
      return { ok: false, reason: 'KNOCK_SUM_LIMIT', sum: myCurrentSum, limit: 24 };
    }

    const players = latest.players || {};
    const sums = {};

    for (const [id] of Object.entries(players).filter(([, p]) => !p.eliminated)) {
      sums[id] = handSum(latest.hands?.[id] || [], latest.jokerCard);
    }

    const minSum = Math.min(...Object.values(sums));
    const knockerSum = sums[myIdRef.current] ?? 0;
    const penaltyValue = latest.config?.knockerPenalty || 60;
    const knockerFailed = knockerSum !== minSum;
    const updatedPlayers = { ...players };
    const roundResults = {};

    for (const [id, p] of Object.entries(players)) {
      if (p.eliminated) continue;
      const playerSum = sums[id] ?? 0;
      let addedScore = playerSum;
      let pen = false;

      if (id === myIdRef.current && !knockerFailed) {
        addedScore = 0;
      } else if (id === myIdRef.current && knockerFailed) {
        addedScore = knockerSum + penaltyValue;
        pen = true;
      }

      const newScore = (p.score || 0) + addedScore;
      const elim = newScore >= (latest.config?.elimScore || 200);
      updatedPlayers[id] = { ...p, score: newScore, eliminated: elim };
      roundResults[id] = {
        sum: sums[id],
        addedScore,
        penaltyApplied: pen,
        newScore,
        eliminated: elim,
        cards: latest.hands?.[id] || [],
        prevScore: p.score || 0,
      };
    }

    const remaining = Object.values(updatedPlayers).filter((p) => !p.eliminated);
    await update(ref(db, 'rooms/' + code), {
      status: remaining.length <= 1 ? 'gameover' : 'roundEnd',
      knocker: myIdRef.current,
      knockerFailed,
      roundResults,
      players: updatedPlayers,
      timeoutStreak: 0,
      turnDeadlineAt: null,
    });
    return { ok: true };
  };

  const handleTurnTimeout = useCallback(async () => {
    const code = roomCodeRef.current;
    if (!code) return;

    const roomRef = ref(db, 'rooms/' + code);
    const snap = await get(roomRef);
    if (!snap.exists()) return;
    const latest = snap.val() || {};
    if (latest.status !== 'playing') return;

    const deadline = latest.turnDeadlineAt;
    if (!deadline || Date.now() < deadline) return;

    const turnOrder = Array.isArray(latest.turnOrder) ? latest.turnOrder : [];
    if (turnOrder.length < 2) return;
    const players = latest.players || {};
    const connectedIds = turnOrder.filter((id) => players[id] && players[id].connected !== false);
    if (connectedIds.length === 0) return;
    const arbiter = [...connectedIds].sort()[0];
    if (arbiter !== myIdRef.current) return;

    const currentIdx = latest.currentTurnIdx ?? 0;
    const phase = latest.phase ?? 'throw';
    const key = `${code}:${latest.round || 0}:${currentIdx}:${deadline}:${phase}:${latest.timeoutStreak || 0}`;
    if (timeoutLockRef.current === key) return;
    timeoutLockRef.current = key;

    const activeTurnIds = turnOrder.filter((id) => players[id] && !players[id].eliminated);
    if (activeTurnIds.length < 2) {
      await update(roomRef, { status: 'gameover', turnDeadlineAt: null });
      return;
    }

    const currentTurnId = turnOrder[currentIdx] ?? null;
    const nextIdx = (currentIdx + 1) % turnOrder.length;
    const turnTimeSec = resolveTurnTimeSec(latest.config || {});

    let deck = Array.isArray(latest.deck) ? [...latest.deck] : [];
    let pile = Array.isArray(latest.pile) ? [...latest.pile] : [];
    let previousCard = latest.previousCard || null;

    const updates = {
      phase: 'throw',
      pendingThrownCards: null,
      currentTurnIdx: nextIdx,
      turnCount: (latest.turnCount ?? 0) + 1,
      turnDeadlineAt: Date.now() + turnTimeSec * 1000,
    };

    if (currentTurnId && phase === 'pick') {
      const pendingThrown = Array.isArray(latest.pendingThrownCards) ? latest.pendingThrownCards : [];
      if (pendingThrown.length > 0) {
        const hand = Array.isArray(latest.hands?.[currentTurnId]) ? [...latest.hands[currentTurnId]] : [];
        const oldPrevious = latest.previousCard || null;
        let pickedFromPrevious = false;

        // Timeout default is deck pick; fallback to previous only if deck path is impossible.
        if (deck.length === 0 && pile.length > 0) {
          deck = hardShuffle(pile);
          pile = [];
        }
        if (deck.length > 0) {
          hand.push(deck.shift());
        } else if (oldPrevious) {
          hand.push(oldPrevious);
          pickedFromPrevious = true;
        }

        if (!pickedFromPrevious && oldPrevious) pile.push(oldPrevious);
        if (pendingThrown.length > 1) pile.push(...pendingThrown.slice(0, -1));

        updates[`hands/${currentTurnId}`] = hand;
        updates.previousCard = pendingThrown[pendingThrown.length - 1];
      }
    } else if (currentTurnId) {
      const timedOutHand = Array.isArray(latest.hands?.[currentTurnId]) ? [...latest.hands[currentTurnId]] : [];
      if (timedOutHand.length > 0) {
        const randomIdx = Math.floor(Math.random() * timedOutHand.length);
        const thrown = timedOutHand.splice(randomIdx, 1)[0];
        const oldPrevious = previousCard;
        const isMatch = !!oldPrevious && thrown?.rank === oldPrevious.rank;

        if (isMatch) {
          if (oldPrevious) pile.push(oldPrevious);
          previousCard = thrown;
          updates[`hands/${currentTurnId}`] = timedOutHand;
        } else {
          let pickedFromPrevious = false;

          // Timeout default is deck pick after random throw.
          if (deck.length === 0 && pile.length > 0) {
            deck = hardShuffle(pile);
            pile = [];
          }
          if (deck.length > 0) {
            timedOutHand.push(deck.shift());
          } else if (oldPrevious) {
            timedOutHand.push(oldPrevious);
            pickedFromPrevious = true;
          }

          if (!pickedFromPrevious && oldPrevious) pile.push(oldPrevious);
          previousCard = thrown;
          updates[`hands/${currentTurnId}`] = timedOutHand;
        }
      }
    }

    updates.deck = deck;
    updates.pile = pile;
    updates.previousCard = previousCard;
    updates.timeoutStreak = (latest.timeoutStreak ?? 0) + 1;
    if (updates.timeoutStreak >= activeTurnIds.length) {
      await remove(roomRef);
      return;
    }

    await update(roomRef, updates);
  }, []);

  useEffect(() => {
    restoreSessionOnLoad();
  }, [restoreSessionOnLoad]);

  useEffect(() => {
    if (!roomCode) return;
    const unsub = onValue(ref(db, 'rooms/' + roomCode), (snap) => {
      const val = snap.exists() ? snap.val() : null;
      setGameState(val);
      if (val) {
        const hostId = resolveHostPlayerId(val);
        setIsHost(val.status === 'waiting' && hostId === myIdRef.current);
        return;
      }

      if (roomCodeRef.current) {
        clearRoomSession(roomCodeRef.current);
        setRoomCode('');
        setIsHost(false);
        setError('Room ended due to inactivity or all players left.');
      }
    });
    return () => unsub();
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !myName) return;
    requestVoiceToken(roomCode, myName);
  }, [roomCode, myName, requestVoiceToken]);

  useEffect(() => {
    if (!roomCode || gameState?.status !== 'playing') return;
    const id = setInterval(() => { handleTurnTimeout(); }, 1000);
    return () => clearInterval(id);
  }, [roomCode, gameState?.status, gameState?.turnDeadlineAt, handleTurnTimeout]);

  return {
    clientId,
    myId,
    myName,
    roomCode,
    isHost,
    gameState,
    error,
    clearError,
    loading,
    voiceToken,
    voiceUrl,
    voiceError,
    requestVoiceToken,
    createRoom,
    joinRoom,
    updateConfig,
    leaveRoom,
    startGame,
    nextRound,
    playAgain,
    throwSelected,
    pickFromDeck,
    pickFromPrevious,
    drawFromDeck,
    takeDiscard,
    swapCards,
    discardDrawn,
    matchCards,
    knock,
  };
}
