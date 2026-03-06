import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db, ensureAuthUser } from '../firebase';
import { RANKS } from '../utils/gameUtils';

const STORAGE_CLIENT_ID = 'leastsum.clientId';
const STORAGE_LAST_ROOM = 'leastsum.lastRoomCode';
const STORAGE_PLAYER_PREFIX = 'leastsum.playerByRoom.';
const GAME_API_BASE_URL = String(import.meta.env.VITE_GAME_API_BASE_URL || '').replace(/\/+$/, '');

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

  const legacyBluffLiveCards = Array.isArray(publicState.bluffLivePileCards) ? publicState.bluffLivePileCards : [];
  const legacyByPlayerCount = {};
  legacyBluffLiveCards.forEach((entry) => {
    const playerId = entry?.byPlayerId;
    if (!playerId) return;
    legacyByPlayerCount[playerId] = (legacyByPlayerCount[playerId] || 0) + 1;
  });
  const fallbackLiveRiskPublic = {
    totalCards: Number(publicState.bluffLivePileCount || legacyBluffLiveCards.length || 0),
    byPlayer: Object.entries(legacyByPlayerCount).map(([playerId, cardCount]) => ({
      playerId,
      cardCount: Number(cardCount || 0),
    })),
  };

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
    bluffActiveClaimPublic: publicState.bluffActiveClaimPublic || null,
    bluffLivePileCount: Number(publicState.bluffLivePileCount || 0),
    bluffAsideCount: Number(publicState.bluffAsideCount || 0),
    bluffLiveRiskPublic: publicState.bluffLiveRiskPublic || fallbackLiveRiskPublic,
    bluffChainHistoryPublic: Array.isArray(publicState.bluffChainHistoryPublic)
      ? publicState.bluffChainHistoryPublic
      : (Array.isArray(publicState.bluffClaimHistory) ? publicState.bluffClaimHistory : []),
    bluffLivePileCards: legacyBluffLiveCards,
    bluffClaimHistory: Array.isArray(publicState.bluffClaimHistory) ? publicState.bluffClaimHistory : [],
    bluffFinishOrder: Array.isArray(publicState.bluffFinishOrder) ? publicState.bluffFinishOrder : [],
    bluffLastObjectionReveal: publicState.bluffLastObjectionReveal || null,
    // Compatibility for older UI paths.
    bluffDeclaredRank: publicState.bluffDeclaredRank || publicState.bluffActiveClaimPublic?.declaredRank || null,
    bluffLastClaim: publicState.bluffLastClaim || publicState.bluffActiveClaimPublic || null,
    bluffLastReveal: publicState.bluffLastReveal || publicState.bluffLastObjectionReveal || null,
    jokerCard: publicState.jokerCard || null,
    knocker: publicState.knocker || null,
    knockerFailed: !!publicState.knockerFailed,
    roundResults: publicState.roundResults || null,
    roundHistory: Array.isArray(publicState.roundHistory) ? publicState.roundHistory : [],
    roundReveal: publicState.roundReveal || null,
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

const SAFE_ERROR_MESSAGES = new Set([
  'Room not found.',
  'Room is full.',
  'Game already started.',
  'Name already taken in this room.',
  'Session expired. Please join again from waiting room.',
  'Legacy insecure room is disabled. Create a new secure room.',
  'Invalid room code.',
  'Invalid auth token.',
  'Missing bearer auth token.',
  'You are not a member of this room.',
  'Too many join attempts. Please wait a minute and try again.',
  'Too many restore attempts. Please wait a minute and try again.',
  'Room expired due to inactivity. Create or join a new room.',
  'Kick is available only in waiting room.',
  'Only host can kick players in waiting room.',
  'Player not found in room.',
  'Host cannot kick self. Use leave instead.',
  'Target player is required.',
]);

const INTERNAL_ERROR_PATTERNS = [
  /RTDB/i,
  /OAuth/i,
  /roomsV2/i,
  /roomsV2_engine/i,
  /requestId/i,
  /Unauthorized request/i,
  /Missing FIREBASE_/i,
  /transaction/i,
];

