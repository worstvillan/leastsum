import { ApiError } from './http.js';
import {
  freshDoubleDeck,
  hardShuffle,
  handSum,
  SUITS,
  RANKS,
  makeCard,
} from '../../src/utils/gameUtils.js';

export const GAME_VERSION = 2;
export const DEFAULT_TURN_TIME_SEC = 90;
export const RECLAIM_STALE_MS = 30_000;
export const WAITING_TTL_MS = 30 * 60 * 1000;
const BLUFF_PHASE_PLAY = 'bluff_play';

const DEFAULT_CONFIG = {
  gameMode: 'leastsum',
  bluffDeckCount: 1,
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

  if (value.gameMode != null) {
    const rawMode = String(value.gameMode).trim().toLowerCase();
    if (!['leastsum', 'bluff'].includes(rawMode)) {
      throw new ApiError(400, 'Game mode must be leastsum or bluff.');
    }
    next.gameMode = rawMode;
  } else if (!['leastsum', 'bluff'].includes(String(next.gameMode || '').toLowerCase())) {
    next.gameMode = 'leastsum';
  }

  if (value.bluffDeckCount != null) {
    const parsedDeckCount = Number.parseInt(value.bluffDeckCount, 10);
    if (!Number.isFinite(parsedDeckCount) || parsedDeckCount < 1 || parsedDeckCount > 10) {
      throw new ApiError(400, 'Bluff deck count must be between 1 and 10.');
    }
    next.bluffDeckCount = parsedDeckCount;
  } else if (!Number.isFinite(Number(next.bluffDeckCount))) {
    next.bluffDeckCount = 1;
  }

  next.cardsPerPlayer = Math.min(10, Math.max(4, asInt(value.cardsPerPlayer, next.cardsPerPlayer)));
  next.maxPlayers = Math.min(8, Math.max(2, asInt(value.maxPlayers, next.maxPlayers)));
  next.elimScore = Math.min(500, Math.max(50, asInt(value.elimScore, next.elimScore)));
  next.minTurnsToKnock = Math.min(10, Math.max(0, asInt(value.minTurnsToKnock, next.minTurnsToKnock)));
  next.knockerPenalty = Math.min(300, Math.max(0, asInt(value.knockerPenalty, next.knockerPenalty)));
  next.useJoker = Boolean(value.useJoker ?? next.useJoker);
  next.turnTimeSec = resolveTurnTimeSec(value.turnTimeSec != null ? value : next);

  // Bluff keeps elimination threshold fixed; do not expose it as a bluff-tunable setting.
  if (next.gameMode === 'bluff') {
    next.elimScore = DEFAULT_CONFIG.elimScore;
  }

  return next;
}

function activePlayerEntries(engine) {
  if (isBluffMode(engine)) {
    return Object.entries(engine.players || {})
      .filter(([, player]) => !player?.bluffFinished)
      .sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));
  }
  return Object.entries(engine.players || {})
    .filter(([, player]) => !player?.eliminated)
    .sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));
}

