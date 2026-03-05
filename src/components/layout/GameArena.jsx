import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react';
import {
  avatarColor, isJokerMatch, playSound, vibrate,
} from '../../utils/gameUtils';
import PlayingCard, { CardBack, MiniCardBack } from '../hand/PlayingCard';
import ResultsOverlay from './ResultsOverlay';
import '@livekit/components-styles';

// ── Keyframes injected once ────────────────────────────────────
const STYLES = `
  @keyframes drift  { 0%,100%{transform:translateX(0)} 50%{transform:translateX(22px)} }
  @keyframes pulsemic { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.6)} 50%{box-shadow:0 0 0 7px rgba(74,222,128,0)} }
`;

// ── SVG icons ──────────────────────────────────────────────────
const IconMic = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
  </svg>
);
const IconMicOff = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-1.01.9-2.16.9-3.28zm-4.02.17l-1.98-1.98V4c0-1.1-.9-2-2-2s-2 .9-2 2v.17l4 4 1.98 1.98zM4.27 3L3 4.27 9.28 9.28V11c0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c.58-.08 1.15-.24 1.68-.48L19.73 21 21 19.73 4.27 3z"/>
  </svg>
);
const IconTimer = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M15 1H9v2h6V1zm-1 12.59L16.59 16 18 14.59l-3-3V7h-2v5.59zM12 4a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm0 16a7 7 0 1 1 7-7 7 7 0 0 1-7 7z"/>
  </svg>
);

function TurnTimerBadge({ timerPct = 0, timerUrgent = false, remainingSec = 0, sizeClass = 'w-9 h-9' }) {
  return (
    <div
      className={`relative ${sizeClass} rounded-full border-2 flex-shrink-0 ${timerUrgent ? 'border-red-300 animate-pulse' : 'border-yellow-300'}`}
      style={{
        background: `conic-gradient(${timerUrgent ? 'rgba(248,113,113,0.95)' : 'rgba(250,204,21,0.95)'} ${timerPct * 3.6}deg, rgba(255,255,255,0.16) 0deg)`,
      }}
      title={`${remainingSec}s left`}
    >
      <div className="absolute inset-[2px] rounded-full bg-black/45 flex items-center justify-center">
        <span className={timerUrgent ? 'text-red-200' : 'text-yellow-200'}>
          <IconTimer />
        </span>
      </div>
    </div>
  );
}

// ── Opponent voice indicator (read-only) ──────────────────────
function OppVoiceIndicator({ participantId, roomName = '', participantName = '' }) {
  const participants = useParticipants();
  const fullIdentity = roomName ? `${roomName}:${participantId}` : '';
  const participant  = participants.find((p) =>
    p.identity === fullIdentity ||
    p.identity === participantId ||
    (participantName && p.name === participantName),
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (!participant?.on) {
      setIsSpeaking(false);
      setIsMuted(true);
      return;
    }

    const sync = () => {
      setIsSpeaking(!!participant.isSpeaking);
      setIsMuted(!participant.isMicrophoneEnabled);
    };

    sync();
    const onSpeaking = (s) => setIsSpeaking(!!s);
    participant.on('isSpeakingChanged', onSpeaking);
    participant.on('trackMuted', sync);
    participant.on('trackUnmuted', sync);
    participant.on('trackPublished', sync);
    participant.on('trackUnpublished', sync);
    participant.on('localTrackPublished', sync);
    participant.on('localTrackUnpublished', sync);

    return () => {
      participant.off('isSpeakingChanged', onSpeaking);
      participant.off('trackMuted', sync);
      participant.off('trackUnmuted', sync);
      participant.off('trackPublished', sync);
      participant.off('trackUnpublished', sync);
      participant.off('localTrackPublished', sync);
      participant.off('localTrackUnpublished', sync);
    };
  }, [participant]);

  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border transition-all ${
        isMuted
          ? 'bg-red-400/30 border-red-400 text-red-300'
          : isSpeaking
          ? 'bg-green-400/50 border-green-400 text-white'
          : 'bg-black/30 border-white/25 text-white/60'
      }`}
      style={{ animation: isSpeaking && !isMuted ? 'pulsemic 1.2s ease infinite' : 'none' }}
    >
      {isMuted ? <IconMicOff /> : <IconMic />}
    </div>
  );
}

// ── My voice toggle button ────────────────────────────────────
function MyVoiceButton() {
  const { localParticipant } = useLocalParticipant();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isMuted = !localParticipant?.isMicrophoneEnabled;

  useEffect(() => {
    if (!localParticipant?.on) return;
    const h = s => setIsSpeaking(!!s);
    localParticipant.on('isSpeakingChanged', h);
    return () => localParticipant.off('isSpeakingChanged', h);
  }, [localParticipant]);

  return (
    <button
      onClick={() => localParticipant?.setMicrophoneEnabled(isMuted)}
      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
        isMuted
          ? 'bg-red-400/30 border-red-400 text-red-300'
          : isSpeaking
            ? 'bg-green-400/50 border-green-400 text-white'
            : 'bg-white/18 border-white/40 text-white hover:bg-white/30'
      }`}
      style={{ animation: isSpeaking && !isMuted ? 'pulsemic 1.2s ease infinite' : 'none' }}
    >
      {isMuted ? <IconMicOff /> : <IconMic />}
    </button>
  );
}