function toUiError(err, fallback = 'Something went wrong. Please try again.') {
  const status = Number(err?.status || 0);
  const message = String(err?.message || err?.payload?.error || '').trim();

  if (status >= 500) return 'Service temporarily unavailable. Please try again.';
  if (!message) return fallback;
  if (SAFE_ERROR_MESSAGES.has(message)) return message;
  if (INTERNAL_ERROR_PATTERNS.some((re) => re.test(message))) return fallback;
  if (message.length > 140) return fallback;
  return message;
}

function isPermanentRestoreFailure(err) {
  const status = Number(err?.status || 0);
  const message = String(err?.payload?.error || err?.message || '');

  if (status === 404 || status === 410) return true;
  if (status === 401) return true;
  if (status === 403 && /member|session|denied/i.test(message)) return true;
  if (status === 400 && /invalid room|session expired|room not found|legacy insecure/i.test(message)) return true;
  return false;
}

function resolveApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!GAME_API_BASE_URL) return path;
  const normalized = String(path || '');
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  if (GAME_API_BASE_URL.endsWith('/api') && withSlash.startsWith('/api/')) {
    return `${GAME_API_BASE_URL}${withSlash.slice(4)}`;
  }
  return `${GAME_API_BASE_URL}${withSlash}`;
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
    const res = await fetch(resolveApiUrl(path), {
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

    let lastRoom = '';
    try {
      await ensureAuthUser();
      if (!hasWindow()) return;

      lastRoom = window.localStorage.getItem(STORAGE_LAST_ROOM) || '';
      if (!lastRoom) return;

      const stored = readRoomSession(lastRoom);
      if (!stored?.playerId) {
        clearRoomSession(lastRoom);
        return;
      }

      // Attach immediately from local session so refresh does not drop the player view.
      attachLocalSession({
        roomCode: lastRoom,
        playerId: stored.playerId,
        playerName: stored.playerName,
      });

      const result = await gameApiPost('reclaim', {
        roomCode: lastRoom,
        name: stored.playerName,
      });

      attachLocalSession({
        roomCode: result.roomCode || lastRoom,
        playerId: result.playerId || stored.playerId,
        playerName: result.playerName || stored.playerName,
      });
    } catch (err) {
      if (lastRoom && isPermanentRestoreFailure(err)) {
        clearLocalRoomState(lastRoom);
        setError(toUiError(err, 'Unable to restore previous session.'));
      }
    }
  }, [attachLocalSession, clearLocalRoomState, gameApiPost]);

  useEffect(() => {
    restoreSessionOnLoad();
  }, [restoreSessionOnLoad]);

  useEffect(() => {
    if (!roomCode) return undefined;

    const publicRef = ref(db, `roomsV2/${roomCode}/public`);
    const privateRef = myId ? ref(db, `roomsV2/${roomCode}/private/${myId}`) : null;

    const unsubPublic = onValue(
      publicRef,
      (snap) => {
        if (!snap.exists()) {
          clearLocalRoomState(roomCode);
          setError('Room ended due to inactivity or all players left.');
          return;
        }
        const nextPublic = snap.val();
        if (myId && nextPublic?.players && !nextPublic.players[myId]) {
          clearLocalRoomState(roomCode);
          setError('You were removed due to inactivity.');
          return;
        }
        setPublicState(nextPublic);
      },
      () => {
        clearLocalRoomState(roomCode);
        setError('Unable to restore this session. Please join again.');
      },
    );

    let unsubPrivate = () => {};
    if (privateRef) {
      unsubPrivate = onValue(
        privateRef,
        (snap) => {
          setPrivateState(snap.exists() ? snap.val() : null);
        },
        () => {
          clearLocalRoomState(roomCode);
          setError('Unable to restore this session. Please join again.');
        },
      );
    }

    return () => {
      unsubPublic();
      unsubPrivate();
    };
  }, [roomCode, myId, clearLocalRoomState]);

  const requestVoiceToken = useCallback(async (room, name) => {
    const endpoint = resolveApiUrl(import.meta.env.VITE_VOICE_TOKEN_ENDPOINT || '/api/get-token');
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

  const createRoom = async (playerName, config = null) => {
    if (!playerName?.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const payload = { name: playerName.trim() };
      if (config && typeof config === 'object') {
        payload.config = config;
      }
      const result = await gameApiPost('create', payload);
      attachLocalSession(result);
    } catch (err) {
      setError(toUiError(err, 'Failed to create room.'));
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
      const msg = String(joinErr?.payload?.error || joinErr?.message || '');
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
          setError(toUiError(reclaimErr, 'Unable to rejoin started game.'));
          setLoading(false);
          return;
        }
      }

      setError(toUiError(joinErr, 'Failed to join room.'));
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
      setError(toUiError(err, 'Unable to start game.'));
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
      const backendMessage = String(err?.payload?.error || '').trim();
      const fallbackMessage = String(err?.message || '').trim();
      return {
        ok: false,
        ...(err?.payload || {}),
        reason: err?.payload?.reason,
        error: backendMessage,
        message: backendMessage || fallbackMessage,
      };
    }
  };

  const pickFromDeck = async () => {
    try {
      await gameApiPost('pick', {
        roomCode: roomCodeRef.current,
        source: 'deck',
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  };

  const pickFromPrevious = async () => {
    try {
      await gameApiPost('pick', {
        roomCode: roomCodeRef.current,
        source: 'previous',
      });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  };

  const bluffPlaceClaimAction = async (indices, declaredRank) => {
    try {
      const normalized = String(declaredRank || '').trim().toUpperCase();
      if (!RANKS.includes(normalized)) {
        return { ok: false, message: 'Invalid declared rank.' };
      }
      const result = await gameApiPost('bluffPlaceClaim', {
        roomCode: roomCodeRef.current,
        indices: Array.isArray(indices) ? indices : [],
        declaredRank: normalized,
      });
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, ...(err?.payload || {}), message: err?.message || 'Bluff play failed.' };
    }
  };

  const bluffPassAction = async () => {
    try {
      const result = await gameApiPost('bluffPass', {
        roomCode: roomCodeRef.current,
      });
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, ...(err?.payload || {}), message: err?.message || 'Pass failed.' };
    }
  };

  const bluffObjectionAction = async () => {
    try {
      const result = await gameApiPost('bluffObjection', {
        roomCode: roomCodeRef.current,
      });
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, ...(err?.payload || {}), message: err?.message || 'Objection failed.' };
    }
  };

  const bluffPlayAction = async (indices, declaredRank) => bluffPlaceClaimAction(indices, declaredRank);
  const bluffChallengeAction = async () => bluffObjectionAction();

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

  const kickPlayer = async (targetPlayerId) => {
    const roomCode = roomCodeRef.current;
    if (!roomCode || !targetPlayerId) return { ok: false, message: 'Invalid player.' };
    try {
      await gameApiPost('kickPlayer', {
        roomCode,
        targetPlayerId,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        ...(err?.payload || {}),
        message: toUiError(err, 'Unable to kick player.'),
      };
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
        const result = await gameApiPost('timeout', { roomCode });
        if (result?.roomDeleted) {
          clearLocalRoomState(roomCode);
          setError('Room ended due to inactivity or all players left.');
        }
      } catch {
        // harmless when timeout is not due or another client already processed it
      } finally {
        timeoutInFlightRef.current = false;
      }
    }, 1000);

    return () => clearInterval(id);
  }, [clearLocalRoomState, gameApiPost, gameState, roomCode]);

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
    kickPlayer,
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
    bluffPlaceClaim: bluffPlaceClaimAction,
    bluffPlay: bluffPlayAction,
    bluffPass: bluffPassAction,
    bluffObjection: bluffObjectionAction,
    bluffChallenge: bluffChallengeAction,
  };
}