function activeTurnOrder(engine) {
  const players = engine.players || {};
  const turnOrder = Array.isArray(engine.turnOrder) ? engine.turnOrder : [];
  if (isBluffMode(engine)) {
    return turnOrder.filter((id) => players[id] && !players[id].bluffFinished);
  }
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

function isBluffMode(engine) {
  return String(engine?.config?.gameMode || 'leastsum').toLowerCase() === 'bluff';
}

function assertLeastSumMode(engine) {
  if (isBluffMode(engine)) {
    throw new ApiError(400, 'Action is not available in bluff mode.');
  }
}

function assertBluffMode(engine) {
  if (!isBluffMode(engine)) {
    throw new ApiError(400, 'Bluff action is available only in bluff mode.');
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

export function touchWaitingActivity(engine, now = Date.now()) {
  if (!engine || typeof engine !== 'object') return;
  if (engine.status !== 'waiting') return;
  engine.waitingLastActivityAt = Number(now);
}

export function isWaitingRoomExpired(engine, now = Date.now(), fallbackActivityAt = 0) {
  if (!engine || typeof engine !== 'object') return false;
  if (engine.status !== 'waiting') return false;
  const baseTs = Number(
    engine.waitingLastActivityAt
    || engine.updatedAt
    || fallbackActivityAt
    || 0,
  );
  if (!Number.isFinite(baseTs) || baseTs <= 0) return false;
  return now - baseTs > WAITING_TTL_MS;
}

function resetTimeoutProgress(engine) {
  engine.timeoutStreak = 0;
  engine.timeoutCycleIds = [];
}

function getTimeoutStrike(player) {
  return Number(player?.consecutiveTimeouts || 0);
}

function resetTimeoutStrike(engine, playerId) {
  if (!playerId) return;
  const player = engine?.players?.[playerId];
  if (!player) return;
  player.consecutiveTimeouts = 0;
}

function incrementTimeoutStrike(engine, playerId) {
  const player = engine?.players?.[playerId];
  if (!player) return 0;
  const next = getTimeoutStrike(player) + 1;
  player.consecutiveTimeouts = next;
  return next;
}

function nextTurn(engine, nextPhase = null) {
  const activeOrder = activeTurnOrder(engine);

  if (activeOrder.length <= 1) {
    if (isBluffMode(engine) && activeOrder.length === 1) {
      addToBluffFinishOrder(engine, activeOrder[0]);
    }
    engine.status = 'gameover';
    engine.turnDeadlineAt = null;
    engine.phase = isBluffMode(engine) ? BLUFF_PHASE_PLAY : 'throw';
    engine.pendingThrownCards = null;
    return;
  }

  const current = currentTurnId(engine);
  const activeIdx = activeOrder.indexOf(current);
  const nextActiveIdx = activeIdx >= 0 ? (activeIdx + 1) % activeOrder.length : 0;
  const nextId = activeOrder[nextActiveIdx];
  const fullTurnOrder = Array.isArray(engine.turnOrder) ? engine.turnOrder : [];
  const nextIdx = fullTurnOrder.indexOf(nextId);

  engine.currentTurnIdx = nextIdx >= 0 ? nextIdx : 0;
  engine.turnCount = (engine.turnCount ?? 0) + 1;
  engine.phase = nextPhase || (isBluffMode(engine) ? BLUFF_PHASE_PLAY : 'throw');
  engine.pendingThrownCards = null;
  resetTimeoutProgress(engine);
  resetTurnDeadline(engine);
}

function parseDeclaredRank(input) {
  const declared = String(input || '').trim().toUpperCase();
  if (!RANKS.includes(declared)) {
    throw new ApiError(400, 'Declared rank is invalid.');
  }
  return declared;
}

function ensureBluffCollections(engine) {
  if (!Array.isArray(engine.bluffLivePile)) engine.bluffLivePile = [];
  if (!Array.isArray(engine.bluffAsidePile)) engine.bluffAsidePile = [];
  if (!Array.isArray(engine.bluffFinishOrder)) engine.bluffFinishOrder = [];
  if (!Array.isArray(engine.bluffPendingFinish)) engine.bluffPendingFinish = [];
  if (!Array.isArray(engine.bluffLiveTrail)) engine.bluffLiveTrail = [];
  if (!Array.isArray(engine.bluffClaimHistory)) engine.bluffClaimHistory = [];
}

function pushBluffHistory(engine, event = {}) {
  ensureBluffCollections(engine);
  const nextEvent = {
    at: Date.now(),
    ...event,
  };
  engine.bluffClaimHistory = [...engine.bluffClaimHistory, nextEvent].slice(-80);
}

const BLUFF_CHAIN_TERMINAL_TYPES = new Set(['close', 'objection', 'claim_cancelled_leave']);

function sanitizeBluffChainEvent(event = {}) {
  const type = String(event?.type || '').trim();
  if (!type) return null;

  const base = {
    type,
    at: Number(event?.at || 0),
    byPlayerId: event?.byPlayerId || null,
    claimerId: event?.claimerId || null,
    declaredRank: event?.declaredRank || null,
    cardCount: Number(event?.cardCount || 0),
    passCount: Number(event?.passCount || 0),
    truthful: typeof event?.truthful === 'boolean' ? event.truthful : null,
    loserId: event?.loserId || null,
  };

  if (!['claim', 'pass', 'objection', 'close', 'claim_cancelled_leave'].includes(type)) {
    return null;
  }
  return base;
}

function buildBluffChainHistoryPublic(engine) {
  const fullHistory = Array.isArray(engine?.bluffClaimHistory) ? engine.bluffClaimHistory : [];
  const hasActiveClaim = !!engine?.bluffActiveClaim;
  if (!hasActiveClaim || !fullHistory.length) return [];

  let startIdx = 0;
  for (let i = fullHistory.length - 1; i >= 0; i -= 1) {
    if (BLUFF_CHAIN_TERMINAL_TYPES.has(fullHistory[i]?.type)) {
      startIdx = i + 1;
      break;
    }
  }

  return fullHistory
    .slice(startIdx)
    .map((entry) => sanitizeBluffChainEvent(entry))
    .filter(Boolean);
}

function buildBluffLiveRiskPublic(engine) {
  const liveTrail = Array.isArray(engine?.bluffLiveTrail) ? engine.bluffLiveTrail : [];
  const totalCards = Array.isArray(engine?.bluffLivePile) ? engine.bluffLivePile.length : 0;
  const byPlayerCount = new Map();

  liveTrail.forEach((entry) => {
    const playerId = entry?.byPlayerId || null;
    if (!playerId) return;
    byPlayerCount.set(playerId, (byPlayerCount.get(playerId) || 0) + 1);
  });

  const countedTotal = [...byPlayerCount.values()].reduce((sum, value) => sum + value, 0);
  if (countedTotal < totalCards) {
    const fallbackPlayerId = engine?.bluffActiveClaim?.claimerId || null;
    if (fallbackPlayerId) {
      byPlayerCount.set(
        fallbackPlayerId,
        (byPlayerCount.get(fallbackPlayerId) || 0) + (totalCards - countedTotal),
      );
    }
  }

  const orderByPlayerId = Object.fromEntries(
    Object.entries(engine?.players || {}).map(([id, player]) => [id, Number(player?.order ?? 0)]),
  );

  return {
    totalCards,
    byPlayer: [...byPlayerCount.entries()]
      .map(([playerId, cardCount]) => ({ playerId, cardCount }))
      .filter((entry) => entry.playerId && entry.cardCount > 0)
      .sort((a, b) => (orderByPlayerId[a.playerId] ?? 999) - (orderByPlayerId[b.playerId] ?? 999)),
  };
}

function isBluffActivePlayer(engine, playerId) {
  const player = engine.players?.[playerId];
  return !!player && !player.bluffFinished;
}

function appendPendingFinish(engine, playerId) {
  ensureBluffCollections(engine);
  if (!playerId || !isBluffActivePlayer(engine, playerId)) return;
  const handCount = Array.isArray(engine.hands?.[playerId]) ? engine.hands[playerId].length : 0;
  if (handCount > 0) return;
  if (engine.bluffFinishOrder.includes(playerId)) return;
  if (engine.bluffPendingFinish.includes(playerId)) return;
  engine.bluffPendingFinish.push(playerId);
}

function addToBluffFinishOrder(engine, playerId) {
  ensureBluffCollections(engine);
  if (!playerId) return;
  if (engine.bluffFinishOrder.includes(playerId)) return;
  const player = engine.players?.[playerId];
  if (player) {
    player.bluffFinished = true;
    player.eliminated = false;
  }
  engine.bluffFinishOrder.push(playerId);
}

function activeBluffIds(engine) {
  const players = engine.players || {};
  const order = Array.isArray(engine.turnOrder) ? engine.turnOrder : [];
  return order.filter((id) => players[id] && !players[id].bluffFinished);
}

function ensureCurrentTurnInActiveOrder(engine) {
  const activeIds = activeBluffIds(engine);
  if (!activeIds.length) return;
  const current = currentTurnId(engine);
  if (current && activeIds.includes(current)) return;
  engine.currentTurnIdx = resolveCurrentTurnOrderIndex(engine, activeIds[0]);
}

function advanceTurnFromPlayer(engine, fromPlayerId) {
  const activeIds = activeBluffIds(engine);
  if (!activeIds.length) {
    engine.turnDeadlineAt = null;
    engine.status = 'gameover';
    return;
  }
  if (activeIds.length === 1) {
    const [lastPlayerId] = activeIds;
    addToBluffFinishOrder(engine, lastPlayerId);
    engine.status = 'gameover';
    engine.turnDeadlineAt = null;
    engine.phase = BLUFF_PHASE_PLAY;
    return;
  }

  const pivot = activeIds.includes(fromPlayerId) ? fromPlayerId : activeIds[0];
  const pivotIdx = activeIds.indexOf(pivot);
  const nextId = activeIds[(pivotIdx + 1) % activeIds.length];
  engine.currentTurnIdx = resolveCurrentTurnOrderIndex(engine, nextId);
  engine.turnCount = (engine.turnCount ?? 0) + 1;
  engine.phase = BLUFF_PHASE_PLAY;
  engine.pendingThrownCards = null;
  resetTurnDeadline(engine);
}

function finalizeBluffPendingPlayers(engine) {
  ensureBluffCollections(engine);
  const pending = [...engine.bluffPendingFinish];
  engine.bluffPendingFinish = [];
  pending.forEach((playerId) => {
    const hand = engine.hands?.[playerId] || [];
    if (Array.isArray(hand) && hand.length === 0) {
      addToBluffFinishOrder(engine, playerId);
    }
  });
}

function finalizeBluffClaimerIfHandEmpty(engine, playerId) {
  ensureBluffCollections(engine);
  if (!playerId) return;
  const hand = Array.isArray(engine.hands?.[playerId]) ? engine.hands[playerId] : [];
  if (hand.length > 0) return;
  engine.bluffPendingFinish = engine.bluffPendingFinish.filter((id) => id !== playerId);
  addToBluffFinishOrder(engine, playerId);
}

function checkBluffGameOver(engine) {
  const activeIds = activeBluffIds(engine);
  if (activeIds.length > 1) return false;
  if (activeIds.length === 1) {
    addToBluffFinishOrder(engine, activeIds[0]);
  }
  engine.status = 'gameover';
  engine.phase = BLUFF_PHASE_PLAY;
  engine.turnDeadlineAt = null;
  return true;
}

function resolveCurrentTurnOrderIndex(engine, playerId) {
  const turnOrder = Array.isArray(engine.turnOrder) ? engine.turnOrder : [];
  const idx = turnOrder.indexOf(playerId);
  if (idx >= 0) return idx;
  return 0;
}

function appendRoundHistory(engine, roundResults) {
  const previousHistory = Array.isArray(engine.roundHistory) ? engine.roundHistory : [];
  engine.roundHistory = [
    ...previousHistory,
    {
      round: Number(engine.round || 0),
      at: Date.now(),
      results: roundResults,
    },
  ].slice(-50);
}

function buildRoundRevealFromHands(engine) {
  const reveal = {};
  Object.entries(engine.players || {}).forEach(([id, player]) => {
    if (player?.eliminated) return;
    reveal[id] = Array.isArray(engine.hands?.[id]) ? engine.hands[id].map((card) => ({ ...card })) : [];
  });
  return {
    round: Number(engine.round || 0),
    shownAt: Date.now(),
    handsByPlayer: reveal,
  };
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

function freshSingleDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(rank, suit));
    }
  }
  return deck;
}