// ── Opponent Seat ─────────────────────────────────────────────
function OpponentSeat({
  player,
  cardCount,
  isActive,
  id,
  roomName = '',
  fanRotation = 0,
  voiceEnabled = false,
  showTurnTimer = false,
  timerPct = 0,
  timerUrgent = false,
  remainingSec = 0,
  showScore = true,
}) {
  const count  = cardCount || 0;
  const fanned = Math.min(count, 8);
  const spread = Math.min(60, fanned * 9);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Name tag + voice */}
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md border transition-all ${
            isActive
              ? 'bg-yellow-400/20 border-yellow-400 shadow-[0_0_14px_rgba(250,204,21,0.55)]'
              : 'bg-black/40 border-white/25'
          }`}
        >
          <span className="font-black text-white text-xs whitespace-nowrap">{player.name}</span>
          {showScore ? <span className="text-yellow-400 font-black text-[10px]">{player.score || 0}</span> : null}
        </div>
        {showTurnTimer && (
          <TurnTimerBadge
            timerPct={timerPct}
            timerUrgent={timerUrgent}
            remainingSec={remainingSec}
            sizeClass="w-7 h-7"
          />
        )}
        {voiceEnabled ? (
          <OppVoiceIndicator participantId={id} roomName={roomName} participantName={player?.name} />
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border bg-black/30 border-white/25 text-white/45">
            <IconMicOff />
          </div>
        )}
      </div>

      {/* Fanned face-down cards */}
      <div
        className="relative"
        style={{ width: 72, height: 62, transform: `rotate(${fanRotation}deg)` }}
      >
        {Array.from({ length: Math.max(fanned, 1) }).map((_, i) => {
          const angle = fanned <= 1 ? 0 : -spread / 2 + (spread / Math.max(fanned - 1, 1)) * i;
          return (
            <MiniCardBack key={i} rotationDeg={angle} lift={Math.abs(angle) * 0.3} zIndex={i} />
          );
        })}
        {count > 0 && (
          <div className="absolute -bottom-1.5 -right-1.5 bg-white text-black text-[9px] font-black px-1.5 py-0.5 rounded-full border-2 border-gray-700 z-20 min-w-[18px] text-center leading-none shadow-md">
            {count}
          </div>
        )}
      </div>
    </div>
  );
}

function MaskedCardStack({ count = 0, isActive = false, label = '', playerName = '' }) {
  const reduceMotion = useReducedMotion();
  const prevCountRef = useRef(count);
  const [bumpTick, setBumpTick] = useState(0);

  useEffect(() => {
    if (prevCountRef.current !== count) {
      prevCountRef.current = count;
      setBumpTick((v) => v + 1);
    }
  }, [count]);

  const visibleCards = Math.min(Math.max(count, 1), 5);
  const overflow = Math.max(0, count - visibleCards);
  const fanSpread = Math.min(48, visibleCards * 9);

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[96px]">
      <motion.div
        key={`${label}-${playerName}-${bumpTick}`}
        initial={reduceMotion ? { opacity: 0.92 } : { y: 0, scale: 1 }}
        animate={reduceMotion ? { opacity: 1 } : { y: [0, -6, 0], scale: [1, 1.04, 1] }}
        transition={{ duration: reduceMotion ? 0.18 : 0.22, ease: 'easeOut' }}
        className="relative w-[92px] h-[70px]"
      >
        <motion.div
          animate={isActive && !reduceMotion ? { scale: [1, 1.02, 1] } : { scale: 1 }}
          transition={isActive && !reduceMotion ? { repeat: Infinity, duration: 1.6, ease: 'easeInOut' } : { duration: 0.15 }}
          className="relative w-full h-full"
        >
          {Array.from({ length: visibleCards }).map((_, i) => {
            const angle = visibleCards <= 1 ? 0 : -fanSpread / 2 + (fanSpread / Math.max(visibleCards - 1, 1)) * i;
            return (
              <MiniCardBack
                key={i}
                rotationDeg={angle}
                lift={Math.abs(angle) * 0.22}
                zIndex={i + 1}
              />
            );
          })}
        </motion.div>
        <div className="absolute -bottom-1.5 -right-1.5 bg-yellow-300 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full border-2 border-white shadow-md leading-none">
          {count}
        </div>
        {overflow > 0 && (
          <div className="absolute -top-1.5 -left-1.5 bg-black/70 text-cyan-100 text-[9px] font-black px-1.5 py-0.5 rounded-full border border-cyan-200/50 leading-none">
            +{overflow}
          </div>
        )}
      </motion.div>
      <div className="text-center leading-tight">
        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-white/80">{label}</div>
        {playerName && (
          <div className="text-[10px] font-black text-cyan-100 truncate max-w-[96px]" title={playerName}>
            {playerName}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Opponent fixed-slot positions ─────────────────────────────
function getOppSlots(n) {
  const east = { style: { top: '40%', right: '3%', transform: 'translateY(-50%)' }, fan: -90 };
  const west = { style: { top: '40%', left: '3%', transform: 'translateY(-50%)' }, fan: 90 };
  const north = { style: { top: '8vh', left: '50%', transform: 'translateX(-50%)' }, fan: 0 };
  const northEast = { style: { top: '10vh', left: '72%', transform: 'translateX(-50%)' }, fan: -25 };
  const northWest = { style: { top: '10vh', left: '28%', transform: 'translateX(-50%)' }, fan: 25 };
  const southWest = { style: { top: '66%', left: '8%', transform: 'translateY(-50%)' }, fan: 78 };
  const southEast = { style: { top: '66%', right: '8%', transform: 'translateY(-50%)' }, fan: -78 };

  if (n === 1) return [east];
  if (n === 2) return [east, west];
  if (n === 3) return [east, north, west];
  if (n === 4) return [east, northEast, north, west];
  if (n === 5) return [east, northEast, north, northWest, west];
  if (n === 6) return [east, northEast, north, northWest, west, southWest];
  return [east, northEast, north, northWest, west, southWest, southEast].slice(0, n);
}

const LONG_PRESS_MS = 200;
const MOVE_THRESHOLD_PX = 10;
const TOUCH_TAP_MAX_MS = 260;
const EDGE_ZONE_PX = 56;
const MAX_AUTO_SCROLL_PX = 18;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildHandEntries(cards = []) {
  const seen = {};
  return (cards || []).map((card, handIndex) => {
    const key = `${card?.rank || '?'}|${card?.suit || '?'}`;
    const occurrence = seen[key] || 0;
    seen[key] = occurrence + 1;
    return {
      token: `${key}#${occurrence}`,
      card,
      handIndex,
    };
  });
}

function moveToken(order, token, toIndex) {
  const fromIdx = order.indexOf(token);
  if (fromIdx < 0) return order;
  const target = clamp(toIndex, 0, order.length - 1);
  if (target === fromIdx) return order;
  const next = [...order];
  next.splice(fromIdx, 1);
  next.splice(target, 0, token);
  return next;
}

