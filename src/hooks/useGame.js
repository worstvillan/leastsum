import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db, ensureAuthUser } from '../firebase';

const STORAGE_CLIENT_ID = 'leastsum.clientId';
const STORAGE_LAST_ROOM = 'leastsum.lastRoomCode';
const STORAGE_PLAYER_PREFIX = 'leastsum.playerByRoom.';

function hasWindow() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function getOrCreateClientId() {
  if (!hasWindow()) return `c_${Math.random().toString(36).slice(2, 10)}`;
  const existing = window.localStorage.getItem(STORAGE_CLIENT_ID);
  if (existing) return existing;
  const next = `c_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(STORAGE_CLIENT_ID, next);
  return next;
}

function playerSessionKey(roomCode) {
  return `${STORAGE_PLAYER_PREFIX}${roomCode}`;
}

function normalizeName(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
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
      nameKey: data.nameKey || normalizeName(data.playerName),
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

function createArrayOfLength(length, fill = null) {
  const n = Number(length || 0);
  if (!Number.isFinite(n) || n <= 0) return [];
  return Array.from({ length: n }, () => fill);
}

function mapProjectionToGameState(publicState, privateState, myId) {
  if (!publicState) return null;

  const players = publicState.players || {};
  const handCounts = publicState.handCounts || {};

  const hands = {};
  Object.keys(players).forEach((playerId) => {
    const count = Number(handCounts[playerId] || 0);
    if (playerId === myId) {
      hands[playerId] = Array.isArray(privateState?.hand) ? privateState.hand : [];
      return;
    }
    hands[playerId] = createArrayOfLength(count, {});
  });

  const deckCount = Number(publicState.deckCount || 0);
  const pileCount = Number(publicState.pileCount || 0);
  const pileTop = publicState.pileTop || null;

  const pile = createArrayOfLength(Math.max(0, pileCount - 1), {});
  if (pileCount > 0) {
    pile.push(pileTop);
  }

  return {
    roomCode: publicState.roomCode,
    status: publicState.status,
    timeoutStreak: Number(publicState.timeoutStreak || 0),
    hostPlayerId: publicState.hostPlayerId || null,
    config: publicState.config || {},
    players,
    dealerIdx: Number(publicState.dealerIdx || 0),
    round: Number(publicState.round || 0),
    phase: publicState.phase || 'throw',
    turnOrder: Array.isArray(publicState.turnOrder) ? publicState.turnOrder : [],
    currentTurnIdx: Number(publicState.currentTurnIdx || 0),
    turnCount: Number(publicState.turnCount || 0),
    deck: createArrayOfLength(deckCount, {}),
    pile,
    previousCard: publicState.previousCard || null,
    pendingThrownCards: createArrayOfLength(Number(publicState.pendingThrownCount || 0), {}),
    jokerCard: publicState.jokerCard || null,
    knocker: publicState.knocker || null,
    knockerFailed: !!publicState.knockerFailed,
    roundResults: publicState.roundResults || null,
    turnDeadlineAt: publicState.turnDeadlineAt || null,
    hands,
  };
}

async function readErrorPayload(res) {
  try {
    const data = await res.json();
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function resolveHostPlayerId(state) {
  if (state?.hostPlayerId) return state.hostPlayerId;
  const entries = Object.entries(state?.players || {}).sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));
  return entries[0]?.[0] || null;
}

export function useGame() {
  const [clientId] = useState(() => getOrCreateClientId());
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceToken, setVoiceToken] = useState('');
  const [voiceUrl, setVoiceUrl] = useState(import.meta.env.VITE_LIVEKIT_URL || '');
  const [voiceError, setVoiceError] = useState('');

  const [publicState, setPublicState] = useState(null);
  const [privateState, setPrivateState] = useState(null);

  const myIdRef = useRef('');
  const roomCodeRef = useRef('');
  const restoredOnceRef = useRef(false);
  const timeoutInFlightRef = useRef(false);

  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  const gameState = useMemo(
    () => mapProjectionToGameState(publicState, privateState, myId),
    [publicState, privateState, myId],
  );

  useEffect(() => {
    if (!gameState) {
      setIsHost(false);
      return;
    }
    const hostId = resolveHostPlayerId(gameState);
    setIsHost(gameState.status === 'waiting' && hostId === myIdRef.current);
  }, [gameState]);

  const clearError = useCallback(() => setError(''), []);

  const ensureIdToken = useCallback(async () => {
    const user = await ensureAuthUser();
    if (!user) throw new Error('Auth failed. Please refresh and try again.');
    return user.getIdToken();
  }, []);

  const apiPost = useCallback(async (path, body = {}, opts = {}) => {
    const token = await ensureIdToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const payload = await readErrorPayload(res);
      const message = payload.error || `Request failed: ${res.status}`;
      const errorObj = new Error(message);
      errorObj.status = res.status;
      errorObj.payload = payload;
      throw errorObj;
    }

    if (opts.raw) return res;

    const data = await res.json().catch(() => ({}));
    return data || {};
  }, [ensureIdToken]);

  const gameApiPost = useCallback((action, body = {}) => {
    return apiPost('/api/game', { action, ...body });
  }, [apiPost]);

  const clearLocalRoomState = useCallback((codeToClear = roomCodeRef.current) => {
    if (codeToClear) clearRoomSession(codeToClear);
    setRoomCode('');
    setMyId('');
    setMyName('');
    setPublicState(null);
    setPrivateState(null);
    setVoiceToken('');
    setVoiceError('');
    setIsHost(false);
  }, []);

  const attachLocalSession = useCallback(({ roomCode: code, playerId, playerName }) => {
    setRoomCode(code);
    setMyId(playerId);
    setMyName(playerName || 'Player');
    persistRoomSession(code, {
      playerId,
      playerName: playerName || 'Player',
      nameKey: normalizeName(playerName || 'Player'),
    });
  }, []);

  const restoreSessionOnLoad = useCallback(async () => {
    if (restoredOnceRef.current) return;
    restoredOnceRef.current = true;

    try {
      await ensureAuthUser();
      if (!hasWindow()) return;

      const lastRoom = window.localStorage.getItem(STORAGE_LAST_ROOM);
      if (!lastRoom) return;

      const stored = readRoomSession(lastRoom);
      if (!stored?.playerId) {
        clearRoomSession(lastRoom);
        return;
      }

      const result = await gameApiPost('reclaim', { roomCode: lastRoom, name: stored.playerName });

      attachLocalSession({
        roomCode: result.roomCode || lastRoom,
        playerId: result.playerId || stored.playerId,
        playerName: result.playerName || stored.playerName,
      });
    } catch {
      if (hasWindow()) {
        const lastRoom = window.localStorage.getItem(STORAGE_LAST_ROOM);
        if (lastRoom) clearRoomSession(lastRoom);
      }
    }
  }, [attachLocalSession, gameApiPost]);

  useEffect(() => {
    restoreSessionOnLoad();
  }, [restoreSessionOnLoad]);

  useEffect(() => {
    if (!roomCode) return undefined;

    const publicRef = ref(db, `roomsV2/${roomCode}/public`);
    const privateRef = myId ? ref(db, `roomsV2/${roomCode}/private/${myId}`) : null;

    const unsubPublic = onValue(publicRef, (snap) => {
      if (!snap.exists()) {
        clearLocalRoomState(roomCode);
        setError('Room ended due to inactivity or all players left.');
        return;
      }
      setPublicState(snap.val());
    });

    let unsubPrivate = () => {};
    if (privateRef) {
      unsubPrivate = onValue(privateRef, (snap) => {
        setPrivateState(snap.exists() ? snap.val() : null);
      });
    }

    return () => {
      unsubPublic();
      unsubPrivate();
    };
  }, [roomCode, myId, clearLocalRoomState]);

  const requestVoiceToken = useCallback(async (room, name) => {
    const endpoint = import.meta.env.VITE_VOICE_TOKEN_ENDPOINT || '/api/get-token';
    try {
      const token = await ensureIdToken();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roomCode: room, roomName: room, participantName: name }),
      });

      if (!res.ok) {
        throw new Error(`Token API failed: ${res.status}`);
      }

      const data = await res.json();
      if (!data?.token) throw new Error('Token missing in response');

      setVoiceToken(data.token);
      if (typeof data.url === 'string' && data.url.length > 0) {
        setVoiceUrl(data.url);
      }
      setVoiceError('');
      return true;
    } catch {
      setVoiceToken('');
      setVoiceError('Voice unavailable. Game is still playable.');
      return false;
    }
  }, [ensureIdToken]);

  useEffect(() => {
    if (!roomCode || !myName) return;
    requestVoiceToken(roomCode, myName);
  }, [roomCode, myName, requestVoiceToken]);

  const createRoom = async (playerName) => {
    if (!playerName?.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await gameApiPost('create', { name: playerName.trim() });
      attachLocalSession(result);
    } catch (err) {
      setError(err?.message || 'Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (playerName, code) => {
    if (!playerName?.trim() || !code || code.length !== 4 || loading) return;
    setLoading(true);
    setError('');

    try {
      const upperCode = code.toUpperCase();
      const joined = await gameApiPost('join', { name: playerName.trim(), roomCode: upperCode });
      attachLocalSession(joined);
    } catch (joinErr) {
      const msg = joinErr?.message || '';
      const upperCode = code.toUpperCase();

      if (msg === 'Game already started.') {
        try {
          const reclaimed = await gameApiPost('reclaim', {
            name: playerName.trim(),
            roomCode: upperCode,
          });
          attachLocalSession(reclaimed);
          setLoading(false);
          return;
        } catch (reclaimErr) {
          setError(reclaimErr?.message || 'Unable to rejoin started game.');
          setLoading(false);
          return;
        }
      }

      setError(joinErr?.message || 'Failed to join room.');
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (newConfig) => {
    const code = roomCodeRef.current;
    if (!code || !gameState || gameState.status !== 'waiting') return;
    try {
      await gameApiPost('updateConfig', {
        roomCode: code,
        config: newConfig,
      });
    } catch {
      // Silent: UI is realtime and will remain with previous config.
    }
  };

  const startGame = async () => {
    const code = roomCodeRef.current;
    if (!code) return;
    try {
      await gameApiPost('start', { roomCode: code });
    } catch (err) {
      setError(err?.message || 'Unable to start game.');
    }
  };

  const leaveRoom = async () => {
    const code = roomCodeRef.current;
    if (!code) {
      clearLocalRoomState();
      return;
    }

    try {
      await gameApiPost('leave', { roomCode: code });
    } catch {
      // Room may already be gone; clear local state anyway.
    } finally {
      clearLocalRoomState(code);
    }
  };

  const throwSelected = async (indices) => {
    try {
      const result = await gameApiPost('throw', {
        roomCode: roomCodeRef.current,
        indices,
      });
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, ...(err?.payload || {}), reason: err?.payload?.reason };
    }
  };

  const pickFromDeck = async () => {
    try {
      await gameApiPost('pick', {
        roomCode: roomCodeRef.current,
        source: 'deck',
      });
    } catch {
      // no-op; state remains authoritative from server
    }
  };

  const pickFromPrevious = async () => {
    try {
      await gameApiPost('pick', {
        roomCode: roomCodeRef.current,
        source: 'previous',
      });
    } catch {
      // no-op; state remains authoritative from server
    }
  };

  const knockAction = async () => {
    try {
      await gameApiPost('knock', {
        roomCode: roomCodeRef.current,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, ...(err?.payload || {}) };
    }
  };

  const nextRound = async () => {
    try {
      await gameApiPost('nextRound', {
        roomCode: roomCodeRef.current,
      });
    } catch {
      // no-op
    }
  };

  const playAgain = async () => {
    try {
      await gameApiPost('playAgain', {
        roomCode: roomCodeRef.current,
      });
    } catch {
      // no-op
    }
  };

  const drawFromDeck = async () => pickFromDeck();
  const takeDiscard = async () => pickFromPrevious();
  const swapCards = throwSelected;
  const discardDrawn = async () => {};
  const matchCards = throwSelected;

  useEffect(() => {
    if (!roomCode || !gameState || gameState.status !== 'playing') return undefined;

    const id = setInterval(async () => {
      if (timeoutInFlightRef.current) return;
      const deadline = Number(gameState?.turnDeadlineAt || 0);
      if (!deadline || Date.now() + 250 < deadline) return;

      timeoutInFlightRef.current = true;
      try {
        await gameApiPost('timeout', { roomCode });
      } catch {
        // harmless when timeout is not due or another client already processed it
      } finally {
        timeoutInFlightRef.current = false;
      }
    }, 1000);

    return () => clearInterval(id);
  }, [gameApiPost, gameState, roomCode]);

  useEffect(() => {
    if (!error) return undefined;
    const id = setTimeout(() => setError(''), 4500);
    return () => clearTimeout(id);
  }, [error]);

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
    knock: knockAction,
  };
}