function buildBluffDeck(deckCount) {
  const decks = Math.min(10, Math.max(1, Number(deckCount) || 1));
  const out = [];
  for (let i = 0; i < decks; i += 1) {
    out.push(...freshSingleDeck());
  }
  return hardShuffle(out);
}

function buildDeckForConfig(config = {}) {
  const gameMode = String(config.gameMode || 'leastsum').toLowerCase();
  if (gameMode === 'bluff') {
    return buildBluffDeck(config.bluffDeckCount);
  }
  return freshDoubleDeck();
}

function assertEnoughCardsToStart(activeCount, cardsPerPlayer, deckSize) {
  const required = activeCount * cardsPerPlayer + 1;
  if (deckSize >= required) return;
  throw new ApiError(400, 'Not enough cards for current player/deck settings.');
}

function dealLeastSumHands(activeIds, deck, cardsPerPlayer) {
  const hands = {};
  activeIds.forEach((id) => {
    hands[id] = deck.splice(0, cardsPerPlayer);
  });
  const previousCard = deck.shift() || null;
  return { hands, previousCard };
}

function dealBluffHands(activeIds, deck) {
  const hands = {};
  activeIds.forEach((id) => {
    hands[id] = [];
  });
  const aside = [];
  if (!activeIds.length) return { hands, previousCard: null, aside };

  const perPlayer = Math.floor(deck.length / activeIds.length);
  for (let i = 0; i < perPlayer; i += 1) {
    for (const playerId of activeIds) {
      hands[playerId].push(deck.shift());
    }
  }
  while (deck.length) {
    aside.push(deck.shift());
  }

  return { hands, previousCard: null, aside };
}

