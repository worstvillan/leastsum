import { ApiError } from './http.js';
import { freshDoubleDeck, hardShuffle, handSum } from '../../src/utils/gameUtils.js';

export const GAME_VERSION = 2;
export const DEFAULT_TURN_TIME_SEC = 45;
export const RECLAIM_STALE_MS = 30_000;

const DEFAULT_CONFIG = {
  cardsPerPlayer: 6,
  maxPlayers: 4,
  elimScore: 200,
  minTurnsToKnock: 1,
  knockerPenalty: 60,
  useJoker: false,
  turnTimeSec: DEFAULT_TURN_TIME_SEC,
};

export function normalizeName(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function sanitizePlayerName(name) {
  const value = String(name || '').trim();
  if (!value) {
    throw new ApiError(400, 'Player name is required.');
  }
  if (value.length > 20) {
    throw new ApiError(400, 'Player name is too long.');
  }
  return value;
}

export function makePlayerId() {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function resolveTurnTimeSec(config = {}) {
  const raw = Number.parseInt(config.turnTimeSec ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TURN_TIME_SEC;
  return Math.min(Math.max(raw, 5), 120);
}

export function sanitizeConfigPatch(input = {}, current = DEFAULT_CONFIG) {
  const next = { ...current };
  const value = input || {};

  const asInt = (v, fallback) => {
    const parsed = Number.parseInt(v ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  next.cardsPerPlayer = Math.min(10, Math.max(4, asInt(value.cardsPerPlayer, next.cardsPerPlayer)));
  next.maxPlayers = Math.min(8, Math.max(2, asInt(value.maxPlayers, next.maxPlayers)));
  next.elimScore = Math.min(500, Math.max(50, asInt(value.elimScore, next.elimScore)));
  next.minTurnsToKnock = Math.min(10, Math.max(0, asInt(value.minTurnsToKnock, next.minTurnsToKnock)));
  next.knockerPenalty = Math.min(300, Math.max(0, asInt(value.knockerPenalty, next.knockerPenalty)));
  next.useJoker = Boolean(value.useJoker ?? next.useJoker);
  next.turnTimeSec = resolveTurnTimeSec(value.turnTimeSec != null ? value : next);

  return next;
}

function activePlayerEntries(engine) {
  return Object.entries(engine.players || {})
    .filter(([, player]) => !player?.eliminated)
    .sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));
}

function activeTurnOrder(engine) {
  const players = engine.players || {};
  const turnOrder = Array.isArray(engine.turnOrder) ? engine.turnOrder : [];
  return turnOrder.filter((id) => players[id] && !players[id].eliminated);
}

function currentTurnId(engine) {
  const turnOrder = Array.isArray(engine.turnOrder) ? engine.turnOrder : [];
  return turnOrder[engine.currentTurnIdx ?? 0] ?? null;
}

function assertRoomState(engine) {
  if (!engine || typeof engine !== 'object') {
    throw new ApiError(404, 'Room not found.');
  }
}

function assertStarted(engine) {
  if (!['playing', 'roundEnd', 'gameover'].includes(engine.status)) {
    throw new ApiError(400, 'Game not started.');
  }
}

function assertPlayerTurn(engine, playerId) {
  const liveTurnId = currentTurnId(engine);
  if (liveTurnId && liveTurnId !== playerId) {
    throw new ApiError(403, 'Not your turn.');
  }
}

function resetTurnDeadline(engine) {
  engine.turnDeadlineAt = Date.now() + resolveTurnTimeSec(engine.config || {}) * 1000;
}

function nextTurn(engine) {
  const players = engine.players || {};
  const turnOrder = Array.isArray(engine.turnOrder) ? engine.turnOrder : [];
  const activeOrder = turnOrder.filter((id) => players[id] && !players[id].eliminated);

  if (activeOrder.length <= 1) {
    engine.status = 'gameover';
    engine.turnDeadlineAt = null;
    engine.phase = 'throw';
    engine.pendingThrownCards = null;
    return;
  }

  const current = currentTurnId(engine);
  const activeIdx = activeOrder.indexOf(current);
  const nextActiveIdx = activeIdx >= 0 ? (activeIdx + 1) % activeOrder.length : 0;
  const nextId = activeOrder[nextActiveIdx];
  const nextIdx = turnOrder.indexOf(nextId);

  engine.currentTurnIdx = nextIdx >= 0 ? nextIdx : 0;
  engine.turnCount = (engine.turnCount ?? 0) + 1;
  engine.phase = 'throw';
  engine.pendingThrownCards = null;
  engine.timeoutStreak = 0;
  resetTurnDeadline(engine);
}

function ensureDeckFromPile(engine) {
  let deck = Array.isArray(engine.deck) ? [...engine.deck] : [];
  let pile = Array.isArray(engine.pile) ? [...engine.pile] : [];

  if (deck.length === 0 && pile.length > 0) {
    deck = hardShuffle(pile);
    pile = [];
  }

  engine.deck = deck;
  engine.pile = pile;
}

export function createWaitingEngine({ roomCode, hostPlayerId, hostName, hostUid }) {
  const now = Date.now();
  return {
    version: GAME_VERSION,
    roomCode,
    status: 'waiting',
    timeoutStreak: 0,
    hostPlayerId,
    config: { ...DEFAULT_CONFIG },
    players: {
      [hostPlayerId]: {
        name: hostName,
        nameKey: normalizeName(hostName),
        uid: hostUid,
        order: 0,
        score: 0,
        eliminated: false,
        connected: true,
        lastSeenAt: now,
      },
    },
    dealerIdx: 0,
    round: 0,
    phase: 'throw',
    turnOrder: [],
    currentTurnIdx: 0,
    turnCount: 0,
    deck: [],
    pile: [],
    previousCard: null,
    pendingThrownCards: null,
    hands: {},
    roundResults: null,
    knocker: null,
    knockerFailed: false,
    jokerCard: null,
    turnDeadlineAt: null,
    updatedAt: now,
  };
}

export function startGame(engine, actorPlayerId) {
  assertRoomState(engine);
  if (engine.status !== 'waiting') {
    throw new ApiError(400, 'Game already started.');
  }
  if (engine.hostPlayerId !== actorPlayerId) {
    throw new ApiError(403, 'Only host can start in waiting room.');
  }

  const active = activePlayerEntries(engine);
  if (active.length < 2) {
    throw new ApiError(400, 'At least 2 players are required to start.');
  }

  const cardsPerPlayer = Number(engine.config?.cardsPerPlayer || DEFAULT_CONFIG.cardsPerPlayer);
  const deck = freshDoubleDeck();
  const hands = {};

  active.forEach(([id]) => {
    hands[id] = deck.splice(0, cardsPerPlayer);
  });

  const previousCard = deck.shift() || null;
  const turnOrder = active.map(([id]) => id);
  const firstTurnIdx = Math.floor(Math.random() * turnOrder.length);
  const dealerIdx = (firstTurnIdx - 1 + turnOrder.length) % turnOrder.length;

  engine.status = 'playing';
  engine.phase = 'throw';
  engine.round = (engine.round || 0) + 1;
  engine.deck = deck;
  engine.previousCard = previousCard;
  engine.pile = [];
  engine.hands = hands;
  engine.pendingThrownCards = null;
  engine.knocker = null;
  engine.knockerFailed = false;
  engine.roundResults = null;
  engine.dealerIdx = dealerIdx;
  engine.turnOrder = turnOrder;
  engine.currentTurnIdx = firstTurnIdx;
  engine.turnCount = 0;
  engine.jokerCard = engine.config?.useJoker ? deck[Math.floor(Math.random() * deck.length)] ?? null : null;
  engine.timeoutStreak = 0;
  resetTurnDeadline(engine);
}

export function updateConfig(engine, actorPlayerId, patch) {
  assertRoomState(engine);
  if (engine.status !== 'waiting') {
    throw new ApiError(400, 'Settings can be changed only in waiting room.');
  }
  if (engine.hostPlayerId !== actorPlayerId) {
    throw new ApiError(403, 'Only host can update settings.');
  }

  engine.config = sanitizeConfigPatch(patch, engine.config || DEFAULT_CONFIG);
}

export function joinWaitingRoom(engine, { playerId, name, uid }) {
  assertRoomState(engine);
  if (engine.status !== 'waiting') {
    throw new ApiError(400, 'Game already started.');
  }

  const players = engine.players || {};
  const maxPlayers = Number(engine.config?.maxPlayers || DEFAULT_CONFIG.maxPlayers);
  if (Object.keys(players).length >= maxPlayers) {
    throw new ApiError(400, 'Room is full.');
  }

  if (players[playerId]) {
    throw new ApiError(400, 'Player already exists in this room.');
  }

  const now = Date.now();
  players[playerId] = {
    name,
    nameKey: normalizeName(name),
    uid,
    order: Object.keys(players).length,
    score: 0,
    eliminated: false,
    connected: true,
    lastSeenAt: now,
  };
  engine.players = players;
}

export function reclaimPlayer(engine, { playerId, uid, nameHint }) {
  assertRoomState(engine);
  const player = engine.players?.[playerId];
  if (!player) {
    throw new ApiError(404, 'Player session not found in room.');
  }
  if (player.uid && player.uid !== uid) {
    throw new ApiError(403, 'Session belongs to another user.');
  }

  const now = Date.now();
  player.uid = uid;
  player.connected = true;
  player.lastSeenAt = now;
  if (!player.name && nameHint) {
    player.name = nameHint;
    player.nameKey = normalizeName(nameHint);
  }
}

export function throwCards(engine, actorPlayerId, indices) {
  assertRoomState(engine);
  assertStarted(engine);
  if (engine.status !== 'playing' || engine.phase !== 'throw') {
    throw new ApiError(400, 'Throw is not allowed now.');
  }
  assertPlayerTurn(engine, actorPlayerId);

  const hand = [...(engine.hands?.[actorPlayerId] || [])];
  if (hand.length === 0) {
    throw new ApiError(400, 'Hand is empty.');
  }

  const uniqueValid = [...new Set((indices || []).filter((i) => Number.isInteger(i) && i >= 0 && i < hand.length))].sort((a, b) => b - a);
  if (uniqueValid.length === 0) {
    throw new ApiError(400, 'Select at least one card to throw.');
  }

  const firstRank = hand[uniqueValid[0]]?.rank;
  if (!firstRank || !uniqueValid.every((idx) => hand[idx]?.rank === firstRank)) {
    throw new ApiError(400, 'Selected cards must have same rank.');
  }

  const oldPrevious = engine.previousCard || null;
  const isMatch = !!oldPrevious && firstRank === oldPrevious.rank;
  if (isMatch && uniqueValid.length >= hand.length) {
    throw new ApiError(400, 'Match throw must leave at least one card in hand.', {
      reason: 'MATCH_REQUIRES_ONE_CARD_LEFT',
    });
  }

  const thrown = [];
  uniqueValid.forEach((idx) => {
    thrown.unshift(hand.splice(idx, 1)[0]);
  });
  if (!thrown.length) {
    throw new ApiError(400, 'Invalid throw.');
  }

  engine.hands[actorPlayerId] = hand;
  engine.timeoutStreak = 0;
  resetTurnDeadline(engine);

  if (isMatch) {
    const pile = Array.isArray(engine.pile) ? [...engine.pile] : [];
    if (oldPrevious) pile.push(oldPrevious);
    if (thrown.length > 1) pile.push(...thrown.slice(0, -1));

    engine.pile = pile;
    engine.previousCard = thrown[thrown.length - 1];
    nextTurn(engine);
    return { phase: 'throw', matched: true };
  }

  engine.phase = 'pick';
  engine.pendingThrownCards = thrown;
  return { phase: 'pick', matched: false };
}

export function pickCard(engine, actorPlayerId, source) {
  assertRoomState(engine);
  assertStarted(engine);
  if (engine.status !== 'playing' || engine.phase !== 'pick') {
    throw new ApiError(400, 'Pick is not allowed now.');
  }
  assertPlayerTurn(engine, actorPlayerId);

  const pendingThrown = Array.isArray(engine.pendingThrownCards) ? engine.pendingThrownCards : [];
  if (pendingThrown.length === 0) {
    throw new ApiError(400, 'No pending thrown cards to resolve.');
  }

  const hand = [...(engine.hands?.[actorPlayerId] || [])];
  const oldPrevious = engine.previousCard || null;
  const pile = Array.isArray(engine.pile) ? [...engine.pile] : [];

  if (source === 'previous') {
    if (!oldPrevious) {
      throw new ApiError(400, 'No previous card available.');
    }
    hand.push(oldPrevious);
  } else {
    ensureDeckFromPile(engine);
    if (Array.isArray(engine.deck) && engine.deck.length > 0) {
      hand.push(engine.deck.shift());
    }
    if (oldPrevious) {
      pile.push(oldPrevious);
    }
  }

  if (pendingThrown.length > 1) {
    pile.push(...pendingThrown.slice(0, -1));
  }

  engine.hands[actorPlayerId] = hand;
  engine.pile = pile;
  engine.previousCard = pendingThrown[pendingThrown.length - 1];

  nextTurn(engine);
}

export function knock(engine, actorPlayerId) {
  assertRoomState(engine);
  assertStarted(engine);

  if (engine.status !== 'playing') {
    throw new ApiError(400, 'Knock is not allowed right now.');
  }

  assertPlayerTurn(engine, actorPlayerId);

  const minTurnsToKnock = Number(engine.config?.minTurnsToKnock ?? DEFAULT_CONFIG.minTurnsToKnock);
  if ((engine.turnCount ?? 0) < minTurnsToKnock) {
    throw new ApiError(400, 'Knock is not allowed yet.');
  }

  const myCards = engine.hands?.[actorPlayerId] || [];
  const mySum = handSum(myCards, engine.jokerCard);
  if (mySum >= 25) {
    throw new ApiError(400, `Knock allowed only below 25 (your sum: ${mySum}).`, {
      reason: 'KNOCK_SUM_LIMIT',
      sum: mySum,
      limit: 24,
    });
  }

  const players = engine.players || {};
  const activeIds = Object.entries(players)
    .filter(([, player]) => !player?.eliminated)
    .map(([id]) => id);

  const sums = {};
  activeIds.forEach((id) => {
    sums[id] = handSum(engine.hands?.[id] || [], engine.jokerCard);
  });

  const minSum = Math.min(...Object.values(sums));
  const knockerSum = sums[actorPlayerId] ?? 0;
  const penalty = Number(engine.config?.knockerPenalty ?? DEFAULT_CONFIG.knockerPenalty);
  const knockerFailed = knockerSum !== minSum;

  const roundResults = {};
  const updatedPlayers = { ...players };

  Object.entries(players).forEach(([id, player]) => {
    if (player?.eliminated) return;

    const sum = sums[id] ?? 0;
    let addedScore = sum;
    let penaltyApplied = false;

    if (id === actorPlayerId && !knockerFailed) {
      addedScore = 0;
    } else if (id === actorPlayerId && knockerFailed) {
      addedScore = knockerSum + penalty;
      penaltyApplied = true;
    }

    const newScore = (player.score || 0) + addedScore;
    const eliminated = newScore >= Number(engine.config?.elimScore ?? DEFAULT_CONFIG.elimScore);

    updatedPlayers[id] = {
      ...player,
      score: newScore,
      eliminated,
    };

    roundResults[id] = {
      sum,
      addedScore,
      penaltyApplied,
      newScore,
      eliminated,
      cardCount: Array.isArray(engine.hands?.[id]) ? engine.hands[id].length : 0,
      prevScore: player.score || 0,
    };
  });

  const survivors = Object.values(updatedPlayers).filter((player) => !player?.eliminated);

  engine.players = updatedPlayers;
  engine.roundResults = roundResults;
  engine.knocker = actorPlayerId;
  engine.knockerFailed = knockerFailed;
  engine.status = survivors.length <= 1 ? 'gameover' : 'roundEnd';
  engine.turnDeadlineAt = null;
  engine.timeoutStreak = 0;
}

function resolveLeaveCurrentPick(engine, leavingId) {
  if (engine.phase !== 'pick') return;
  if (currentTurnId(engine) !== leavingId) return;

  const pendingThrown = Array.isArray(engine.pendingThrownCards) ? engine.pendingThrownCards : [];
  if (!pendingThrown.length) return;

  const pile = Array.isArray(engine.pile) ? [...engine.pile] : [];
  const oldPrevious = engine.previousCard || null;

  if (oldPrevious) {
    pile.push(oldPrevious);
  }
  if (pendingThrown.length > 1) {
    pile.push(...pendingThrown.slice(0, -1));
  }

  engine.pile = pile;
  engine.previousCard = pendingThrown[pendingThrown.length - 1];
  engine.pendingThrownCards = null;
  engine.phase = 'throw';
}

export function leaveRoom(engine, actorPlayerId) {
  assertRoomState(engine);

  const players = { ...(engine.players || {}) };
  if (!players[actorPlayerId]) {
    return { deleteRoom: Object.keys(players).length === 0 };
  }

  resolveLeaveCurrentPick(engine, actorPlayerId);

  const prevTurnOrder = Array.isArray(engine.turnOrder) ? [...engine.turnOrder] : [];
  const removedIdx = prevTurnOrder.indexOf(actorPlayerId);
  const nextTurnOrder = prevTurnOrder.filter((id) => id !== actorPlayerId);

  delete players[actorPlayerId];
  engine.players = players;

  if (engine.hands?.[actorPlayerId]) {
    const nextHands = { ...engine.hands };
    delete nextHands[actorPlayerId];
    engine.hands = nextHands;
  }

  if (engine.roundResults?.[actorPlayerId]) {
    const nextResults = { ...engine.roundResults };
    delete nextResults[actorPlayerId];
    engine.roundResults = nextResults;
  }

  if (!Object.keys(players).length) {
    return { deleteRoom: true };
  }

  engine.turnOrder = nextTurnOrder;
  if (nextTurnOrder.length > 0) {
    let nextIdx = engine.currentTurnIdx ?? 0;
    if (removedIdx >= 0 && removedIdx < nextIdx) nextIdx -= 1;
    if (removedIdx === (engine.currentTurnIdx ?? 0)) {
      nextIdx = nextIdx % nextTurnOrder.length;
    }
    if (nextIdx < 0) nextIdx = 0;
    engine.currentTurnIdx = nextIdx;
  } else {
    engine.currentTurnIdx = 0;
  }

  if (!engine.hostPlayerId || engine.hostPlayerId === actorPlayerId) {
    const nextHost = Object.entries(players)
      .sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0))[0]?.[0] || null;
    engine.hostPlayerId = nextHost;
  }

  if (engine.status === 'playing') {
    const activeIds = activeTurnOrder(engine);
    if (activeIds.length <= 1) {
      engine.status = 'gameover';
      engine.turnDeadlineAt = null;
    } else {
      engine.phase = 'throw';
      engine.pendingThrownCards = null;
      resetTurnDeadline(engine);
    }
  }

  engine.timeoutStreak = 0;
  return { deleteRoom: false };
}

export function nextRound(engine) {
  assertRoomState(engine);
  if (engine.status !== 'roundEnd') {
    throw new ApiError(400, 'Round transition is not available.');
  }

  const active = activePlayerEntries(engine);
  if (active.length < 2) {
    engine.status = 'gameover';
    engine.turnDeadlineAt = null;
    return;
  }

  const cardsPerPlayer = Number(engine.config?.cardsPerPlayer || DEFAULT_CONFIG.cardsPerPlayer);
  const deck = freshDoubleDeck();
  const hands = {};

  active.forEach(([id]) => {
    hands[id] = deck.splice(0, cardsPerPlayer);
  });

  const previousCard = deck.shift() || null;
  const turnOrder = active.map(([id]) => id);
  const dealerIdx = ((Number(engine.dealerIdx ?? 0) + 1) % turnOrder.length + turnOrder.length) % turnOrder.length;
  const firstTurnIdx = (dealerIdx + 1) % turnOrder.length;

  engine.status = 'playing';
  engine.phase = 'throw';
  engine.round = (engine.round || 0) + 1;
  engine.deck = deck;
  engine.previousCard = previousCard;
  engine.pile = [];
  engine.hands = hands;
  engine.pendingThrownCards = null;
  engine.knocker = null;
  engine.knockerFailed = false;
  engine.roundResults = null;
  engine.dealerIdx = dealerIdx;
  engine.turnOrder = turnOrder;
  engine.currentTurnIdx = firstTurnIdx;
  engine.turnCount = 0;
  engine.jokerCard = engine.config?.useJoker ? deck[Math.floor(Math.random() * deck.length)] ?? null : null;
  engine.timeoutStreak = 0;
  resetTurnDeadline(engine);
}

export function playAgain(engine) {
  assertRoomState(engine);
  if (engine.status !== 'gameover') {
    throw new ApiError(400, 'Play-again is not available.');
  }

  const players = { ...(engine.players || {}) };
  Object.keys(players).forEach((id) => {
    players[id] = {
      ...players[id],
      score: 0,
      eliminated: false,
    };
  });

  engine.players = players;
  engine.status = 'waiting';
  engine.round = 0;
  engine.dealerIdx = 0;
  engine.phase = 'throw';
  engine.turnOrder = [];
  engine.currentTurnIdx = 0;
  engine.turnCount = 0;
  engine.deck = [];
  engine.pile = [];
  engine.previousCard = null;
  engine.pendingThrownCards = null;
  engine.hands = {};
  engine.knocker = null;
  engine.knockerFailed = false;
  engine.roundResults = null;
  engine.jokerCard = null;
  engine.timeoutStreak = 0;
  engine.turnDeadlineAt = null;
}

function applyTimeoutThrowFlow(engine, turnId) {
  const hand = Array.isArray(engine.hands?.[turnId]) ? [...engine.hands[turnId]] : [];
  if (!hand.length) {
    nextTurn(engine);
    return;
  }

  const randomIdx = Math.floor(Math.random() * hand.length);
  const thrown = hand.splice(randomIdx, 1)[0];
  const oldPrevious = engine.previousCard || null;
  const isMatch = !!oldPrevious && thrown?.rank === oldPrevious.rank;

  let deck = Array.isArray(engine.deck) ? [...engine.deck] : [];
  let pile = Array.isArray(engine.pile) ? [...engine.pile] : [];

  if (isMatch) {
    if (oldPrevious) pile.push(oldPrevious);
    engine.previousCard = thrown;
    engine.hands[turnId] = hand;
    engine.pile = pile;
    engine.deck = deck;
    nextTurn(engine);
    return;
  }

  if (deck.length === 0 && pile.length > 0) {
    deck = hardShuffle(pile);
    pile = [];
  }

  if (deck.length > 0) {
    hand.push(deck.shift());
    if (oldPrevious) pile.push(oldPrevious);
  } else if (oldPrevious) {
    hand.push(oldPrevious);
  }

  engine.previousCard = thrown;
  engine.hands[turnId] = hand;
  engine.deck = deck;
  engine.pile = pile;
  nextTurn(engine);
}

function applyTimeoutPickFlow(engine, turnId) {
  const pendingThrown = Array.isArray(engine.pendingThrownCards) ? engine.pendingThrownCards : [];
  if (!pendingThrown.length) {
    nextTurn(engine);
    return;
  }

  const hand = Array.isArray(engine.hands?.[turnId]) ? [...engine.hands[turnId]] : [];
  const oldPrevious = engine.previousCard || null;
  let deck = Array.isArray(engine.deck) ? [...engine.deck] : [];
  let pile = Array.isArray(engine.pile) ? [...engine.pile] : [];

  if (deck.length === 0 && pile.length > 0) {
    deck = hardShuffle(pile);
    pile = [];
  }

  let pickedFromPrevious = false;
  if (deck.length > 0) {
    hand.push(deck.shift());
  } else if (oldPrevious) {
    hand.push(oldPrevious);
    pickedFromPrevious = true;
  }

  if (!pickedFromPrevious && oldPrevious) {
    pile.push(oldPrevious);
  }
  if (pendingThrown.length > 1) {
    pile.push(...pendingThrown.slice(0, -1));
  }

  engine.hands[turnId] = hand;
  engine.deck = deck;
  engine.pile = pile;
  engine.previousCard = pendingThrown[pendingThrown.length - 1];
  nextTurn(engine);
}

export function timeoutTick(engine, actorPlayerId) {
  assertRoomState(engine);
  if (engine.status !== 'playing') {
    throw new ApiError(400, 'Timeout handler is only valid during active play.');
  }

  const deadline = Number(engine.turnDeadlineAt || 0);
  if (!deadline || Date.now() < deadline) {
    return { applied: false, reason: 'NOT_DUE' };
  }

  const turnOrder = Array.isArray(engine.turnOrder) ? engine.turnOrder : [];
  const players = engine.players || {};
  const connectedIds = turnOrder.filter((id) => players[id] && players[id].connected !== false);
  if (!connectedIds.length) {
    return { applied: false, reason: 'NO_CONNECTED' };
  }

  const arbiter = [...connectedIds].sort()[0];
  if (arbiter !== actorPlayerId) {
    throw new ApiError(403, 'Only timeout arbiter can apply timeout.');
  }

  const activeIds = activeTurnOrder(engine);
  if (activeIds.length < 2) {
    engine.status = 'gameover';
    engine.turnDeadlineAt = null;
    return { applied: true, ended: 'gameover' };
  }

  const priorTimeoutStreak = Number(engine.timeoutStreak || 0);

  const turnId = currentTurnId(engine);
  if (!turnId) {
    nextTurn(engine);
  } else if (engine.phase === 'pick') {
    applyTimeoutPickFlow(engine, turnId);
  } else {
    applyTimeoutThrowFlow(engine, turnId);
  }

  engine.timeoutStreak = priorTimeoutStreak + 1;

  if (engine.timeoutStreak >= activeIds.length) {
    return { applied: true, deleteRoom: true };
  }

  return { applied: true, deleteRoom: false };
}

export function markPlayerConnected(engine, playerId, connected = true) {
  const player = engine.players?.[playerId];
  if (!player) return;
  player.connected = connected;
  player.lastSeenAt = Date.now();
}

export function markPlayerStale(engine, staleMs = RECLAIM_STALE_MS) {
  const now = Date.now();
  Object.entries(engine.players || {}).forEach(([, player]) => {
    const lastSeenAt = Number(player?.lastSeenAt || 0);
    if (!lastSeenAt) return;
    if (now - lastSeenAt > staleMs) {
      player.connected = false;
    }
  });
}

export function buildPublicProjection(engine) {
  const players = engine.players || {};
  const publicPlayers = {};
  const handCounts = {};

  Object.entries(players).forEach(([id, player]) => {
    publicPlayers[id] = {
      name: player?.name || 'Player',
      nameKey: player?.nameKey || normalizeName(player?.name || ''),
      order: player?.order ?? 0,
      score: player?.score ?? 0,
      eliminated: !!player?.eliminated,
      connected: player?.connected !== false,
      lastSeenAt: Number(player?.lastSeenAt || 0),
    };

    handCounts[id] = Array.isArray(engine.hands?.[id]) ? engine.hands[id].length : 0;
  });

  const pile = Array.isArray(engine.pile) ? engine.pile : [];
  const deck = Array.isArray(engine.deck) ? engine.deck : [];

  return {
    version: GAME_VERSION,
    roomCode: engine.roomCode,
    status: engine.status,
    timeoutStreak: engine.timeoutStreak ?? 0,
    hostPlayerId: engine.hostPlayerId || null,
    config: engine.config || { ...DEFAULT_CONFIG },
    players: publicPlayers,
    handCounts,
    dealerIdx: engine.dealerIdx ?? 0,
    round: engine.round ?? 0,
    phase: engine.phase ?? 'throw',
    turnOrder: Array.isArray(engine.turnOrder) ? engine.turnOrder : [],
    currentTurnIdx: engine.currentTurnIdx ?? 0,
    turnCount: engine.turnCount ?? 0,
    deckCount: deck.length,
    pileCount: pile.length,
    pileTop: pile[pile.length - 1] || null,
    previousCard: engine.previousCard || null,
    pendingThrownCount: Array.isArray(engine.pendingThrownCards) ? engine.pendingThrownCards.length : 0,
    jokerCard: engine.jokerCard || null,
    knocker: engine.knocker || null,
    knockerFailed: !!engine.knockerFailed,
    roundResults: engine.roundResults || null,
    turnDeadlineAt: engine.turnDeadlineAt || null,
    updatedAt: Date.now(),
  };
}

export function buildPrivateProjection(engine, playerId) {
  const hand = Array.isArray(engine.hands?.[playerId]) ? engine.hands[playerId] : [];
  return {
    version: GAME_VERSION,
    playerId,
    hand,
    handSum: handSum(hand, engine.jokerCard || null),
    updatedAt: Date.now(),
  };
}

export function buildAllPrivateProjections(engine) {
  const all = {};
  Object.keys(engine.players || {}).forEach((playerId) => {
    all[playerId] = buildPrivateProjection(engine, playerId);
  });
  return all;
}