// ══════════════════════════════════════════════════════════════
// MAIN GAME ARENA
// ══════════════════════════════════════════════════════════════
export default function GameArena({ gameState, myId, roomCode = '', actions, voiceToken = '', voiceUrl = '', voiceError = '' }) {
  const [selectedTokens,  setSelectedTokens]  = useState([]);
  const [displayOrder,    setDisplayOrder]    = useState([]);
  const [dragToken,       setDragToken]       = useState('');
  const [hoverToken,      setHoverToken]      = useState('');
  const [isDragging,      setIsDragging]      = useState(false);
  const [turnFlash,       setTurnFlash]       = useState(false);
  const [nowMs,           setNowMs]           = useState(() => Date.now());
  const [actionWarning,   setActionWarning]   = useState('');
  const [declaredRank,    setDeclaredRank]    = useState('A');
  const prevTurnRef = useRef(null);
  const handStripRef = useRef(null);
  const cardNodeRefs = useRef(new Map());
  const displayOrderRef = useRef([]);
  const handEntriesRef = useRef([]);
  const autoScrollRafRef = useRef(0);
  const interactionRef = useRef({
    pointerId: null,
    pointerType: '',
    activeToken: '',
    downTarget: null,
    mode: 'none',
    startX: 0,
    startY: 0,
    lastClientX: 0,
    downAtMs: 0,
    startScrollLeft: 0,
    didScrollWhilePending: false,
    longPressTimer: null,
    canSelectAtDown: false,
    isDragging: false,
  });

  const hasVoice = Boolean(voiceUrl && voiceToken);
  const resolvedRoomCode = gameState?.roomCode || roomCode || '----';

  if (!gameState) return null;

  const {
    phase = 'throw',
    turnOrder = [],
    currentTurnIdx = 0,
    hands = {},
    deck = [],
    previousCard = null,
    pile = [],
    pendingThrownCards = null,
    bluffActiveClaimPublic = null,
    bluffLivePileCount = 0,
    bluffLiveRiskPublic = null,
    bluffChainHistoryPublic = [],
    bluffLivePileCards = [],
    bluffClaimHistory = [],
    bluffLastObjectionReveal = null,
    bluffDeclaredRank = null,
    bluffLastClaim = null,
    bluffLastReveal = null,
    config = {},
    jokerCard = null,
  } = gameState ?? {};

  const allPlayersSorted   = Object.entries(gameState?.players ?? {}).sort((a, b) => (a[1]?.order ?? 0) - (b[1]?.order ?? 0));
  const fallbackTurnOrder  = allPlayersSorted.map(([id]) => id);
  const effectiveTurnOrder = turnOrder.length > 0 ? turnOrder : fallbackTurnOrder;
  const currentTurnId      = effectiveTurnOrder[currentTurnIdx] ?? null;
  const isMyTurn           = currentTurnId === myId;
  const myCards            = hands?.[myId] ?? [];
  const deckCount          = Array.isArray(deck) ? deck.length : 0;
  const pileArr            = Array.isArray(pile) ? pile : [];
  const pileTop            = pileArr[pileArr.length - 1] ?? null;
  const previousOpenCard   = previousCard ?? null;
  const pendingThrown      = Array.isArray(pendingThrownCards) ? pendingThrownCards : [];
  const myPlayer           = gameState?.players?.[myId] ?? { name: 'You', score: 0 };
  const currentTurnPlayer  = currentTurnId ? gameState?.players?.[currentTurnId] : null;
  const isBluffMode        = String(config?.gameMode || 'leastsum').toLowerCase() === 'bluff';
  const activeBluffClaim   = bluffActiveClaimPublic || bluffLastClaim || null;
  const activeBluffRank    = activeBluffClaim?.declaredRank || bluffDeclaredRank || null;
  const bluffReveal        = bluffLastObjectionReveal || bluffLastReveal || null;
  const myTurnCount        = gameState?.turnCount ?? 0;
  const canKnock           = myTurnCount >= (config.minTurnsToKnock ?? 1);
  const myCardCount        = Array.isArray(myCards) ? myCards.length : 0;
  const turnDeadlineAt     = Number(gameState?.turnDeadlineAt || 0);
  const totalTurnMs        = Math.max(5000, (Number(config?.turnTimeSec) || 90) * 1000);
  const timerActive        = gameState?.status === 'playing' && turnDeadlineAt > 0;
  const remainingMs        = timerActive ? Math.max(0, turnDeadlineAt - nowMs) : 0;
  const remainingSec       = timerActive ? Math.ceil(remainingMs / 1000) : 0;
  const timerPct           = timerActive ? Math.max(0, Math.min(100, (remainingMs / totalTurnMs) * 100)) : 0;
  const timerUrgent        = timerActive && remainingMs <= 7000;

  const ringOrder = allPlayersSorted.map(([id]) => id);
  const myRingIdx = ringOrder.indexOf(myId);
  const orderedOpponentIds = myRingIdx >= 0
    ? [...ringOrder.slice(myRingIdx + 1), ...ringOrder.slice(0, myRingIdx)]
    : ringOrder.filter((id) => id !== myId);
  const opponents = orderedOpponentIds
    .filter((id) => id !== myId)
    .map((id) => [id, gameState?.players?.[id]])
    .filter(([, player]) => !!player);
  const oppSlots  = getOppSlots(opponents.length);

  const canSelectHand = isMyTurn && (isBluffMode ? phase === 'bluff_play' : phase === 'throw');
  const handEntries = buildHandEntries(myCards);
  const handTokenSet = new Set(handEntries.map((entry) => entry.token));
  const byToken = new Map(handEntries.map((entry) => [entry.token, entry]));
  const orderedTokens = displayOrder.length
    ? displayOrder.filter((token) => handTokenSet.has(token))
    : handEntries.map((entry) => entry.token);
  const displayCards = orderedTokens
    .map((token) => {
      const entry = byToken.get(token);
      if (!entry) return null;
      return {
        ...entry.card,
        token,
        handIndex: entry.handIndex,
      };
    })
    .filter(Boolean);

  useEffect(() => {
    handEntriesRef.current = handEntries;
  }, [myCards]);

  useEffect(() => {
    displayOrderRef.current = orderedTokens;
  }, [orderedTokens]);

  useEffect(() => {
    const latestTokens = handEntries.map((entry) => entry.token);
    const latestSet = new Set(latestTokens);
    setDisplayOrder((prev) => {
      const kept = prev.filter((token) => latestSet.has(token));
      const keepSet = new Set(kept);
      const appended = latestTokens.filter((token) => !keepSet.has(token));
      return [...kept, ...appended];
    });
    setSelectedTokens((prev) => prev.filter((token) => latestSet.has(token)));
  }, [myCards]);

  useEffect(() => { setSelectedTokens([]); }, [phase, currentTurnId]);

  useEffect(() => {
    if (isBluffMode && activeBluffRank) {
      setDeclaredRank(activeBluffRank);
      return;
    }
    setDeclaredRank('A');
  }, [isBluffMode, activeBluffRank, currentTurnId]);

  useEffect(() => {
    if (!gameState) return;
    if (isMyTurn && prevTurnRef.current !== null && prevTurnRef.current !== myId) {
      setTurnFlash(true); playSound('myturn'); vibrate(50);
      const t = setTimeout(() => setTurnFlash(false), 700);
      return () => clearTimeout(t);
    }
    prevTurnRef.current = currentTurnId;
  }, [currentTurnId]); // eslint-disable-line

  useEffect(() => {
    if (!timerActive) return undefined;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(id);
  }, [timerActive, turnDeadlineAt]);

  useEffect(() => {
    if (!actionWarning) return undefined;
    const id = setTimeout(() => setActionWarning(''), 2200);
    return () => clearTimeout(id);
  }, [actionWarning]);

  const stopAutoScroll = () => {
    if (autoScrollRafRef.current) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = 0;
    }
  };

  const clearLongPressTimer = () => {
    const timer = interactionRef.current.longPressTimer;
    if (timer) {
      clearTimeout(timer);
      interactionRef.current.longPressTimer = null;
    }
  };

  const resolveTargetIndex = (order, clientX) => {
    for (let i = 0; i < order.length; i += 1) {
      const token = order[i];
      const node = cardNodeRefs.current.get(token);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      if (clientX < mid) return i;
    }
    return Math.max(0, order.length - 1);
  };

  const reorderByPointerX = (clientX) => {
    const active = interactionRef.current.activeToken;
    if (!active) return;
    setDisplayOrder((prev) => {
      if (!prev.length || !prev.includes(active)) return prev;
      const targetIdx = resolveTargetIndex(prev, clientX);
      return moveToken(prev, active, targetIdx);
    });
  };

  const tickAutoScroll = () => {
    const interaction = interactionRef.current;
    if (!interaction.isDragging) {
      autoScrollRafRef.current = 0;
      return;
    }
    const container = handStripRef.current;
    if (!container) {
      autoScrollRafRef.current = 0;
      return;
    }

    const rect = container.getBoundingClientRect();
    const x = interaction.lastClientX;
    let speed = 0;

    if (x < rect.left + EDGE_ZONE_PX) {
      const ratio = (rect.left + EDGE_ZONE_PX - x) / EDGE_ZONE_PX;
      speed = -Math.max(2, ratio * MAX_AUTO_SCROLL_PX);
    } else if (x > rect.right - EDGE_ZONE_PX) {
      const ratio = (x - (rect.right - EDGE_ZONE_PX)) / EDGE_ZONE_PX;
      speed = Math.max(2, ratio * MAX_AUTO_SCROLL_PX);
    }

    if (speed !== 0) {
      container.scrollLeft += clamp(speed, -MAX_AUTO_SCROLL_PX, MAX_AUTO_SCROLL_PX);
      reorderByPointerX(x);
    }

    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  };

  const startAutoScroll = () => {
    if (autoScrollRafRef.current) return;
    autoScrollRafRef.current = requestAnimationFrame(tickAutoScroll);
  };

  const resetInteraction = () => {
    clearLongPressTimer();
    stopAutoScroll();
    interactionRef.current = {
      pointerId: null,
      pointerType: '',
      activeToken: '',
      downTarget: null,
      mode: 'none',
      startX: 0,
      startY: 0,
      lastClientX: 0,
      downAtMs: 0,
      startScrollLeft: 0,
      didScrollWhilePending: false,
      longPressTimer: null,
      canSelectAtDown: false,
      isDragging: false,
    };
    setIsDragging(false);
    setDragToken('');
    setHoverToken('');
  };

  useEffect(() => () => resetInteraction(), []);
  useEffect(() => {
    const onGlobalPointerEnd = (event) => {
      const interaction = interactionRef.current;
      if (interaction.pointerId == null) return;
      if (interaction.pointerId !== event.pointerId) return;
      resetInteraction();
    };
    window.addEventListener('pointerup', onGlobalPointerEnd);
    window.addEventListener('pointercancel', onGlobalPointerEnd);
    return () => {
      window.removeEventListener('pointerup', onGlobalPointerEnd);
      window.removeEventListener('pointercancel', onGlobalPointerEnd);
    };
  }, []);
  useEffect(() => {
    const onWindowBlur = () => resetInteraction();
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        resetInteraction();
      }
    };
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const beginDrag = (eventOrPoint) => {
    const interaction = interactionRef.current;
    if (interaction.mode === 'drag') return;
    interaction.mode = 'drag';
    interaction.isDragging = true;

    const clientX = typeof eventOrPoint === 'number' ? eventOrPoint : eventOrPoint.clientX;
    interaction.lastClientX = clientX;
    setIsDragging(true);
    setDragToken(interaction.activeToken);

    const target = interaction.downTarget;
    if (target?.setPointerCapture && interaction.pointerId != null) {
      try {
        target.setPointerCapture(interaction.pointerId);
      } catch {
        // ignore pointer capture errors on unsupported devices
      }
    }

    reorderByPointerX(clientX);
    startAutoScroll();
  };

  const toggleSelection = (token) => {
    if (!canSelectHand) return;
    const entry = byToken.get(token);
    const card = entry?.card;
    if (!card) return;

    vibrate(20);
    if (isBluffMode) {
      setSelectedTokens((prev) => (
        prev.includes(token)
          ? prev.filter((t) => t !== token)
          : [...prev, token]
      ));
      return;
    }

    setSelectedTokens((prev) => {
      if (prev.includes(token)) {
        return prev.filter((t) => t !== token);
      }
      if (prev.length > 0) {
        const firstRank = byToken.get(prev[0])?.card?.rank;
        if (firstRank && firstRank !== card.rank) {
          return [token];
        }
      }
      return [...prev, token];
    });
  };

  const onCardPointerDown = (token, event) => {
    if (event.button != null && event.button !== 0) return;
    clearLongPressTimer();
    interactionRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType || 'mouse',
      activeToken: token,
      downTarget: event.currentTarget,
      mode: 'pending',
      startX: event.clientX,
      startY: event.clientY,
      lastClientX: event.clientX,
      downAtMs: Date.now(),
      startScrollLeft: handStripRef.current?.scrollLeft || 0,
      didScrollWhilePending: false,
      longPressTimer: null,
      canSelectAtDown: canSelectHand,
      isDragging: false,
    };

    if (event.pointerType === 'touch') {
      interactionRef.current.longPressTimer = setTimeout(() => {
        const current = interactionRef.current;
        if (current.mode === 'pending' && current.activeToken === token) {
          beginDrag(current.lastClientX);
        }
      }, LONG_PRESS_MS);
    }
  };

  const onCardPointerMove = (event) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId) return;
    interaction.lastClientX = event.clientX;

    if (interaction.mode === 'pending') {
      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;
      const moved = Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX;

      if (!moved) return;
      clearLongPressTimer();

      if (interaction.pointerType === 'touch') {
        interaction.mode = 'scroll';
        return;
      }

      beginDrag(event);
      return;
    }

    if (interaction.mode === 'drag') {
      event.preventDefault();
      reorderByPointerX(event.clientX);
    }
  };

  const onHandStripScroll = () => {
    const interaction = interactionRef.current;
    if (interaction.pointerType !== 'touch') return;
    if (interaction.mode !== 'pending' && interaction.mode !== 'scroll') return;
    const currentScroll = handStripRef.current?.scrollLeft || 0;
    if (Math.abs(currentScroll - Number(interaction.startScrollLeft || 0)) > 2) {
      interaction.didScrollWhilePending = true;
      interaction.mode = 'scroll';
    }
  };

  const onCardPointerUp = (event) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId) return;

    clearLongPressTimer();

    if (interaction.mode === 'pending') {
      const dx = event.clientX - interaction.startX;
      const dy = event.clientY - interaction.startY;
      const moved = Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX;
      const isTouchTap = interaction.pointerType !== 'touch'
        || (Date.now() - Number(interaction.downAtMs || 0)) <= TOUCH_TAP_MAX_MS;
      if (!moved && !interaction.didScrollWhilePending && isTouchTap && interaction.canSelectAtDown) {
        toggleSelection(interaction.activeToken);
      }
    }

    if (interaction.mode === 'drag') {
      const target = interaction.downTarget;
      if (target?.releasePointerCapture && interaction.pointerId != null) {
        try {
          target.releasePointerCapture(interaction.pointerId);
        } catch {
          // ignore pointer release errors
        }
      }
    }

    resetInteraction();
  };

  const onCardPointerCancel = (event) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId) return;
    resetInteraction();
  };

  const selectedCards = selectedTokens.map((token) => byToken.get(token)?.card).filter(Boolean);
  const selectedHandIndices = selectedTokens
    .map((token) => byToken.get(token)?.handIndex)
    .filter((idx) => Number.isInteger(idx));
  const hasSelection = selectedHandIndices.length > 0;
  const bluffActivePlayerIds = effectiveTurnOrder.filter((id) => {
    const player = gameState?.players?.[id];
    if (!player) return false;
    return !player?.bluffFinished;
  });
  const bluffOtherPlayerCount = activeBluffClaim?.claimerId
    ? bluffActivePlayerIds.filter((id) => id !== activeBluffClaim.claimerId).length
    : 0;
  const claimerReadyToClose = Boolean(
    activeBluffClaim
      && activeBluffClaim?.claimerId === myId
      && Number(activeBluffClaim?.passCount || 0) >= Math.max(0, bluffOtherPlayerCount),
  );
  const canThrow = isMyTurn && phase === 'throw' && hasSelection;
  const canBluffPlay = isMyTurn && phase === 'bluff_play' && hasSelection;
  const canBluffPass = isMyTurn
    && phase === 'bluff_play'
    && !!activeBluffClaim
    && (activeBluffClaim?.claimerId !== myId || claimerReadyToClose);
  const canBluffObjection = isMyTurn && phase === 'bluff_play' && !!activeBluffClaim && activeBluffClaim?.claimerId !== myId;
  const isThrowMatch = !!previousOpenCard && selectedCards.length > 0 && selectedCards[0]?.rank === previousOpenCard.rank;
  const canPick = isMyTurn && phase === 'pick';
  const bluffOverlapPx = isBluffMode
    ? (displayCards.length > 18 ? 10 : displayCards.length > 12 ? 8 : 6)
    : 0;
  const handLiftReservePx = isBluffMode ? 90 : 72;
  const actionBlockReason = isBluffMode
    ? ''
    : (!isMyTurn
      ? 'Wait for your turn'
      : phase === 'pick'
      ? 'Pick from deck/previous first'
      : (phase !== 'throw' && phase !== 'pick')
      ? 'Action unavailable in current phase'
      : (phase === 'throw' && !hasSelection)
      ? 'Select same-rank card(s) to throw'
      : '');
  const fallbackRiskByPlayer = Array.isArray(bluffLivePileCards)
    ? Object.entries(
        bluffLivePileCards.reduce((acc, entry) => {
          const playerId = entry?.byPlayerId;
          if (!playerId) return acc;
          acc[playerId] = (acc[playerId] || 0) + 1;
          return acc;
        }, {}),
      ).map(([playerId, cardCount]) => ({ playerId, cardCount: Number(cardCount || 0) }))
    : [];
  const bluffLiveRisk = bluffLiveRiskPublic && typeof bluffLiveRiskPublic === 'object'
    ? bluffLiveRiskPublic
    : { totalCards: Number(bluffLivePileCount || 0), byPlayer: fallbackRiskByPlayer };
  const bluffRiskByPlayer = Array.isArray(bluffLiveRisk?.byPlayer)
    ? bluffLiveRisk.byPlayer.filter((entry) => entry?.playerId && Number(entry?.cardCount || 0) > 0)
    : [];
  const bluffHistorySource = Array.isArray(bluffChainHistoryPublic) && bluffChainHistoryPublic.length
    ? bluffChainHistoryPublic
    : (Array.isArray(bluffClaimHistory) ? bluffClaimHistory : []);
  const bluffHistory = [...bluffHistorySource].reverse();

  const onKnockAttempt = async () => {
    vibrate(50);
    playSound('knock');
    const result = await actions.knock();
    if (result?.ok) {
      setActionWarning('');
      return;
    }
    if (result?.reason === 'KNOCK_SUM_LIMIT') {
      setActionWarning(`Knock allowed only below 25 (your sum: ${result.sum}).`);
      vibrate([18, 12, 18]);
      return;
    }
    setActionWarning('Knock is not allowed right now.');
  };

  const onThrowAttempt = async () => {
    vibrate(isThrowMatch ? [30, 20, 60] : 30);
    playSound(isThrowMatch ? 'match' : 'discard');
    const result = await actions.throwSelected(selectedHandIndices);
    if (result?.ok) {
      setActionWarning('');
      return;
    }
    if (result?.reason === 'MATCH_REQUIRES_ONE_CARD_LEFT') {
      setActionWarning('Match throw must leave at least 1 card in hand.');
      vibrate([18, 12, 18]);
      return;
    }
    setActionWarning(result?.error || result?.message || 'Throw is not allowed right now.');
  };

  const onBluffPlayAttempt = async () => {
    if (!canBluffPlay) return;
    vibrate(30);
    playSound('discard');
    const rankToDeclare = activeBluffRank || declaredRank;
    const placeClaim = actions.bluffPlaceClaim || actions.bluffPlay;
    const result = await placeClaim(selectedHandIndices, rankToDeclare);
    if (result?.ok) {
      setActionWarning('');
      return;
    }
    setActionWarning(result?.error || result?.message || 'Place Claim is not allowed right now.');
  };

  const onBluffPassAttempt = async () => {
    if (!canBluffPass) return;
    const result = await actions.bluffPass();
    if (result?.ok) {
      setActionWarning('');
      return;
    }
    setActionWarning(result?.error || result?.message || 'Pass is not allowed right now.');
  };

  const onBluffObjectionAttempt = async () => {
    if (!canBluffObjection) return;
    playSound('knock');
    vibrate([30, 20, 30]);
    const objection = actions.bluffObjection || actions.bluffChallenge;
    const result = await objection();
    if (result?.ok) {
      setActionWarning('');
      return;
    }
    setActionWarning(result?.error || result?.message || 'Objection is not allowed right now.');
  };

  const resolvePlayerName = (id) => gameState?.players?.[id]?.name || 'Player';

  const bluffTableControls = (
    <div className="relative w-[94vw] max-w-[860px] px-4 py-4">
      <div className="absolute inset-0 rounded-[36px] bg-gradient-to-br from-black/30 via-emerald-900/35 to-cyan-900/28 border border-white/24 shadow-[0_18px_38px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.28)] backdrop-blur-md" />
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-[72%] h-8 rounded-full bg-white/16 blur-md pointer-events-none" />
      <div className="relative z-10">
        <div className="mb-3 px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-500/22 to-sky-500/20 border border-white/25 text-white/90 text-[10px] font-black uppercase tracking-[0.18em] text-center">
          {isMyTurn ? 'Your turn to bluff' : `${currentTurnPlayer?.name ?? '…'} is playing`}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {!activeBluffRank ? (
            <select
              value={declaredRank}
              onChange={(e) => setDeclaredRank(e.target.value)}
              className="px-3 py-2 rounded-2xl bg-gradient-to-b from-emerald-800/75 to-cyan-900/70 border border-emerald-200/45 text-emerald-50 text-xs font-black uppercase tracking-wider shadow-[0_4px_0_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.2)] focus:outline-none focus:ring-2 focus:ring-emerald-300/60"
            >
              {['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((rank) => (
                <option key={rank} value={rank} className="bg-slate-900 text-emerald-100">{rank}</option>
              ))}
            </select>
          ) : (
            <div className="px-3 py-2 rounded-2xl bg-black/28 border border-white/20 text-cyan-100 text-[10px] font-black uppercase tracking-[0.12em]">
              Active rank: {activeBluffRank}
            </div>
          )}
          <button
            onClick={onBluffPlayAttempt}
            disabled={!canBluffPlay}
            className={`px-4 py-2 font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] ${
              canBluffPlay
                ? 'bg-gradient-to-b from-yellow-300 to-amber-400 text-black hover:brightness-105 active:translate-y-[1px]'
                : 'bg-white/10 text-white/20 cursor-not-allowed'
            }`}
          >
            Place Claim
          </button>
          <button
            onClick={onBluffPassAttempt}
            disabled={!canBluffPass}
            className={`px-3 py-2 font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] ${
              canBluffPass
                ? 'bg-gradient-to-b from-sky-400 to-blue-500 text-white hover:brightness-105 active:translate-y-[1px]'
                : 'bg-white/10 text-white/20 cursor-not-allowed'
            }`}
          >
            {claimerReadyToClose ? 'Pass · Close' : 'Pass'}
          </button>
          <button
            onClick={onBluffObjectionAttempt}
            disabled={!canBluffObjection}
            className={`px-3 py-2 font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] ${
              canBluffObjection
                ? 'bg-gradient-to-b from-rose-400 to-red-500 text-white hover:brightness-105 active:translate-y-[1px]'
                : 'bg-white/10 text-white/20 cursor-not-allowed'
            }`}
          >
            Objection
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {activeBluffClaim ? (
            <div className="px-2.5 py-1.5 bg-black/26 border border-emerald-200/30 rounded-full text-emerald-50 text-[10px] font-black uppercase tracking-[0.1em]">
              {resolvePlayerName(activeBluffClaim?.claimerId)} · {activeBluffClaim?.cardCount || 0} x {activeBluffClaim?.declaredRank || '?'} · Pass {activeBluffClaim?.passCount || 0}
            </div>
          ) : (
            <div className="px-2.5 py-1.5 bg-black/25 border border-white/15 rounded-full text-white/65 text-[10px] font-black uppercase tracking-[0.1em]">
              No active claim
            </div>
          )}
          <div className="px-2.5 py-1.5 bg-black/26 border border-cyan-200/25 rounded-full text-cyan-50/95 text-[10px] font-black uppercase tracking-[0.1em]">
            Live {Number(bluffLiveRisk?.totalCards || 0)}
          </div>
          {bluffReveal && (
            <div className="px-2.5 py-1.5 bg-yellow-300/16 border border-yellow-200/40 rounded-full text-yellow-100 text-[10px] font-black uppercase tracking-[0.1em]">
              Last: {bluffReveal.truthful ? 'Truthful' : 'Bluff'} · {resolvePlayerName(bluffReveal?.loserId)} loses
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div className="rounded-2xl border border-white/20 bg-black/22 p-2">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/90">
              Live risk (masked cards)
            </div>
            {Number(bluffLiveRisk?.totalCards || 0) > 0 ? (
              <div className="space-y-2">
                <div className="flex items-end justify-center">
                  <MaskedCardStack
                    count={Number(bluffLiveRisk?.totalCards || 0)}
                    isActive={!!activeBluffClaim}
                    label="Live Total"
                  />
                </div>
                <div className="text-[9px] font-black uppercase tracking-[0.12em] text-white/60 text-center">
                  Cards by player
                </div>
                <div className="overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]">
                  <div className="flex items-end gap-3 w-max min-w-full justify-center px-1">
                    {bluffRiskByPlayer.map((entry) => (
                      <MaskedCardStack
                        key={`risk-${entry.playerId}`}
                        count={Number(entry?.cardCount || 0)}
                        isActive={activeBluffClaim?.claimerId === entry?.playerId}
                        label="By"
                        playerName={resolvePlayerName(entry?.playerId)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-white/55">No unresolved cards</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/20 bg-black/22 p-2">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100/90">
              Current chain history
            </div>
            {bluffHistory.length ? (
              <div className="max-h-28 overflow-y-auto pr-1 space-y-1">
                {bluffHistory.map((entry, idx) => (
                  <div
                    key={`${entry?.type || 'event'}-${Number(entry?.at || 0)}-${idx}`}
                    className={`px-2 py-1 rounded-xl border text-[10px] font-black tracking-wide ${
                      idx === 0
                        ? 'border-yellow-300/70 bg-yellow-400/18 text-yellow-50 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_6px_14px_rgba(0,0,0,0.26)]'
                        : 'border-white/15 bg-black/24 text-white/85'
                    }`}
                  >
                    {idx === 0 ? 'Latest · ' : ''}
                    {entry?.type === 'claim' && `${resolvePlayerName(entry?.byPlayerId)} claimed ${entry?.cardCount || 0} x ${entry?.declaredRank || '?'}`}
                    {entry?.type === 'pass' && `${resolvePlayerName(entry?.byPlayerId)} passed`}
                    {entry?.type === 'close' && `Claim chain closed (${entry?.cardCount || 0} cards moved out)`}
                    {entry?.type === 'objection' && `${resolvePlayerName(entry?.byPlayerId)} objected · ${entry?.truthful ? 'truthful' : 'bluff'} · ${resolvePlayerName(entry?.loserId)} took ${entry?.cardCount || 0}`}
                    {entry?.type === 'claim_cancelled_leave' && `Claim cancelled (player left) · ${entry?.cardCount || 0} cards moved out`}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-white/55">No active chain events</div>
            )}
          </div>
        </div>

        {bluffReveal?.cards?.length > 0 && (
          <div className="mt-3 rounded-2xl border border-yellow-200/40 bg-yellow-300/10 p-2">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-yellow-100/90">
              Objection reveal ({bluffReveal.truthful ? 'truthful claim' : 'bluff caught'})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {bluffReveal.cards.map((card, idx) => (
                <PlayingCard
                  key={`reveal-${card?.rank || '?'}-${card?.suit || '?'}-${idx}`}
                  rank={card?.rank}
                  suit={card?.suit}
                  size="sm"
                  isDisabled
                />
              ))}
            </div>
          </div>
        )}

        {actionWarning && (
          <div className="mt-3 px-3 py-2 bg-red-500/22 border border-red-200/50 rounded-2xl text-red-100 text-[10px] font-black uppercase tracking-[0.11em] text-center">
            {actionWarning}
          </div>
        )}
      </div>
    </div>
  );

  const board = (
    <>
      {/* Keyframes */}
      <style>{STYLES}</style>

      {/* ── FULL BOARD ──────────────────────────────────────── */}
      <div
        className="fixed inset-0 overflow-hidden select-none"
        style={{ background: 'linear-gradient(165deg,#5BC8F5 0%,#7DD6F7 28%,#A8E6A3 60%,#4CC95A 100%)' }}
      >
        {/* Clouds */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[
            { w:160, h:44, top:'6%',  left:'7%',  dur:'18s',  dir:'normal'  },
            { w:110, h:32, top:'12%', left:'62%', dur:'24s',  dir:'reverse' },
            { w:130, h:38, top:'8%',  left:'34%', dur:'29s',  dir:'normal'  },
          ].map((c, i) => (
            <div key={i} className="absolute rounded-[50px]"
              style={{
                width:c.w, height:c.h, top:c.top, left:c.left,
                background:'rgba(255,255,255,0.52)', filter:'blur(3px)',
                animation:`drift ${c.dur} linear infinite ${c.dir}`,
              }}
            />
          ))}
        </div>

        {/* Turn flash */}
        <AnimatePresence>
          {turnFlash && (
            <motion.div key="flash"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[5] pointer-events-none"
              style={{ boxShadow: 'inset 0 0 80px 24px rgba(255,217,61,0.45)' }}
            />
          )}
        </AnimatePresence>

        {/* Results overlay */}
        {(gameState.status === 'roundEnd' || gameState.status === 'gameover') && (
          <ResultsOverlay gameState={gameState} myId={myId} actions={actions} />
        )}

        {/* ── TOP HUD ─────────────────────────────────────────── */}

        {/* Room + Round — top center */}
        <div
          className="fixed top-3 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/30 bg-black/25 whitespace-nowrap"
          style={{ fontFamily:"'Fredoka One',cursive", fontSize:16, color:'white', letterSpacing:3, textShadow:'0 2px 8px rgba(0,0,0,0.3)' }}
        >
          {resolvedRoomCode} · RD {gameState.round ?? 1}
        </div>

        {!hasVoice && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full bg-black/35 border border-white/25 text-white/80 text-[10px] font-black uppercase tracking-wide whitespace-nowrap">
            {voiceError || 'Voice unavailable. Game continues normally.'}
          </div>
        )}

        {/* My total score — top right */}
        <div className="fixed top-3 right-3 z-40 bg-black/35 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-2 text-right">
          {!isBluffMode ? (
            <>
              <div className="text-[9px] font-black text-white/50 uppercase tracking-[1.5px]">Score</div>
              <div className="text-2xl font-black text-yellow-400 leading-tight"
                   style={{ fontFamily:"'Fredoka One',cursive" }}>
                {myPlayer.score || 0}
              </div>
            </>
          ) : null}
          <button
            onClick={actions.leaveRoom}
            className="mt-1 text-[10px] font-black uppercase tracking-wide text-white/70 hover:text-white"
          >
            Exit
          </button>
        </div>

        {/* Opponents summary — top left */}
        <div className="fixed top-3 left-3 z-40 bg-black/35 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2">
          <div className="text-[9px] font-black text-white/50 uppercase tracking-[1.5px] mb-1">Opponents</div>
          {opponents.map(([id, p]) => (
            <div key={id} className="flex justify-between gap-4 text-xs font-black">
              <span className="text-white truncate max-w-[64px]">{p.name}</span>
              {!isBluffMode ? <span className="text-yellow-400">{p.score || 0}</span> : null}
            </div>
          ))}
        </div>

        {/* ── OPPONENTS ───────────────────────────────────────── */}
        {opponents.map(([id, player], i) => {
          const slot = oppSlots[i];
          if (!slot) return null;
          return (
            <div key={id} className="fixed z-20" style={slot.style}>
              <OpponentSeat
                player={player}
                cardCount={hands[id]?.length ?? 0}
                isActive={id === currentTurnId}
                id={id}
                roomName={resolvedRoomCode}
                fanRotation={slot.fan}
                voiceEnabled={hasVoice}
                showScore={!isBluffMode}
                showTurnTimer={timerActive && id === currentTurnId}
                timerPct={timerPct}
                timerUrgent={timerUrgent}
                remainingSec={remainingSec}
              />
            </div>
          );
        })}

        {/* ── TABLE ISLAND ────────────────────────────────────── */}
        <div
          className="fixed z-10"
          style={{
            top: '50%', left: '50%',
            transform: 'translate(-50%, -42%)',
            width: 380, height: 248,
            background: 'radial-gradient(ellipse at 50% 40%,#55D465 0%,#3DBF50 55%,#2FA83C 100%)',
            borderRadius: '50%',
            boxShadow: '0 14px 0 #1E8A2A, 0 22px 50px rgba(0,0,0,0.28), inset 0 -8px 20px rgba(0,0,0,0.12), inset 0 4px 12px rgba(255,255,255,0.18)',
            display: isBluffMode ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Rim */}
          <div className="absolute inset-[-6px] rounded-[50%] pointer-events-none"
               style={{ border: '4px solid rgba(255,255,255,0.22)' }} />

          {/* Center content */}
          <div className="flex items-center gap-5 z-10">
              {/* Deck */}
              <div className="flex flex-col items-center gap-1 relative">
                <motion.div
                  animate={canPick ? { y: [0, -5, 0] } : {}}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                >
                  <CardBack
                    size="md"
                    onClick={canPick ? () => { vibrate(25); playSound('draw'); actions.pickFromDeck(); } : undefined}
                    className={canPick ? 'ring-2 ring-yellow-400 shadow-[0_0_18px_rgba(250,204,21,0.65)] cursor-pointer' : ''}
                  />
                </motion.div>
                <div className="absolute -top-2.5 -right-2.5 bg-yellow-400 text-black text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow z-10"
                     style={{ fontFamily:"'Fredoka One',cursive" }}>
                  {deckCount > 99 ? '99+' : deckCount}
                </div>
                <span className="text-white/85 font-black text-[9px] uppercase tracking-widest"
                      style={{ textShadow:'0 1px 4px rgba(0,0,0,0.5)' }}>DECK</span>
              </div>

              {/* Previous player thrown card */}
              <div className="flex flex-col items-center gap-1 relative">
                <motion.div
                  animate={canPick && previousOpenCard ? { scale: [1, 1.04, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                >
                  {previousOpenCard ? (
                    <PlayingCard
                      rank={previousOpenCard.rank}
                      suit={previousOpenCard.suit}
                      size="md"
                      onClick={canPick ? () => { vibrate(25); playSound('draw'); actions.pickFromPrevious(); } : undefined}
                      className={canPick ? 'ring-2 ring-yellow-400 shadow-[0_0_18px_rgba(250,204,21,0.65)] cursor-pointer' : ''}
                      style={{ transform: 'rotate(5deg)' }}
                    />
                  ) : (
                    <div className="w-[62px] h-[88px] rounded-xl border-2 border-dashed border-white/30 flex items-center justify-center">
                      <span className="text-white/30 text-[9px] font-black uppercase">Empty</span>
                    </div>
                  )}
                </motion.div>
                <span className="text-white/85 font-black text-[9px] uppercase tracking-widest"
                      style={{ textShadow:'0 1px 4px rgba(0,0,0,0.5)' }}>PREVIOUS</span>
              </div>

              {/* Pile */}
              <div className="flex flex-col items-center gap-1 relative">
                <div className="relative">
                  <CardBack size="sm" className="opacity-85" />
                  {pileTop && (
                    <PlayingCard
                      rank={pileTop.rank}
                      suit={pileTop.suit}
                      size="sm"
                      isDisabled
                      style={{ position: 'absolute', top: 2, left: 8, opacity: 0.9, transform: 'rotate(8deg)' }}
                    />
                  )}
                </div>
                <div className="absolute -top-2.5 -right-2.5 bg-white text-black text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-gray-700 shadow z-10"
                     style={{ fontFamily:"'Fredoka One',cursive" }}>
                  {pileArr.length > 99 ? '99+' : pileArr.length}
                </div>
                <span className="text-white/85 font-black text-[9px] uppercase tracking-widest"
                      style={{ textShadow:'0 1px 4px rgba(0,0,0,0.5)' }}>PILE</span>
              </div>

              {/* Joker card */}
              {jokerCard && (
                <div className="flex flex-col items-center gap-1 relative">
                  <div className="relative">
                    <PlayingCard
                      rank={jokerCard.rank}
                      suit={jokerCard.suit}
                      size="sm"
                      isDisabled
                      style={{ transform: 'rotate(-6deg)', opacity: 0.9 }}
                    />
                    <div className="absolute -top-3 -right-3 bg-yellow-400 text-black text-[8px] font-black px-1.5 py-0.5 rounded-md border border-black rotate-12 z-10"
                         style={{ boxShadow:'0 0 8px rgba(250,204,21,0.55)' }}>
                      JOKER
                    </div>
                  </div>
                  <span className="text-yellow-300 font-black text-[9px] uppercase tracking-widest"
                        style={{ textShadow:'0 1px 4px rgba(0,0,0,0.5)' }}>−1 PT</span>
                </div>
              )}
          </div>
        </div>

        {isBluffMode && (
          <div
            className="fixed z-20 left-1/2 -translate-x-1/2"
            style={{ top: '48%', transform: 'translate(-50%, -42%)' }}
          >
            {bluffTableControls}
          </div>
        )}

        {/* ── BOTTOM AREA (fixed) ─────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-col">

          {/* YOUR TURN badge */}
          <AnimatePresence>
            {isMyTurn && (
              <motion.div
                key="yourturn"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                className="flex justify-center mb-2"
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.7 }}
                  className="bg-yellow-400 text-black font-black text-sm px-6 py-1.5 rounded-full"
                  style={{ fontFamily:"'Fredoka One',cursive", boxShadow:'0 4px 0 rgba(0,0,0,0.28), 0 0 22px rgba(255,217,61,0.55)' }}
                >
                  YOUR TURN ✦
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action row */}
          <div className="relative z-40 pointer-events-auto flex items-end justify-between px-3 mb-1.5 gap-2 flex-wrap">

            {/* My info + voice toggle */}
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2">
              <div>
                <div className="text-white font-black text-xs leading-tight">
                  {myPlayer.name}&nbsp;<span className="text-white/40 font-bold text-[10px]">(YOU)</span>
                </div>
                <div className="text-yellow-400 text-xs font-black leading-tight">Cards: {myCardCount}</div>
              </div>
              {hasVoice ? (
                <MyVoiceButton />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border-2 bg-black/30 border-white/25 text-white/45">
                  <IconMicOff />
                </div>
              )}
              {timerActive && isMyTurn && (
                <TurnTimerBadge
                  timerPct={timerPct}
                  timerUrgent={timerUrgent}
                  remainingSec={remainingSec}
                  sizeClass="w-9 h-9"
                />
              )}
            </div>

            {/* Phase actions */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {!isBluffMode && actionBlockReason && (
                <div className="px-3 py-2 bg-black/28 backdrop-blur-md border border-white/20 rounded-2xl text-white/70 text-[10px] font-black uppercase tracking-wider">
                  {actionBlockReason}
                </div>
              )}
              {!isMyTurn ? (
                <div className="px-4 py-2 bg-black/28 backdrop-blur-md border border-white/15 rounded-2xl text-white/40 text-[10px] font-black uppercase tracking-wider">
                  {currentTurnPlayer?.name ?? '…'}'s turn
                </div>
		              ) : isBluffMode ? (
	                <div className="px-4 py-2 bg-black/28 backdrop-blur-md border border-white/15 rounded-2xl text-white/55 text-[10px] font-black uppercase tracking-wider">
	                  Bluff actions are on the table
	                </div>
	              ) : phase === 'throw' ? (
                <div className="flex gap-2 flex-wrap items-center justify-end">
                  <button
                    onClick={onThrowAttempt}
                    disabled={!canThrow}
                    className={`px-5 py-2.5 font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] ${
                      canThrow
                        ? isThrowMatch
                          ? 'bg-yellow-400 text-black hover:brightness-110 active:scale-95'
                          : 'bg-emerald-500 text-white hover:brightness-110 active:scale-95'
                        : 'bg-white/10 text-white/20 cursor-not-allowed'
                    }`}
                  >
                    {isThrowMatch ? `THROW MATCH ${selectedCards[0]?.rank}s ✓` : 'THROW'}
                  </button>
                  {canKnock && (
                    <button
                      onClick={onKnockAttempt}
                      className="px-4 py-2.5 bg-red-500 text-white font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] hover:brightness-110 active:scale-95"
                    >
                      ✊ KNOCK
                    </button>
                  )}
                  {actionWarning && (
                    <div className="px-3 py-2 bg-red-500/20 border border-red-300/50 rounded-2xl text-red-100 text-[10px] font-black uppercase tracking-wider">
                      {actionWarning}
                    </div>
                  )}
                </div>
	              ) : phase === 'pick' ? (
                <div className="flex gap-2 flex-wrap items-center justify-end">
                  <button
                    onClick={() => { vibrate(25); playSound('draw'); actions.pickFromDeck(); }}
                    disabled={!canPick}
                    className={`px-4 py-2.5 font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] ${
                      canPick ? 'bg-sky-500 text-white hover:brightness-110 active:scale-95' : 'bg-white/10 text-white/20 cursor-not-allowed'
                    }`}
                  >
                    PICK DECK
                  </button>
                  <button
                    onClick={() => { vibrate(25); playSound('draw'); actions.pickFromPrevious(); }}
                    disabled={!canPick || !previousOpenCard}
                    className={`px-4 py-2.5 font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] ${
                      canPick && previousOpenCard ? 'bg-emerald-500 text-white hover:brightness-110 active:scale-95' : 'bg-white/10 text-white/20 cursor-not-allowed'
                    }`}
                  >
                    PICK PREVIOUS
                  </button>
                  {pendingThrown.length > 0 && (
                    <div className="px-3 py-2 bg-yellow-400/20 border border-yellow-300/40 rounded-2xl text-yellow-100 text-[10px] font-black uppercase tracking-wider">
                      Thrown: {pendingThrown.map((c) => c?.rank).filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* ── HAND CARDS — horizontally scrollable, max 10 ──── */}
          <div className="relative z-10 pb-5 px-4 overflow-visible">
            <div
              ref={handStripRef}
              onScroll={onHandStripScroll}
              style={{
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollbarWidth: 'thin',
                WebkitOverflowScrolling: 'touch',
                touchAction: isDragging ? 'none' : 'pan-x',
                paddingTop: `${handLiftReservePx}px`,
                marginTop: `-${handLiftReservePx}px`,
                position: 'relative',
                zIndex: 10,
              }}
            >
              <div className="flex items-end w-max min-w-full justify-center mx-auto px-1">
	              {displayCards.map((card, cardIdx) => {
	                const isChosen    = selectedTokens.includes(card.token);
	                const isJokerCard = isJokerMatch(card, jokerCard);
	                const isMatchable = !isBluffMode && phase === 'throw' && card.rank === previousOpenCard?.rank && isMyTurn;
	                const baseAngle = isBluffMode
	                  ? clamp((cardIdx - (displayCards.length - 1) / 2) * 0.7, -6, 6)
	                  : 0;
                const isDragged = dragToken === card.token;
                const isHovered = hoverToken === card.token;
                const overlap = isBluffMode && cardIdx > 0
                  ? ((isChosen || isHovered || isDragged) ? 0 : -bluffOverlapPx)
                  : 0;
                const spreadX = (isChosen || isHovered) && isBluffMode
                  ? (cardIdx - (displayCards.length - 1) / 2) * 1.6
                  : 0;
                const liftY = isDragged
                  ? -58
                  : (isHovered ? -56 : (isChosen ? -42 : 0));

                return (
                  <motion.div
                    key={card.token}
                    ref={(node) => {
                      if (node) cardNodeRefs.current.set(card.token, node);
                      else cardNodeRefs.current.delete(card.token);
                    }}
                    data-token={card.token}
                    animate={{ y: liftY, x: spreadX, scale: isChosen ? 1.08 : (isHovered ? 1.05 : 1), rotate: baseAngle }}
                    whileHover={canSelectHand ? { scale: 1.05 } : {}}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    onHoverStart={() => {
                      if (!isDragging) setHoverToken(card.token);
                    }}
                    onHoverEnd={() => {
                      setHoverToken((prev) => (prev === card.token ? '' : prev));
                    }}
                    onPointerDown={(event) => onCardPointerDown(card.token, event)}
                    onPointerMove={onCardPointerMove}
                    onPointerUp={onCardPointerUp}
                    onPointerCancel={onCardPointerCancel}
                    onContextMenu={(event) => {
                      if (interactionRef.current.mode !== 'none') event.preventDefault();
                    }}
                    style={{
                      flexShrink: 0,
	                      position: 'relative',
                      overflow: 'visible',
	                      marginLeft: overlap,
                      marginRight: (isBluffMode && (isChosen || isHovered || isDragged)) ? 6 : 0,
                      zIndex: isDragged ? 640 : (isHovered ? 560 + cardIdx : (isChosen ? 460 + cardIdx : 20 + cardIdx)),
                      cursor: isDragging ? 'grabbing' : 'grab',
                    }}
	                  >
                    <PlayingCard
                      rank={card.rank}
                      suit={card.suit}
                      size={isBluffMode ? 'compact' : 'lg'}
                      isSelected={isChosen}
                      isMatchable={isMatchable && !isChosen}
                      isJoker={isJokerCard}
                      isDraggable
                      className={isDragged ? 'ring-2 ring-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.55)]' : ''}
                    />
                  </motion.div>
                );
              })}
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );

  if (!hasVoice) return board;

  return (
    <LiveKitRoom token={voiceToken} serverUrl={voiceUrl} connect audio={false}>
      <RoomAudioRenderer />
      {board}
    </LiveKitRoom>
  );
}