export function createWaitingEngine({ roomCode, hostPlayerId, hostName, hostUid }) {
  const now = Date.now();
  return {
    version: GAME_VERSION,
    roomCode,
    status: 'waiting',
    timeoutStreak: 0,
    timeoutCycleIds: [],
    hostPlayerId,
    config: { ...DEFAULT_CONFIG },
    players: {
      [hostPlayerId]: {
        name: hostName,
        nameKey: normalizeName(hostName),
        uid: hostUid,
        order: 0,
        score: 0,
        consecutiveTimeouts: 0,
        eliminated: false,
        bluffFinished: false,
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
    roundHistory: [],
    roundReveal: null,
    bluffActiveClaim: null,
    bluffLivePile: [],
    bluffAsidePile: [],
    bluffLiveTrail: [],
    bluffClaimHistory: [],
    bluffFinishOrder: [],
    bluffPendingFinish: [],
    bluffLastObjectionReveal: null,
    knocker: null,
    knockerFailed: false,
    jokerCard: null,
    turnDeadlineAt: null,
    waitingLastActivityAt: now,
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

  engine.config = sanitizeConfigPatch(engine.config || {}, DEFAULT_CONFIG);
  const gameMode = String(engine.config?.gameMode || 'leastsum').toLowerCase();
  const cardsPerPlayer = Number(engine.config?.cardsPerPlayer || DEFAULT_CONFIG.cardsPerPlayer);
  const deck = buildDeckForConfig(engine.config || {});
  const turnOrder = active.map(([id]) => id);
  let hands = {};
  let previousCard = null;
  let bluffAsidePile = [];

  if (gameMode === 'bluff') {
    ({ hands, previousCard, aside: bluffAsidePile } = dealBluffHands(turnOrder, deck));
  } else {
    assertEnoughCardsToStart(active.length, cardsPerPlayer, deck.length);
    ({ hands, previousCard } = dealLeastSumHands(turnOrder, deck, cardsPerPlayer));
  }

  const firstTurnIdx = Math.floor(Math.random() * turnOrder.length);
  const dealerIdx = (firstTurnIdx - 1 + turnOrder.length) % turnOrder.length;

  engine.status = 'playing';
  engine.phase = isBluffMode(engine) ? BLUFF_PHASE_PLAY : 'throw';
  engine.round = (engine.round || 0) + 1;
  engine.deck = deck;
  engine.previousCard = previousCard;
  engine.pile = [];
  engine.hands = hands;
  engine.pendingThrownCards = null;
  engine.knocker = null;
  engine.knockerFailed = false;
  engine.roundResults = null;
  engine.roundHistory = [];
  engine.roundReveal = null;
  engine.bluffActiveClaim = null;
  engine.bluffLivePile = [];
  engine.bluffAsidePile = bluffAsidePile;
  engine.bluffLiveTrail = [];
  engine.bluffClaimHistory = [];
  engine.bluffFinishOrder = [];
  engine.bluffPendingFinish = [];
  engine.bluffLastObjectionReveal = null;
  engine.dealerIdx = dealerIdx;
  engine.turnOrder = turnOrder;
  engine.currentTurnIdx = firstTurnIdx;
  engine.turnCount = 0;
  engine.jokerCard = engine.config?.gameMode === 'leastsum' && engine.config?.useJoker
    ? deck[Math.floor(Math.random() * deck.length)] ?? null
    : null;
  resetTimeoutProgress(engine);
  Object.values(engine.players || {}).forEach((player) => {
    player.bluffFinished = false;
    player.consecutiveTimeouts = 0;
  });
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

  const nextConfig = sanitizeConfigPatch(patch, engine.config || DEFAULT_CONFIG);
  engine.config = nextConfig;
  touchWaitingActivity(engine);
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
    consecutiveTimeouts: 0,
    eliminated: false,
    bluffFinished: false,
    connected: true,
    lastSeenAt: now,
  };
  engine.players = players;
  touchWaitingActivity(engine);
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
  if (!Number.isFinite(Number(player.consecutiveTimeouts))) {
    player.consecutiveTimeouts = 0;
  }
  if (!player.name && nameHint) {
    player.name = nameHint;
    player.nameKey = normalizeName(nameHint);
  }
  touchWaitingActivity(engine);
}

export function throwCards(engine, actorPlayerId, indices) {
  assertRoomState(engine);
  assertStarted(engine);
  assertLeastSumMode(engine);
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

  resetTimeoutStrike(engine, actorPlayerId);
  engine.hands[actorPlayerId] = hand;
  resetTimeoutProgress(engine);
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
  assertLeastSumMode(engine);
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

  resetTimeoutStrike(engine, actorPlayerId);
  engine.hands[actorPlayerId] = hand;
  engine.pile = pile;
  engine.previousCard = pendingThrown[pendingThrown.length - 1];

  nextTurn(engine);
}

export function knock(engine, actorPlayerId) {
  assertRoomState(engine);
  assertStarted(engine);
  assertLeastSumMode(engine);

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
      addedScore = knockerSum < 0 ? knockerSum : 0;
    } else if (id === actorPlayerId && knockerFailed) {
      addedScore = penalty;
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

  resetTimeoutStrike(engine, actorPlayerId);
  engine.players = updatedPlayers;
  engine.roundResults = roundResults;
  appendRoundHistory(engine, roundResults);
  engine.roundReveal = buildRoundRevealFromHands(engine);
  engine.knocker = actorPlayerId;
  engine.knockerFailed = knockerFailed;
  engine.status = survivors.length <= 1 ? 'gameover' : 'roundEnd';
  engine.turnDeadlineAt = null;
  resetTimeoutProgress(engine);
  engine.bluffActiveClaim = null;
  engine.bluffLivePile = [];
  engine.bluffAsidePile = [];
  engine.bluffLiveTrail = [];
  engine.bluffClaimHistory = [];
  engine.bluffFinishOrder = [];
  engine.bluffPendingFinish = [];
  engine.bluffLastObjectionReveal = null;
}

export function bluffPlaceClaim(engine, actorPlayerId, indices, declaredRankInput) {
  assertRoomState(engine);
  assertStarted(engine);
  assertBluffMode(engine);
  if (engine.status !== 'playing' || engine.phase !== BLUFF_PHASE_PLAY) {
    throw new ApiError(400, 'Place Claim is not allowed now.');
  }
  ensureBluffCollections(engine);
  ensureCurrentTurnInActiveOrder(engine);
  assertPlayerTurn(engine, actorPlayerId);

  const hand = [...(engine.hands?.[actorPlayerId] || [])];
  if (!hand.length) {
    throw new ApiError(400, 'Hand is empty.');
  }

  const picked = [...new Set((indices || []).filter((i) => Number.isInteger(i) && i >= 0 && i < hand.length))]
    .sort((a, b) => b - a);
  if (!picked.length) {
    throw new ApiError(400, 'Select at least one card to play face down.');
  }

  const declaredRank = parseDeclaredRank(declaredRankInput);
  const activeClaim = engine.bluffActiveClaim || null;
  const lifecycleRank = activeClaim?.declaredRank || null;
  if (lifecycleRank && declaredRank !== lifecycleRank) {
    throw new ApiError(400, `Declared rank must stay ${lifecycleRank} for this claim chain.`);
  }

  if (activeClaim?.claimerId && activeClaim.claimerId !== actorPlayerId) {
    // Previous claim becomes unchallengeable once a new claim is placed.
    // If that claimer already has zero cards, finalize immediately.
    finalizeBluffClaimerIfHandEmpty(engine, activeClaim.claimerId);
    if (checkBluffGameOver(engine)) {
      resetTimeoutProgress(engine);
      return { resolved: 'gameover', phase: BLUFF_PHASE_PLAY };
    }
  }

  resetTimeoutStrike(engine, actorPlayerId);
  const playedCards = [];
  picked.forEach((idx) => {
    playedCards.unshift(hand.splice(idx, 1)[0]);
  });
  const placedAt = Date.now();

  engine.hands[actorPlayerId] = hand;
  engine.bluffLivePile = [...engine.bluffLivePile, ...playedCards];
  engine.bluffLiveTrail = [
    ...(Array.isArray(engine.bluffLiveTrail) ? engine.bluffLiveTrail : []),
    ...playedCards.map((card) => ({
      rank: card?.rank,
      suit: card?.suit,
      byPlayerId: actorPlayerId,
      declaredRank: lifecycleRank || declaredRank,
      at: placedAt,
    })),
  ];
  engine.bluffActiveClaim = {
    claimerId: actorPlayerId,
    declaredRank: lifecycleRank || declaredRank,
    cards: playedCards.map((card) => ({ ...card })),
    startedAt: placedAt,
    passers: [],
  };
  appendPendingFinish(engine, actorPlayerId);
  engine.bluffLastObjectionReveal = null;
  pushBluffHistory(engine, {
    type: 'claim',
    byPlayerId: actorPlayerId,
    declaredRank: lifecycleRank || declaredRank,
    cardCount: playedCards.length,
    cards: playedCards.map((card) => ({ rank: card?.rank, suit: card?.suit })),
  });
  resetTimeoutProgress(engine);
  advanceTurnFromPlayer(engine, actorPlayerId);

  return {
    phase: BLUFF_PHASE_PLAY,
    declaredRank: engine.bluffActiveClaim.declaredRank,
    cardCount: playedCards.length,
  };
}

export function bluffPass(engine, actorPlayerId) {
  assertRoomState(engine);
  assertStarted(engine);
  assertBluffMode(engine);
  if (engine.status !== 'playing' || engine.phase !== BLUFF_PHASE_PLAY) {
    throw new ApiError(400, 'Pass is not allowed now.');
  }
  ensureBluffCollections(engine);
  ensureCurrentTurnInActiveOrder(engine);
  assertPlayerTurn(engine, actorPlayerId);

  const claim = engine.bluffActiveClaim || null;
  if (!claim || !claim.claimerId || !Array.isArray(claim.cards) || !claim.cards.length) {
    throw new ApiError(400, 'No claim available to pass/challenge.');
  }
  const activeIds = activeBluffIds(engine);
  const others = activeIds.filter((id) => id !== claim.claimerId);
  const passers = Array.isArray(claim.passers) ? [...claim.passers] : [];
  const allOthersPassedBeforeAction = others.every((id) => passers.includes(id));

  if (claim.claimerId === actorPlayerId) {
    if (!allOthersPassedBeforeAction) {
      throw new ApiError(400, 'Claimer can pass only after others pass or object.');
    }
    resetTimeoutStrike(engine, actorPlayerId);
    pushBluffHistory(engine, {
      type: 'pass',
      byPlayerId: actorPlayerId,
      claimerId: claim.claimerId,
      declaredRank: claim.declaredRank,
      passCount: passers.length,
      cardCount: Array.isArray(claim.cards) ? claim.cards.length : 0,
    });
    pushBluffHistory(engine, {
      type: 'close',
      byPlayerId: claim.claimerId,
      declaredRank: claim.declaredRank,
      cardCount: Array.isArray(engine.bluffLivePile) ? engine.bluffLivePile.length : 0,
    });
    engine.bluffAsidePile = [...engine.bluffAsidePile, ...engine.bluffLivePile];
    engine.bluffLivePile = [];
    engine.bluffLiveTrail = [];
    engine.bluffActiveClaim = null;
    finalizeBluffPendingPlayers(engine);
    if (checkBluffGameOver(engine)) {
      resetTimeoutProgress(engine);
      return { resolved: 'gameover' };
    }

    // Claimer chose to pass: next turn moves clockwise from claimer.
    advanceTurnFromPlayer(engine, claim.claimerId);
    resetTimeoutProgress(engine);
    return { resolved: 'closed', phase: BLUFF_PHASE_PLAY };
  }

  if (passers.includes(actorPlayerId)) {
    throw new ApiError(400, 'You already passed on this claim.');
  }
  resetTimeoutStrike(engine, actorPlayerId);
  passers.push(actorPlayerId);
  engine.bluffActiveClaim = { ...claim, passers };
  pushBluffHistory(engine, {
    type: 'pass',
    byPlayerId: actorPlayerId,
    claimerId: claim.claimerId,
    declaredRank: claim.declaredRank,
    passCount: passers.length,
    cardCount: Array.isArray(claim.cards) ? claim.cards.length : 0,
  });

  const allOthersPassed = others.every((id) => passers.includes(id));
  if (allOthersPassed) {
    const claimerHandCount = Array.isArray(engine.hands?.[claim.claimerId])
      ? engine.hands[claim.claimerId].length
      : 0;
    if (claimerHandCount === 0) {
      // A zero-card claimer should not receive another turn once all others passed.
      pushBluffHistory(engine, {
        type: 'close',
        byPlayerId: claim.claimerId,
        declaredRank: claim.declaredRank,
        cardCount: Array.isArray(engine.bluffLivePile) ? engine.bluffLivePile.length : 0,
      });
      engine.bluffAsidePile = [...engine.bluffAsidePile, ...engine.bluffLivePile];
      engine.bluffLivePile = [];
      engine.bluffLiveTrail = [];
      engine.bluffActiveClaim = null;
      finalizeBluffPendingPlayers(engine);
      if (checkBluffGameOver(engine)) {
        resetTimeoutProgress(engine);
        return { resolved: 'gameover' };
      }
      advanceTurnFromPlayer(engine, claim.claimerId);
      resetTimeoutProgress(engine);
      return { resolved: 'closed', phase: BLUFF_PHASE_PLAY };
    }

    // Do not close automatically. Return control to claimer for either play or pass.
    if (isBluffActivePlayer(engine, claim.claimerId)) {
      engine.currentTurnIdx = resolveCurrentTurnOrderIndex(engine, claim.claimerId);
      engine.turnCount = (engine.turnCount ?? 0) + 1;
      engine.phase = BLUFF_PHASE_PLAY;
      resetTurnDeadline(engine);
    } else {
      advanceTurnFromPlayer(engine, claim.claimerId);
    }
    resetTimeoutProgress(engine);
    return { resolved: 'claimer_turn', phase: BLUFF_PHASE_PLAY };
  }

  resetTimeoutProgress(engine);
  advanceTurnFromPlayer(engine, actorPlayerId);
  return { resolved: 'passed', phase: BLUFF_PHASE_PLAY };
}

export function bluffObjection(engine, actorPlayerId) {
  assertRoomState(engine);
  assertStarted(engine);
  assertBluffMode(engine);
  if (engine.status !== 'playing' || engine.phase !== BLUFF_PHASE_PLAY) {
    throw new ApiError(400, 'Objection is not allowed now.');
  }
  ensureBluffCollections(engine);
  ensureCurrentTurnInActiveOrder(engine);
  assertPlayerTurn(engine, actorPlayerId);

  const claim = engine.bluffActiveClaim || null;
  if (!claim || !Array.isArray(claim.cards) || !claim.cards.length) {
    throw new ApiError(400, 'No claim available to challenge.');
  }
  if (claim.claimerId === actorPlayerId) {
    throw new ApiError(400, 'Claimer cannot object own claim.');
  }

  resetTimeoutStrike(engine, actorPlayerId);
  const truthful = claim.cards.every((card) => card?.rank === claim.declaredRank);
  const loserId = truthful ? actorPlayerId : claim.claimerId;

  const pile = [...engine.bluffLivePile];
  const liveTrail = Array.isArray(engine.bluffLiveTrail) ? [...engine.bluffLiveTrail] : [];
  const loserHand = Array.isArray(engine.hands?.[loserId]) ? [...engine.hands[loserId]] : [];
  loserHand.push(...pile);
  engine.hands[loserId] = loserHand;
  engine.bluffLivePile = [];
  engine.bluffLiveTrail = [];

  engine.bluffLastObjectionReveal = {
    declaredRank: claim.declaredRank,
    cards: claim.cards.map((card) => ({ ...card })),
    claimerId: claim.claimerId,
    objectorId: actorPlayerId,
    truthful,
    loserId,
    at: Date.now(),
  };
  pushBluffHistory(engine, {
    type: 'objection',
    byPlayerId: actorPlayerId,
    claimerId: claim.claimerId,
    declaredRank: claim.declaredRank,
    truthful,
    loserId,
    cardCount: pile.length,
    cards: liveTrail.map((card) => ({ rank: card?.rank, suit: card?.suit })),
  });
  engine.bluffActiveClaim = null;
  finalizeBluffPendingPlayers(engine);
  if (checkBluffGameOver(engine)) {
    resetTimeoutProgress(engine);
    return { resolved: 'gameover', truthful, loserId };
  }

  if (truthful) {
    advanceTurnFromPlayer(engine, actorPlayerId);
  } else if (isBluffActivePlayer(engine, actorPlayerId)) {
    engine.currentTurnIdx = resolveCurrentTurnOrderIndex(engine, actorPlayerId);
    engine.turnCount = (engine.turnCount ?? 0) + 1;
    engine.phase = BLUFF_PHASE_PLAY;
    resetTurnDeadline(engine);
  } else {
    advanceTurnFromPlayer(engine, actorPlayerId);
  }

  resetTimeoutProgress(engine);
  return { resolved: 'objection', truthful, loserId, phase: BLUFF_PHASE_PLAY };
}

// Backward aliases for existing clients.
export function bluffPlay(engine, actorPlayerId, indices, declaredRankInput) {
  return bluffPlaceClaim(engine, actorPlayerId, indices, declaredRankInput);
}

export function bluffChallenge(engine, actorPlayerId) {
  return bluffObjection(engine, actorPlayerId);
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

  if (engine.roundReveal?.handsByPlayer?.[actorPlayerId]) {
    const nextRevealHands = { ...(engine.roundReveal.handsByPlayer || {}) };
    delete nextRevealHands[actorPlayerId];
    engine.roundReveal = {
      ...engine.roundReveal,
      handsByPlayer: nextRevealHands,
    };
  }

  if (isBluffMode(engine)) {
    ensureBluffCollections(engine);
    engine.bluffFinishOrder = engine.bluffFinishOrder.filter((id) => id !== actorPlayerId);
    engine.bluffPendingFinish = engine.bluffPendingFinish.filter((id) => id !== actorPlayerId);
    if (engine.bluffActiveClaim?.claimerId === actorPlayerId) {
      pushBluffHistory(engine, {
        type: 'claim_cancelled_leave',
        byPlayerId: actorPlayerId,
        cardCount: Array.isArray(engine.bluffLivePile) ? engine.bluffLivePile.length : 0,
      });
      engine.bluffAsidePile = [...engine.bluffAsidePile, ...engine.bluffLivePile];
      engine.bluffLivePile = [];
      engine.bluffLiveTrail = [];
      engine.bluffActiveClaim = null;
    } else if (engine.bluffActiveClaim?.passers?.length) {
      engine.bluffActiveClaim = {
        ...engine.bluffActiveClaim,
        passers: engine.bluffActiveClaim.passers.filter((id) => id !== actorPlayerId),
      };
    }
    if (engine.status === 'playing') {
      finalizeBluffPendingPlayers(engine);
      checkBluffGameOver(engine);
      engine.phase = BLUFF_PHASE_PLAY;
    }
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
      if (isBluffMode(engine) && activeIds.length === 1) {
        addToBluffFinishOrder(engine, activeIds[0]);
      }
      engine.status = 'gameover';
      engine.turnDeadlineAt = null;
    } else {
      engine.phase = isBluffMode(engine) ? BLUFF_PHASE_PLAY : 'throw';
      engine.pendingThrownCards = null;
      resetTurnDeadline(engine);
    }
  }

  touchWaitingActivity(engine);
  resetTimeoutProgress(engine);
  return { deleteRoom: false };
}

export function nextRound(engine) {
  assertRoomState(engine);
  if (isBluffMode(engine)) {
    throw new ApiError(400, 'Next round is not used in bluff mode.');
  }
  if (engine.status !== 'roundEnd') {
    throw new ApiError(400, 'Round transition is not available.');
  }

  const active = activePlayerEntries(engine);
  if (active.length < 2) {
    engine.status = 'gameover';
    engine.turnDeadlineAt = null;
    return;
  }

  engine.config = sanitizeConfigPatch(engine.config || {}, DEFAULT_CONFIG);
  const cardsPerPlayer = Number(engine.config?.cardsPerPlayer || DEFAULT_CONFIG.cardsPerPlayer);
  const deck = buildDeckForConfig(engine.config || {});
  const turnOrder = active.map(([id]) => id);
  let hands = {};
  let previousCard = null;
  assertEnoughCardsToStart(active.length, cardsPerPlayer, deck.length);
  ({ hands, previousCard } = dealLeastSumHands(turnOrder, deck, cardsPerPlayer));

  const dealerIdx = ((Number(engine.dealerIdx ?? 0) + 1) % turnOrder.length + turnOrder.length) % turnOrder.length;
  const firstTurnIdx = (dealerIdx + 1) % turnOrder.length;

  engine.status = 'playing';
  engine.phase = isBluffMode(engine) ? BLUFF_PHASE_PLAY : 'throw';
  engine.round = (engine.round || 0) + 1;
  engine.deck = deck;
  engine.previousCard = previousCard;
  engine.pile = [];
  engine.hands = hands;
  engine.pendingThrownCards = null;
  engine.knocker = null;
  engine.knockerFailed = false;
  engine.roundResults = null;
  engine.roundReveal = null;
  engine.bluffActiveClaim = null;
  engine.bluffLivePile = [];
  engine.bluffAsidePile = [];
  engine.bluffLiveTrail = [];
  engine.bluffClaimHistory = [];
  engine.bluffFinishOrder = [];
  engine.bluffPendingFinish = [];
  engine.bluffLastObjectionReveal = null;
  engine.dealerIdx = dealerIdx;
  engine.turnOrder = turnOrder;
  engine.currentTurnIdx = firstTurnIdx;
  engine.turnCount = 0;
  engine.jokerCard = engine.config?.gameMode === 'leastsum' && engine.config?.useJoker
    ? deck[Math.floor(Math.random() * deck.length)] ?? null
    : null;
  resetTimeoutProgress(engine);
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
      consecutiveTimeouts: 0,
      eliminated: false,
      bluffFinished: false,
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
  engine.roundHistory = [];
  engine.roundReveal = null;
  engine.bluffActiveClaim = null;
  engine.bluffLivePile = [];
  engine.bluffAsidePile = [];
  engine.bluffLiveTrail = [];
  engine.bluffClaimHistory = [];
  engine.bluffFinishOrder = [];
  engine.bluffPendingFinish = [];
  engine.bluffLastObjectionReveal = null;
  engine.jokerCard = null;
  touchWaitingActivity(engine);
  resetTimeoutProgress(engine);
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

function applyTimeoutBluffFlow(engine, turnId) {
  ensureBluffCollections(engine);
  if (engine.bluffActiveClaim) {
    const claim = engine.bluffActiveClaim;
    if (claim?.claimerId === turnId) {
      const activeIds = activeBluffIds(engine);
      const others = activeIds.filter((id) => id !== turnId);
      const passers = Array.isArray(claim.passers) ? claim.passers : [];
      const readyToClose = others.every((id) => passers.includes(id));
      if (!readyToClose) {
        advanceTurnFromPlayer(engine, turnId);
        return;
      }
    }
    // Active claim timeout becomes auto-pass. When it's claimer's returned turn,
    // this closes the chain if everyone else has already passed.
    bluffPass(engine, turnId);
    return;
  }
  // No active claim timeout simply skips turn.
  advanceTurnFromPlayer(engine, turnId);
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
    if (isBluffMode(engine) && activeIds.length === 1) {
      addToBluffFinishOrder(engine, activeIds[0]);
    }
    engine.status = 'gameover';
    engine.turnDeadlineAt = null;
    return { applied: true, ended: 'gameover' };
  }

  const turnId = currentTurnId(engine);
  if (!turnId) {
    nextTurn(engine, isBluffMode(engine) ? BLUFF_PHASE_PLAY : 'throw');
    return { applied: true, deleteRoom: false };
  }

  const strike = incrementTimeoutStrike(engine, turnId);
  engine.timeoutStreak = strike;
  engine.timeoutCycleIds = [turnId];

  if (strike >= 2) {
    const leaveResult = leaveRoom(engine, turnId);
    return {
      applied: true,
      deleteRoom: !!leaveResult?.deleteRoom,
      kickedPlayerId: turnId,
      kickedForInactivity: true,
    };
  }

  if (isBluffMode(engine)) {
    applyTimeoutBluffFlow(engine, turnId);
  } else if (engine.phase === 'pick') {
    applyTimeoutPickFlow(engine, turnId);
  } else {
    applyTimeoutThrowFlow(engine, turnId);
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
      bluffFinished: !!player?.bluffFinished,
      connected: player?.connected !== false,
      lastSeenAt: Number(player?.lastSeenAt || 0),
    };

    handCounts[id] = Array.isArray(engine.hands?.[id]) ? engine.hands[id].length : 0;
  });

  const pile = Array.isArray(engine.pile) ? engine.pile : [];
  const deck = Array.isArray(engine.deck) ? engine.deck : [];
  const bluffClaim = engine.bluffActiveClaim || null;
  const bluffReveal = engine.bluffLastObjectionReveal || null;
  const bluffLiveRiskPublic = buildBluffLiveRiskPublic(engine);
  const bluffChainHistoryPublic = buildBluffChainHistoryPublic(engine);
  const bluffClaimPublic = bluffClaim
    ? {
        claimerId: bluffClaim.claimerId,
        declaredRank: bluffClaim.declaredRank,
        cardCount: Array.isArray(bluffClaim.cards) ? bluffClaim.cards.length : 0,
        passCount: Array.isArray(bluffClaim.passers) ? bluffClaim.passers.length : 0,
        startedAt: Number(bluffClaim.startedAt || 0),
      }
    : null;

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
    bluffActiveClaimPublic: bluffClaimPublic,
    bluffLivePileCount: bluffLiveRiskPublic.totalCards,
    bluffAsideCount: Array.isArray(engine.bluffAsidePile) ? engine.bluffAsidePile.length : 0,
    bluffLiveRiskPublic,
    bluffChainHistoryPublic,
    // Compatibility placeholders for older clients.
    bluffLivePileCards: [],
    bluffClaimHistory: [],
    bluffFinishOrder: Array.isArray(engine.bluffFinishOrder) ? engine.bluffFinishOrder : [],
    bluffLastObjectionReveal: bluffReveal,
    // Compatibility fields for pre-v1 bluff UI consumers.
    bluffDeclaredRank: bluffClaimPublic?.declaredRank || null,
    bluffLastClaim: bluffClaimPublic
      ? {
          claimerId: bluffClaimPublic.claimerId,
          declaredRank: bluffClaimPublic.declaredRank,
          cardCount: bluffClaimPublic.cardCount,
          at: bluffClaimPublic.startedAt,
        }
      : null,
    bluffLastReveal: bluffReveal
      ? {
          declaredRank: bluffReveal.declaredRank,
          cards: bluffReveal.cards,
          claimerId: bluffReveal.claimerId,
          challengerId: bluffReveal.objectorId,
          truthful: bluffReveal.truthful,
          loserId: bluffReveal.loserId,
          at: bluffReveal.at,
        }
      : null,
    jokerCard: engine.jokerCard || null,
    knocker: engine.knocker || null,
    knockerFailed: !!engine.knockerFailed,
    roundResults: engine.roundResults || null,
    roundHistory: Array.isArray(engine.roundHistory) ? engine.roundHistory : [],
    roundReveal: ['roundEnd', 'gameover'].includes(engine.status) ? (engine.roundReveal || null) : null,
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
