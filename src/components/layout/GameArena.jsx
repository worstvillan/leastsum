import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react';
import {
  avatarColor, cardValue, handSum, isJokerMatch, playSound, RANKS, SUITS, vibrate,
} from '../../utils/gameUtils';
import PlayingCard, { CardBack, MiniCardBack } from '../hand/PlayingCard';
import GameBoardCanvas from './GameBoardCanvas';
import ResultsOverlay from './ResultsOverlay';
import '@livekit/components-styles';

// ── Keyframes injected once ────────────────────────────────────
const STYLES = `
  @keyframes drift  { 0%,100%{transform:translate3d(0,0,0)} 50%{transform:translate3d(18px,-10px,0)} }
  @keyframes pulsemic { 0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.6)} 50%{box-shadow:0 0 0 7px rgba(74,222,128,0)} }
  @keyframes shimmerline { 0%{transform:translateX(-120%)} 100%{transform:translateX(120%)} }
  @keyframes seatglow { 0%,100%{opacity:.34;transform:scale(1)} 50%{opacity:.58;transform:scale(1.06)} }
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
const IconCrown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 18h14l1-9-5.5 3-2.5-6-2.5 6L4 9l1 9z" />
  </svg>
);
const IconMenu = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </svg>
);
const IconClose = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
);
const IconChevronLeft = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

function TurnTimerBadge({ timerPct = 0, timerUrgent = false, remainingSec = 0, sizeClass = 'w-9 h-9' }) {
  return (
    <div
      className={`relative ${sizeClass} rounded-full border-2 flex-shrink-0 shadow-[0_10px_18px_rgba(0,0,0,0.18)] ${timerUrgent ? 'border-red-300 animate-pulse' : 'border-[rgba(255,202,104,0.8)]'}`}
      style={{
        background: `conic-gradient(${timerUrgent ? 'rgba(241,100,124,0.95)' : 'rgba(255,202,104,0.95)'} ${timerPct * 3.6}deg, rgba(255,255,255,0.12) 0deg)`,
      }}
      title={`${remainingSec}s left`}
    >
      <div className="absolute inset-[2px] rounded-full bg-[rgba(40,16,24,0.78)] flex items-center justify-center">
        <span className={timerUrgent ? 'text-red-200' : 'text-[var(--gold)]'}>
          <IconTimer />
        </span>
      </div>
    </div>
  );
}

// ── Opponent voice control (local listen mute/unmute) ─────────
function OppVoiceControl({ participantId, roomName = '', participantName = '' }) {
  const participants = useParticipants();
  const fullIdentity = roomName ? `${roomName}:${participantId}` : '';
  const participant  = participants.find((p) =>
    p.identity === fullIdentity ||
    p.identity === participantId ||
    (participantName && p.name === participantName),
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isListenMuted, setIsListenMuted] = useState(false);

  useEffect(() => {
    if (!participant?.on) {
      setIsSpeaking(false);
      setIsMicEnabled(false);
      return;
    }

    const sync = () => {
      setIsSpeaking(!!participant.isSpeaking);
      setIsMicEnabled(!!participant.isMicrophoneEnabled);
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

  useEffect(() => {
    if (!participant?.setVolume) return;
    participant.setVolume(isListenMuted ? 0 : 1);
  }, [participant, isListenMuted]);

  const cannotResolve = !participant;
  const title = cannotResolve
    ? 'Voice not connected'
    : isListenMuted
      ? 'Unmute this player for me'
      : 'Mute this player for me';

  return (
    <button
      type="button"
      onClick={() => {
        if (cannotResolve) return;
        setIsListenMuted((v) => !v);
      }}
      disabled={cannotResolve}
      title={title}
      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border transition-all ${
        cannotResolve
          ? 'bg-black/30 border-white/25 text-white/45 cursor-not-allowed'
          : isListenMuted
          ? 'bg-red-500/35 border-red-300 text-red-100'
          : !isMicEnabled
          ? 'bg-red-400/30 border-red-400 text-red-300'
          : isSpeaking
          ? 'bg-green-400/50 border-green-400 text-white'
          : 'bg-black/30 border-white/25 text-white/70 hover:bg-white/25'
      }`}
      style={{ animation: isSpeaking && isMicEnabled && !isListenMuted ? 'pulsemic 1.2s ease infinite' : 'none' }}
    >
      {isListenMuted || !isMicEnabled ? <IconMicOff /> : <IconMic />}
    </button>
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
      type="button"
      onClick={() => localParticipant?.setMicrophoneEnabled(isMuted)}
      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
        isMuted
          ? 'bg-red-400/30 border-red-400 text-red-300'
          : isSpeaking
            ? 'bg-green-400/50 border-green-400 text-white'
            : 'bg-white/18 border-white/40 text-white hover:bg-white/30'
      }`}
      style={{ touchAction: 'manipulation', animation: isSpeaking && !isMuted ? 'pulsemic 1.2s ease infinite' : 'none' }}
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
  isLeaderPlayer = false,
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
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-1.5 px-3 py-2 rounded-full border transition-all shadow-[0_16px_26px_rgba(23,8,19,0.18)] ${
            isActive
              ? 'bg-[linear-gradient(180deg,rgba(255,214,139,0.16),rgba(255,214,139,0.04))] border-[rgba(255,202,104,0.72)] shadow-[0_0_0_1px_rgba(255,202,104,0.2),0_16px_28px_rgba(23,8,19,0.22)]'
              : 'bg-[rgba(40,16,24,0.46)] border-[rgba(255,245,235,0.18)] backdrop-blur-xl'
          }`}
        >
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/18 text-[10px] font-black text-white"
            style={{ backgroundColor: avatarColor(player?.name || 'P') }}
          >
            {(player?.name || 'P')[0]?.toUpperCase?.() || 'P'}
          </div>
          <span className="font-semibold text-[var(--bg-cloud)] text-xs whitespace-nowrap">{player.name}</span>
          {isLeaderPlayer ? (
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(255,202,104,0.34)] bg-[rgba(255,202,104,0.14)] text-[var(--gold)]">
              <IconCrown />
            </span>
          ) : null}
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
          <OppVoiceControl participantId={id} roomName={roomName} participantName={player?.name} />
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border bg-[rgba(40,16,24,0.42)] border-white/20 text-white/45">
            <IconMicOff />
          </div>
        )}
      </div>

      <div
        className="relative overflow-visible"
        style={{ width: 72, height: 62, transform: `rotate(${fanRotation}deg)` }}
      >
        {isActive ? (
          <div
            className="absolute inset-[-12px] rounded-[28px] pointer-events-none"
            style={{
              background: 'radial-gradient(circle at center, rgba(255,202,104,0.2), transparent 62%)',
              animation: 'seatglow 1.5s ease-in-out infinite',
            }}
          />
        ) : null}
        {Array.from({ length: Math.max(fanned, 1) }).map((_, i) => {
          const angle = fanned <= 1 ? 0 : -spread / 2 + (spread / Math.max(fanned - 1, 1)) * i;
          return (
            <MiniCardBack key={i} rotationDeg={angle} lift={Math.abs(angle) * 0.3} zIndex={i} />
          );
        })}
        {count > 0 && (
          <div
            className="absolute -right-2 -top-2 z-20 flex h-6 min-w-[24px] items-center justify-center rounded-full border-2 px-1.5 text-center text-[10px] font-black leading-[1] shadow-[0_10px_20px_rgba(33,12,22,0.28)]"
            style={{
              background: 'linear-gradient(180deg,#ffd788,#ffb463)',
              color: '#34171a',
              borderColor: 'rgba(255,250,245,0.92)',
            }}
          >
            {count}
          </div>
        )}
      </div>
    </div>
  );
}

function MaskedCardStack({ count = 0, isActive = false, label = '', playerName = '', compact = false }) {
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
    <div className={`flex flex-col items-center ${compact ? 'min-w-[82px] gap-1' : 'min-w-[104px] gap-1.5'}`}>
      <motion.div
        key={`${label}-${playerName}-${bumpTick}`}
        initial={reduceMotion ? { opacity: 0.92 } : { y: 0, scale: 1 }}
        animate={reduceMotion ? { opacity: 1 } : { y: [0, -6, 0], scale: [1, 1.04, 1] }}
        transition={{ duration: reduceMotion ? 0.18 : 0.22, ease: 'easeOut' }}
        className={`relative overflow-visible ${compact ? 'h-[66px] w-[82px]' : 'h-[86px] w-[104px]'}`}
      >
        <motion.div
          animate={isActive && !reduceMotion ? { scale: [1, 1.02, 1] } : { scale: 1 }}
          transition={isActive && !reduceMotion ? { repeat: Infinity, duration: 1.6, ease: 'easeInOut' } : { duration: 0.15 }}
          className="relative h-full w-full"
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
        <div className={`absolute z-20 flex items-center justify-center rounded-full border-2 border-white bg-yellow-300 text-black shadow-[0_10px_20px_rgba(33,12,22,0.28)] ${
          compact ? 'right-1 top-0.5 h-5 min-w-[20px] px-1 text-[9px] font-black leading-none' : 'right-2 top-1 h-6 min-w-[24px] px-1.5 text-[10px] font-black leading-[1]'
        }`}>
          {count}
        </div>
        {overflow > 0 && (
          <div className={`absolute rounded-full border border-cyan-200/50 bg-black/70 font-black leading-none text-cyan-100 ${
            compact ? 'left-0.5 top-0.5 px-1 py-0.5 text-[8px]' : 'left-1 top-1 px-1.5 py-0.5 text-[9px]'
          }`}>
            +{overflow}
          </div>
        )}
      </motion.div>
      <div className="text-center leading-tight">
        <div className={`${compact ? 'text-[8px] tracking-[0.08em]' : 'text-[9px] tracking-[0.1em]'} font-black uppercase text-white/80`}>{label}</div>
        {playerName && (
          <div className={`${compact ? 'max-w-[78px] text-[9px]' : 'max-w-[96px] text-[10px]'} truncate font-black text-cyan-100`} title={playerName}>
            {playerName}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Opponent fixed-slot positions ─────────────────────────────
function getOppSlots(n) {
  const east = { style: { top: '41%', right: '3%', transform: 'translateY(-50%)' }, fan: -90 };
  const west = { style: { top: '41%', left: '3%', transform: 'translateY(-50%)' }, fan: 90 };
  const north = { style: { top: '9.4rem', left: '50%', transform: 'translateX(-50%)' }, fan: 0 };
  const northEast = { style: { top: '8.2rem', left: '72%', transform: 'translateX(-50%)' }, fan: -25 };
  const northWest = { style: { top: '8.2rem', left: '28%', transform: 'translateX(-50%)' }, fan: 25 };
  const southWest = { style: { top: '66%', left: '8%', transform: 'translateY(-50%)' }, fan: 78 };
  const southEast = { style: { top: '66%', right: '8%', transform: 'translateY(-50%)' }, fan: -78 };

  if (n === 1) return [east];
  if (n === 2) return [east, west];
  if (n === 3) return [east, north, west];
  if (n === 4) return [east, northEast, northWest, west];
  if (n === 5) return [east, northEast, north, northWest, west];
  if (n === 6) return [east, northEast, north, northWest, west, southWest];
  return [east, northEast, north, northWest, west, southWest, southEast].slice(0, n);
}

const LONG_PRESS_MS = 200;
const MOVE_THRESHOLD_PX = 10;
const TOUCH_TAP_MAX_MS = 260;
const TOUCH_TAP_SLOP_PX = 6;
const TOUCH_SCROLL_INTENT_PX = 4;
const BLUFF_HAND_CARD_WIDTH_PX = 76;
const BLUFF_HAND_MEANINGFUL_OVERFLOW_PX = 48;
const EDGE_ZONE_PX = 56;
const MAX_AUTO_SCROLL_PX = 18;
const BLUFF_SUIT_SORT_ORDER = ['♠', '♥', '♦', '♣'];

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

function sortHandEntriesForBluff(entries = []) {
  const rankIndex = (rank) => {
    const idx = RANKS.indexOf(rank);
    return idx >= 0 ? idx : 999;
  };
  const suitIndex = (suit) => {
    const idx = BLUFF_SUIT_SORT_ORDER.indexOf(suit);
    return idx >= 0 ? idx : 999;
  };

  return [...entries]
    .sort((a, b) => {
      const byRank = rankIndex(a?.card?.rank) - rankIndex(b?.card?.rank);
      if (byRank !== 0) return byRank;
      const bySuit = suitIndex(a?.card?.suit) - suitIndex(b?.card?.suit);
      if (bySuit !== 0) return bySuit;
      return (a?.handIndex ?? 0) - (b?.handIndex ?? 0);
    })
    .map((entry) => entry.token);
}

function sortHandEntriesForLeastSum(entries = [], jokerCard = null) {
  const suitIndex = (suit) => {
    const idx = SUITS.indexOf(suit);
    return idx >= 0 ? idx : 999;
  };

  return [...entries]
    .sort((a, b) => {
      const aIsJoker = isJokerMatch(a?.card, jokerCard);
      const bIsJoker = isJokerMatch(b?.card, jokerCard);
      if (aIsJoker !== bIsJoker) return aIsJoker ? -1 : 1;

      const byValue = cardValue(a?.card) - cardValue(b?.card);
      if (byValue !== 0) return byValue;

      const bySuit = suitIndex(a?.card?.suit) - suitIndex(b?.card?.suit);
      if (bySuit !== 0) return bySuit;

      return (a?.handIndex ?? 0) - (b?.handIndex ?? 0);
    })
    .map((entry) => entry.token);
}

function sortHandEntriesForMode(entries = [], { isBluffMode = false, jokerCard = null } = {}) {
  return isBluffMode
    ? sortHandEntriesForBluff(entries)
    : sortHandEntriesForLeastSum(entries, jokerCard);
}

// ══════════════════════════════════════════════════════════════
// MAIN GAME ARENA
// ══════════════════════════════════════════════════════════════
export default function GameArena({
  gameState,
  myId,
  roomCode = '',
  actions,
  voiceToken = '',
  voiceUrl = '',
  voiceError = '',
  theme = 'midnight',
}) {
  const [selectedTokens,  setSelectedTokens]  = useState([]);
  const [displayOrder,    setDisplayOrder]    = useState([]);
  const [dragToken,       setDragToken]       = useState('');
  const [isDragging,      setIsDragging]      = useState(false);
  const [turnFlash,       setTurnFlash]       = useState(false);
  const [nowMs,           setNowMs]           = useState(() => Date.now());
  const [actionWarning,   setActionWarning]   = useState('');
  const [declaredRank,    setDeclaredRank]    = useState('A');
  const [throwFxCards,    setThrowFxCards]    = useState([]);
  const [pendingHiddenTokens, setPendingHiddenTokens] = useState([]);
  const [optimisticUi,    setOptimisticUi]    = useState(null);
  const [viewportWidth,   setViewportWidth]   = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [infoDrawerOpen,  setInfoDrawerOpen]  = useState(false);
  const [handScrollState, setHandScrollState] = useState({
    canLeft: false,
    canRight: false,
    hasMeaningfulOverflow: false,
    scrollLeft: 0,
    maxScrollLeft: 0,
    trackWidth: 0,
    viewportWidth: 0,
    jumpPx: 0,
    lastAction: '',
  });
  const prevTurnRef = useRef(null);
  const prevIsMyTurnRef = useRef(false);
  const prevStatusRef = useRef('');
  const handStripRef = useRef(null);
  const handTrackRef = useRef(null);
  const cardNodeRefs = useRef(new Map());
  const displayOrderRef = useRef([]);
  const handEntriesRef = useRef([]);
  const clientSortedRoundRef = useRef(null);
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
  const uiRendererMode = String(import.meta.env.VITE_UI_RENDERER || 'dom').trim().toLowerCase();
  const usePixiRenderer = uiRendererMode === 'pixi';
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
  const myTurnCount        = Number(gameState?.turnCount ?? 0);
  const knockMinTurns      = Math.max(
    Number(config.minTurnsToKnock ?? 1),
    Math.max(1, effectiveTurnOrder.length) * 2,
  );
  const canKnock           = myTurnCount >= knockMinTurns;
  const myCardCount        = Array.isArray(myCards) ? myCards.length : 0;
  const myRoundSum         = handSum(myCards, jokerCard);
  const turnDeadlineAt     = Number(gameState?.turnDeadlineAt || 0);
  const totalTurnMs        = Math.max(5000, (Number(config?.turnTimeSec) || 90) * 1000);
  const timerActive        = gameState?.status === 'playing' && turnDeadlineAt > 0;
  const remainingMs        = timerActive ? Math.max(0, turnDeadlineAt - nowMs) : 0;
  const remainingSec       = timerActive ? Math.ceil(remainingMs / 1000) : 0;
  const timerPct           = timerActive ? Math.max(0, Math.min(100, (remainingMs / totalTurnMs) * 100)) : 0;
  const timerUrgent        = timerActive && remainingMs <= 7000;
  const phaseLabel = isBluffMode
    ? 'Bluff Chain'
    : phase === 'pick'
    ? 'Pick'
    : phase === 'throw'
    ? 'Throw'
    : 'Round';
  const visualTurnId = optimisticUi?.turnId ?? currentTurnId;
  const visualPhase = optimisticUi?.phase ?? phase;
  const visualCurrentTurnPlayer = visualTurnId ? gameState?.players?.[visualTurnId] : null;
  const visualIsMyTurn = visualTurnId === myId;
  const visualDeckCount = Math.max(0, deckCount + Number(optimisticUi?.deckDelta || 0));
  const visualPreviousCard = optimisticUi?.previousTaken ? null : previousOpenCard;
  const phaseLabelText = isBluffMode
    ? 'Bluff Chain'
    : visualPhase === 'pick'
    ? 'Pick'
    : visualPhase === 'throw'
    ? 'Throw'
    : 'Round';
  const stageStatus = optimisticUi?.status
    || (visualIsMyTurn
      ? (isBluffMode ? 'Your move' : visualPhase === 'pick' ? 'Pick a card' : 'Choose your throw')
      : `${visualCurrentTurnPlayer?.name ?? 'Player'} turn`);

  const ringOrder = allPlayersSorted.map(([id]) => id);
  const liveSeatOrder = effectiveTurnOrder.length > 0 ? effectiveTurnOrder : ringOrder;
  const leaderPlayerId = (() => {
    if (isBluffMode) {
      const finishOrder = Array.isArray(gameState?.bluffFinishOrder) ? gameState.bluffFinishOrder : [];
      if (finishOrder.length) return finishOrder[0];
      const rankedByCards = allPlayersSorted
        .map(([id, player]) => ({
          id,
          order: Number(player?.order ?? 0),
          cardCount: Number(gameState?.handCounts?.[id] ?? hands?.[id]?.length ?? 0),
        }))
        .sort((a, b) => a.cardCount - b.cardCount || a.order - b.order);
      return rankedByCards[0]?.id ?? null;
    }
    return allPlayersSorted
      .slice()
      .sort((a, b) => {
        const byScore = Number(a[1]?.score ?? 0) - Number(b[1]?.score ?? 0);
        if (byScore !== 0) return byScore;
        return Number(a[1]?.order ?? 0) - Number(b[1]?.order ?? 0);
      })[0]?.[0] ?? null;
  })();
  const myRingIdx = liveSeatOrder.indexOf(myId);
  const orderedOpponentIds = myRingIdx >= 0
    ? [...liveSeatOrder.slice(myRingIdx + 1), ...liveSeatOrder.slice(0, myRingIdx)]
    : liveSeatOrder.filter((id) => id !== myId);
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
    .filter((token) => !pendingHiddenTokens.includes(token))
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
  const handVisualCards = optimisticUi?.drawPreview
    ? [...displayCards, { token: '__draw_preview__', preview: true, source: optimisticUi.drawPreview.source, rank: optimisticUi.drawPreview.rank, suit: optimisticUi.drawPreview.suit }]
    : displayCards;
  const isCompactLayout = viewportWidth < 1024;
  const isPhoneLayout = viewportWidth < 640;
  const bluffOverlapPx = isBluffMode
    ? (displayCards.length > 18 ? 10 : displayCards.length > 12 ? 8 : 6)
    : 0;
  const handLiftReservePx = isBluffMode ? 90 : 72;
  const showDesktopChrome = !isCompactLayout;
  const showFloatingOpponents = !isCompactLayout;
  const tableIslandWidth = isPhoneLayout ? Math.min(336, Math.max(292, viewportWidth - 20)) : isCompactLayout ? 360 : 380;
  const tableIslandHeight = isPhoneLayout ? 214 : isCompactLayout ? 230 : 248;
  const isLeastSumPhoneLayout = isPhoneLayout && !isBluffMode;
  const isBluffCompactLayout = isBluffMode && isCompactLayout;
  const bluffHandCardWidthPx = isBluffCompactLayout ? 64 : BLUFF_HAND_CARD_WIDTH_PX;
  const bluffHandCardSize = isBluffCompactLayout ? 'miniCompact' : 'compact';
  const leastSumTableTop = isLeastSumPhoneLayout ? '45%' : '50%';
  const leastSumTableTranslateY = isLeastSumPhoneLayout ? '-48%' : (isPhoneLayout ? '-38%' : '-42%');
  const handOverflowThresholdPx = isBluffCompactLayout ? 2 : BLUFF_HAND_MEANINGFUL_OVERFLOW_PX;
  const handTopReservePx = isBluffCompactLayout ? 0 : handLiftReservePx;
  const shouldForceCompactBluffArrows = isBluffCompactLayout && displayCards.length > 5;
  const showHandScrollButtons = !usePixiRenderer && (handScrollState.hasMeaningfulOverflow || shouldForceCompactBluffArrows);
  const isHandScrollable = handScrollState.hasMeaningfulOverflow || shouldForceCompactBluffArrows;
  const canScrollHandLeft = handScrollState.canLeft;
  const canScrollHandRight = handScrollState.canRight || shouldForceCompactBluffArrows;

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

  useEffect(() => {
    if (gameState?.status !== 'playing') {
      clientSortedRoundRef.current = null;
      return;
    }

    const activeRound = Number(gameState?.round || 0);
    if (!Number.isFinite(activeRound) || activeRound <= 0) return;
    if (clientSortedRoundRef.current === activeRound) return;
    if (!handEntries.length) return;

    setDisplayOrder(sortHandEntriesForMode(handEntries, { isBluffMode, jokerCard }));
    clientSortedRoundRef.current = activeRound;
  }, [isBluffMode, jokerCard, gameState?.status, gameState?.round, handEntries]);

  useEffect(() => {
    const previousWasMyTurn = prevIsMyTurnRef.current;
    if (previousWasMyTurn && !isMyTurn && handEntries.length) {
      setDisplayOrder(sortHandEntriesForMode(handEntries, { isBluffMode, jokerCard }));
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn, handEntries, isBluffMode, jokerCard]);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    if (!isCompactLayout && infoDrawerOpen) {
      setInfoDrawerOpen(false);
    }
  }, [isCompactLayout, infoDrawerOpen]);

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

  useEffect(() => {
    if (!gameState?.status) return;
    if (prevStatusRef.current === gameState.status) return;
    if (gameState.status === 'roundEnd') playSound('reveal');
    if (gameState.status === 'gameover') playSound('victory');
    prevStatusRef.current = gameState.status;
  }, [gameState?.status]);

  useEffect(() => {
    if (!throwFxCards.length) return undefined;
    const id = setTimeout(() => setThrowFxCards([]), 460);
    return () => clearTimeout(id);
  }, [throwFxCards]);

  useEffect(() => {
    if (!optimisticUi) return;
    setOptimisticUi(null);
  }, [phase, currentTurnId, deckCount, previousOpenCard?.rank, previousOpenCard?.suit, myCards.length]);

  useEffect(() => {
    if (!pendingHiddenTokens.length) return;
    const currentSet = new Set(handEntries.map((entry) => entry.token));
    const stillHidden = pendingHiddenTokens.filter((token) => currentSet.has(token));
    if (stillHidden.length !== pendingHiddenTokens.length) {
      setPendingHiddenTokens(stillHidden);
    }
  }, [handEntries, pendingHiddenTokens]);

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

  const buildHandScrollMetrics = () => {
    const container = handStripRef.current;
    const track = handTrackRef.current;
    if (!container || !track) return null;

    const viewportWidth = Math.max(0, container.clientWidth);
    const trackWidth = Math.max(0, track.scrollWidth);
    const maxScrollLeft = Math.max(0, trackWidth - viewportWidth);
    const trackChildren = Array.from(track.children || []).filter(Boolean);
    const stepPx = (() => {
      if (isBluffMode) {
        return Math.max(1, bluffHandCardWidthPx - bluffOverlapPx);
      }
      if (trackChildren.length >= 2) {
        const first = trackChildren[0];
        const second = trackChildren[1];
        const measuredGap = Math.abs((second.offsetLeft || 0) - (first.offsetLeft || 0));
        if (measuredGap > 0) return measuredGap;
      }
      if (trackChildren.length >= 1) {
        return Math.max(1, trackChildren[0].offsetWidth || 96);
      }
      return 96;
    })();
    const jumpCards = Math.max(1, Math.floor(viewportWidth / stepPx) - 1);
    const jumpPx = Math.max(stepPx, jumpCards * stepPx);
    let scrollLeft = clamp(Math.max(0, container.scrollLeft), 0, maxScrollLeft);
    const hasMeaningfulOverflow = maxScrollLeft >= handOverflowThresholdPx;
    if (!hasMeaningfulOverflow) scrollLeft = 0;

    return {
      container,
      viewportWidth,
      trackWidth,
      maxScrollLeft,
      jumpPx,
      hasMeaningfulOverflow,
      scrollLeft,
    };
  };

  const syncHandScrollState = (lastAction = '') => {
    const metrics = buildHandScrollMetrics();
    if (!metrics) {
      setHandScrollState((prev) => ({
        ...prev,
        canLeft: false,
        canRight: false,
        hasMeaningfulOverflow: false,
        scrollLeft: 0,
        maxScrollLeft: 0,
        trackWidth: 0,
        viewportWidth: 0,
        jumpPx: 0,
        lastAction: lastAction || prev.lastAction || '',
      }));
      return null;
    }

    if (metrics.container.scrollLeft !== metrics.scrollLeft) {
      metrics.container.scrollLeft = metrics.scrollLeft;
    }

    setHandScrollState((prev) => ({
      ...prev,
      canLeft: metrics.hasMeaningfulOverflow && metrics.scrollLeft > 4,
      canRight: metrics.hasMeaningfulOverflow && metrics.scrollLeft < metrics.maxScrollLeft - 4,
      hasMeaningfulOverflow: metrics.hasMeaningfulOverflow,
      scrollLeft: metrics.scrollLeft,
      maxScrollLeft: metrics.maxScrollLeft,
      trackWidth: metrics.trackWidth,
      viewportWidth: metrics.viewportWidth,
      jumpPx: metrics.jumpPx,
      lastAction: lastAction || prev.lastAction || '',
    }));
    return {
      currentLeft: metrics.scrollLeft,
      maxScrollLeft: metrics.maxScrollLeft,
      jumpPx: metrics.jumpPx,
      hasMeaningfulOverflow: metrics.hasMeaningfulOverflow,
    };
  };

  const scrollHandStripBy = (direction) => {
    const container = handStripRef.current;
    if (!container) return;

    const metrics = syncHandScrollState();
    if (!metrics?.hasMeaningfulOverflow) return;

    const currentLeft = Math.max(0, metrics.currentLeft || 0);
    const maxScrollLeft = Math.max(0, metrics.maxScrollLeft || 0);
    const jumpPx = Math.max(1, metrics.jumpPx || 0);
    const nextLeft = clamp(currentLeft + direction * jumpPx, 0, maxScrollLeft);
    const fallbackLeft = direction > 0 ? maxScrollLeft : 0;
    const appliedLeft = nextLeft === currentLeft ? fallbackLeft : nextLeft;
    container.scrollLeft = appliedLeft;
    requestAnimationFrame(() => syncHandScrollState(`${direction > 0 ? 'right' : 'left'} ${Math.round(currentLeft)}->${Math.round(appliedLeft)}`));
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
  useEffect(() => {
    if (usePixiRenderer) return undefined;
    const container = handStripRef.current;
    const track = handTrackRef.current;
    if (!container || !track) return undefined;

    const rafId = requestAnimationFrame(() => syncHandScrollState());
    const onResize = () => syncHandScrollState();
    window.addEventListener('resize', onResize);

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => syncHandScrollState());
      observer.observe(container);
      observer.observe(track);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [usePixiRenderer, handVisualCards.length, isBluffMode, selectedTokens.length, dragToken, bluffOverlapPx]);
  useEffect(() => {
    if (usePixiRenderer) return undefined;
    const rafId = requestAnimationFrame(() => syncHandScrollState());
    return () => cancelAnimationFrame(rafId);
  }, [usePixiRenderer, isHandScrollable, showHandScrollButtons]);

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
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const isTouchHorizontalScroll = interaction.pointerType === 'touch'
        && absDx >= TOUCH_SCROLL_INTENT_PX
        && absDx > absDy;
      if (isTouchHorizontalScroll) {
        clearLongPressTimer();
        interaction.didScrollWhilePending = true;
        interaction.mode = 'scroll';
        return;
      }
      const moved = absDx > MOVE_THRESHOLD_PX || absDy > MOVE_THRESHOLD_PX;

      if (!moved) return;
      clearLongPressTimer();

      if (interaction.pointerType === 'touch') {
        interaction.didScrollWhilePending = true;
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
    syncHandScrollState();
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
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const tapSlopPx = interaction.pointerType === 'touch' ? TOUCH_TAP_SLOP_PX : MOVE_THRESHOLD_PX;
      const moved = absDx > tapSlopPx || absDy > tapSlopPx;
      const isTouchHorizontalScroll = interaction.pointerType === 'touch'
        && absDx >= TOUCH_SCROLL_INTENT_PX
        && absDx > absDy;
      const isTouchTap = interaction.pointerType !== 'touch'
        || (Date.now() - Number(interaction.downAtMs || 0)) <= TOUCH_TAP_MAX_MS;
      if (!moved && !isTouchHorizontalScroll && !interaction.didScrollWhilePending && isTouchTap && interaction.canSelectAtDown) {
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
  const actionBlockReason = isBluffMode
    ? ''
    : (phase === 'pick'
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
    if (result?.reason === 'KNOCK_MIN_TURNS') {
      const currentTurns = Number(result?.currentTurns ?? myTurnCount);
      const requiredTurns = Number(result?.requiredTurns ?? knockMinTurns);
      setActionWarning(`Knock unlocks after ${requiredTurns} turns (now ${currentTurns}).`);
      vibrate([18, 12, 18]);
      return;
    }
    setActionWarning('Knock is not allowed right now.');
  };

  const onThrowAttempt = async () => {
    const tokensToHide = [...selectedTokens];
    const nextTurnIdx = effectiveTurnOrder.length
      ? (currentTurnIdx + 1) % effectiveTurnOrder.length
      : 0;
    const nextTurnId = effectiveTurnOrder[nextTurnIdx] ?? null;
    vibrate(isThrowMatch ? [30, 20, 60] : 30);
    playSound(isThrowMatch ? 'match' : 'discard');
    setThrowFxCards(selectedCards.slice(0, 4));
    setPendingHiddenTokens(tokensToHide);
    setSelectedTokens([]);
    setOptimisticUi({
      phase: 'pick',
      turnId: nextTurnId,
      status: nextTurnId ? `${resolvePlayerName(nextTurnId)} turn` : 'Next turn',
    });
    const result = await actions.throwSelected(selectedHandIndices);
    if (result?.ok) {
      setActionWarning('');
      return;
    }
    setThrowFxCards([]);
    setPendingHiddenTokens([]);
    setSelectedTokens(tokensToHide);
    setOptimisticUi(null);
    if (result?.reason === 'MATCH_REQUIRES_ONE_CARD_LEFT') {
      setActionWarning('Match throw must leave at least 1 card in hand.');
      vibrate([18, 12, 18]);
      return;
    }
    setActionWarning(result?.error || result?.message || 'Throw is not allowed right now.');
  };

  const onBluffPlayAttempt = async () => {
    if (!canBluffPlay) return;
    const tokensToHide = [...selectedTokens];
    vibrate(30);
    playSound('discard');
    setThrowFxCards(selectedCards.slice(0, 4));
    setPendingHiddenTokens(tokensToHide);
    setSelectedTokens([]);
    setOptimisticUi({
      phase: 'bluff_play',
      turnId: myId,
      status: 'Placing claim...',
    });
    const rankToDeclare = activeBluffRank || declaredRank;
    const placeClaim = actions.bluffPlaceClaim || actions.bluffPlay;
    const result = await placeClaim(selectedHandIndices, rankToDeclare);
    if (result?.ok) {
      setActionWarning('');
      return;
    }
    setThrowFxCards([]);
    setPendingHiddenTokens([]);
    setSelectedTokens(tokensToHide);
    setOptimisticUi(null);
    setActionWarning(result?.error || result?.message || 'Place Claim is not allowed right now.');
  };

  const onPickDeckAttempt = async () => {
    if (!canPick) return;
    vibrate(25);
    playSound('draw');
    setOptimisticUi({
      phase: 'throw',
      turnId: myId,
      deckDelta: -1,
      drawPreview: { source: 'deck' },
      status: 'Drawing...',
    });
    const result = await actions.pickFromDeck();
    if (result?.ok) return;
    setOptimisticUi(null);
  };

  const onPickPreviousAttempt = async () => {
    if (!canPick || !previousOpenCard) return;
    vibrate(25);
    playSound('draw');
    setOptimisticUi({
      phase: 'throw',
      turnId: myId,
      previousTaken: true,
      drawPreview: { source: 'previous', rank: previousOpenCard.rank, suit: previousOpenCard.suit },
      status: 'Taking previous...',
    });
    const result = await actions.pickFromPrevious();
    if (result?.ok) return;
    setOptimisticUi(null);
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
    <div className={`relative ${isBluffCompactLayout ? 'w-[90vw] max-w-[344px] max-h-[calc(100dvh-13rem)] overflow-y-auto px-2 py-2' : 'w-[94vw] max-w-[860px] px-4 py-4'}`}>
      <div className={`absolute inset-0 border border-[rgba(255,240,224,0.16)] bg-[linear-gradient(145deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02)),linear-gradient(145deg,rgba(58,18,36,0.9),rgba(32,14,28,0.88))] shadow-[0_24px_54px_rgba(23,8,19,0.28)] backdrop-blur-xl ${isBluffCompactLayout ? 'rounded-[28px]' : 'rounded-[36px]'}`} />
      <div className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-[rgba(255,255,255,0.12)] blur-md pointer-events-none ${isBluffCompactLayout ? '-top-2 h-6 w-[60%]' : '-top-3 h-8 w-[72%]'}`} />
      <div className="relative z-10">
        {!isBluffCompactLayout ? (
          <div className="mb-3 rounded-2xl border border-[rgba(255,202,104,0.26)] bg-[linear-gradient(90deg,rgba(255,202,104,0.12),rgba(140,234,214,0.12))] px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-white/90">
            {isMyTurn ? 'Your turn to bluff' : `${currentTurnPlayer?.name ?? '…'} is playing`}
          </div>
        ) : null}

        <div className={`flex flex-wrap items-center justify-center ${isBluffCompactLayout ? 'gap-1' : 'gap-2'}`}>
          {!activeBluffRank ? (
            <select
              value={declaredRank}
              onChange={(e) => setDeclaredRank(e.target.value)}
              className={`rounded-2xl border border-[rgba(255,245,235,0.18)] bg-[rgba(255,248,239,0.08)] text-[var(--bg-cloud)] shadow-[0_10px_18px_rgba(23,8,19,0.14)] focus:outline-none focus:ring-2 focus:ring-[rgba(140,234,214,0.45)] ${
                isBluffCompactLayout ? 'px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em]' : 'px-3 py-2 text-xs font-black uppercase tracking-wider'
              }`}
            >
              {['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((rank) => (
                <option key={rank} value={rank} className="bg-slate-900 text-white">{rank}</option>
              ))}
            </select>
          ) : (
            <div className={`rounded-2xl border border-[rgba(255,245,235,0.18)] bg-[rgba(255,248,239,0.08)] uppercase text-[var(--mint)] ${
              isBluffCompactLayout ? 'px-2 py-1 text-[9px] font-semibold tracking-[0.08em]' : 'px-3 py-2 text-[10px] font-black tracking-[0.12em]'
            }`}>
              Active rank: {activeBluffRank}
            </div>
          )}
          <button
            onClick={onBluffPlayAttempt}
            disabled={!canBluffPlay}
            className={`uppercase rounded-2xl ${
              isBluffCompactLayout ? 'px-2.5 py-1 text-[9px] font-semibold tracking-[0.08em]' : 'px-4 py-2 text-xs font-black'
            } ${
              canBluffPlay
                ? 'btn-primary-game'
                : 'bg-white/10 text-white/20 cursor-not-allowed'
            }`}
          >
            Place Claim
          </button>
          <button
            onClick={onBluffPassAttempt}
            disabled={!canBluffPass}
            className={`uppercase rounded-2xl ${
              isBluffCompactLayout ? 'px-2.5 py-1 text-[9px] font-semibold tracking-[0.08em]' : 'px-3 py-2 text-xs font-black'
            } ${
              canBluffPass
                ? 'btn-secondary-game'
                : 'bg-white/10 text-white/20 cursor-not-allowed'
            }`}
          >
            {claimerReadyToClose ? 'Pass · Close' : 'Pass'}
          </button>
          <button
            onClick={onBluffObjectionAttempt}
            disabled={!canBluffObjection}
            className={`uppercase rounded-2xl ${
              isBluffCompactLayout ? 'px-2.5 py-1 text-[9px] font-semibold tracking-[0.08em]' : 'px-3 py-2 text-xs font-black'
            } ${
              canBluffObjection
                ? 'btn-danger-game'
                : 'bg-white/10 text-white/20 cursor-not-allowed'
            }`}
          >
            Objection
          </button>
        </div>

        <div className={`mt-2 flex flex-wrap items-center justify-center ${isBluffCompactLayout ? 'gap-1' : 'gap-2'}`}>
          {activeBluffClaim ? (
            <div className={`rounded-full border border-emerald-200/30 bg-black/26 uppercase text-emerald-50 ${
              isBluffCompactLayout ? 'px-2 py-1 text-[9px] font-semibold tracking-[0.08em]' : 'px-2.5 py-1.5 text-[10px] font-black tracking-[0.1em]'
            }`}>
              {resolvePlayerName(activeBluffClaim?.claimerId)} · {activeBluffClaim?.cardCount || 0} x {activeBluffClaim?.declaredRank || '?'} · Pass {activeBluffClaim?.passCount || 0}
            </div>
          ) : (
            <div className={`rounded-full border border-white/15 bg-black/25 uppercase text-white/65 ${
              isBluffCompactLayout ? 'px-2 py-1 text-[9px] font-semibold tracking-[0.08em]' : 'px-2.5 py-1.5 text-[10px] font-black tracking-[0.1em]'
            }`}>
              No active claim
            </div>
          )}
          <div className={`rounded-full border border-cyan-200/25 bg-black/26 uppercase text-cyan-50/95 ${
            isBluffCompactLayout ? 'px-2 py-1 text-[9px] font-semibold tracking-[0.08em]' : 'px-2.5 py-1.5 text-[10px] font-black tracking-[0.1em]'
          }`}>
            Live {Number(bluffLiveRisk?.totalCards || 0)}
          </div>
          {bluffReveal && (
            <div className={`rounded-full border border-yellow-200/40 bg-yellow-300/16 uppercase text-yellow-100 ${
              isBluffCompactLayout ? 'px-2 py-1 text-[9px] font-semibold tracking-[0.08em]' : 'px-2.5 py-1.5 text-[10px] font-black tracking-[0.1em]'
            }`}>
              Last: {bluffReveal.truthful ? 'Truthful' : 'Bluff'} · {resolvePlayerName(bluffReveal?.loserId)} loses
            </div>
          )}
        </div>

        <div className={`mt-2 grid ${isBluffCompactLayout ? 'gap-1.5' : 'gap-2'} md:grid-cols-2`}>
          <div className={`rounded-2xl border border-white/20 bg-black/22 ${isBluffCompactLayout ? 'p-1.5' : 'p-2'}`}>
            <div className={`mb-2 uppercase text-cyan-100/90 ${isBluffCompactLayout ? 'text-[9px] font-semibold tracking-[0.1em]' : 'text-[10px] font-black tracking-[0.14em]'}`}>
              Live risk (masked cards)
            </div>
            {Number(bluffLiveRisk?.totalCards || 0) > 0 ? (
              <div className={isBluffCompactLayout ? 'space-y-1.5' : 'space-y-2'}>
                <div className="flex items-end justify-center">
                  <MaskedCardStack
                    count={Number(bluffLiveRisk?.totalCards || 0)}
                    isActive={!!activeBluffClaim}
                    label="Live Total"
                    compact={isBluffCompactLayout}
                  />
                </div>
                <div className={`text-center uppercase text-white/60 ${isBluffCompactLayout ? 'text-[8px] font-semibold tracking-[0.08em]' : 'text-[9px] font-black tracking-[0.12em]'}`}>
                  Cards by player
                </div>
                <div className="overflow-x-auto overflow-y-visible px-1 py-1.5 [scrollbar-width:none]">
                  <div className={`flex min-w-full w-max items-end justify-center ${isBluffCompactLayout ? 'gap-2' : 'gap-3'}`}>
                    {bluffRiskByPlayer.map((entry) => (
                      <MaskedCardStack
                        key={`risk-${entry.playerId}`}
                        count={Number(entry?.cardCount || 0)}
                        isActive={activeBluffClaim?.claimerId === entry?.playerId}
                        label="By"
                        playerName={resolvePlayerName(entry?.playerId)}
                        compact={isBluffCompactLayout}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-white/55">No unresolved cards</div>
            )}
          </div>

          <div className={`rounded-2xl border border-white/20 bg-black/22 ${isBluffCompactLayout ? 'p-1.5' : 'p-2'}`}>
            <div className={`mb-2 uppercase text-emerald-100/90 ${isBluffCompactLayout ? 'text-[9px] font-semibold tracking-[0.1em]' : 'text-[10px] font-black tracking-[0.14em]'}`}>
              Current chain history
            </div>
            {bluffHistory.length ? (
              <div className={`overflow-y-auto pr-1 ${isBluffCompactLayout ? 'max-h-16 space-y-1' : 'max-h-28 space-y-1'}`}>
                {bluffHistory.map((entry, idx) => (
                  <div
                    key={`${entry?.type || 'event'}-${Number(entry?.at || 0)}-${idx}`}
                    className={`rounded-xl border ${
                      isBluffCompactLayout ? 'px-2 py-1 text-[9px] font-semibold tracking-[0.06em]' : 'px-2 py-1 text-[10px] font-black tracking-wide'
                    } ${
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
          <div className={`rounded-2xl border border-yellow-200/40 bg-yellow-300/10 ${isBluffCompactLayout ? 'mt-2 p-1.5' : 'mt-3 p-2'}`}>
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
          <div className={`border border-red-200/50 bg-red-500/22 rounded-2xl text-red-100 uppercase text-center ${isBluffCompactLayout ? 'mt-2 px-2.5 py-1.5 text-[9px] font-semibold tracking-[0.08em]' : 'mt-3 px-3 py-2 text-[10px] font-black tracking-[0.11em]'}`}>
            {actionWarning}
          </div>
        )}

        {isBluffCompactLayout ? (
          <div className="mt-2 flex items-center gap-2 rounded-[22px] border border-[rgba(255,202,104,0.24)] bg-[linear-gradient(180deg,rgba(255,202,104,0.12),rgba(40,16,24,0.38))] px-3 py-2 shadow-[0_16px_30px_rgba(23,8,19,0.2)]">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/18 text-sm font-black text-white shadow-[0_12px_24px_rgba(23,8,19,0.18)]"
              style={{ backgroundColor: avatarColor(myPlayer.name || 'Y') }}
            >
              {(myPlayer.name || 'Y')[0]?.toUpperCase?.() || 'Y'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold leading-tight text-[var(--bg-cloud)]">
                <span className="truncate">{myPlayer.name}</span>
                <span className="rounded-full border border-[rgba(255,202,104,0.28)] bg-[rgba(255,202,104,0.14)] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--gold)]">
                  {visualIsMyTurn ? 'Your turn' : 'Waiting'}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] font-semibold leading-tight text-[var(--mint)]">
                Cards: {myCardCount}
              </div>
            </div>
            {hasVoice ? (
              <MyVoiceButton />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/20 bg-[rgba(40,16,24,0.42)] text-white/45">
                <IconMicOff />
              </div>
            )}
            {timerActive && visualIsMyTurn ? (
              <TurnTimerBadge
                timerPct={timerPct}
                timerUrgent={timerUrgent}
                remainingSec={remainingSec}
                sizeClass="w-9 h-9"
              />
            ) : null}
          </div>
        ) : null}

        {isBluffCompactLayout && showHandScrollButtons ? (
          <div className="mt-2 flex items-center justify-between rounded-[18px] border border-[rgba(255,245,235,0.12)] bg-[rgba(40,16,24,0.34)] px-2 py-1.5 shadow-[0_12px_24px_rgba(23,8,19,0.16)]">
            <button
              type="button"
              onClick={() => scrollHandStripBy(-1)}
              disabled={!canScrollHandLeft}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                canScrollHandLeft
                  ? 'border-[rgba(255,202,104,0.42)] bg-[rgba(40,16,24,0.56)] text-[var(--gold)] shadow-[0_12px_24px_rgba(23,8,19,0.18)]'
                  : 'border-white/10 bg-white/5 text-white/25 cursor-not-allowed'
              }`}
              aria-label="Scroll cards left"
            >
              <IconChevronLeft />
            </button>
            <div className="px-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/50">
              Hand
            </div>
            <button
              type="button"
              onClick={() => scrollHandStripBy(1)}
              disabled={!canScrollHandRight}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                canScrollHandRight
                  ? 'border-[rgba(255,202,104,0.42)] bg-[rgba(40,16,24,0.56)] text-[var(--gold)] shadow-[0_12px_24px_rgba(23,8,19,0.18)]'
                  : 'border-white/10 bg-white/5 text-white/25 cursor-not-allowed'
              }`}
              aria-label="Scroll cards right"
            >
              <IconChevronRight />
            </button>
          </div>
        ) : null}
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
        style={{
          background:
            'radial-gradient(circle at 18% 16%, rgba(255,176,118,0.16), transparent 20%), radial-gradient(circle at 82% 12%, rgba(241,100,124,0.14), transparent 18%), radial-gradient(circle at 50% 74%, rgba(140,234,214,0.1), transparent 24%), linear-gradient(160deg, #2c1220 0%, #38162e 26%, #732b42 58%, #ff986f 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-[44%] z-0 h-[540px] w-[820px] rounded-full"
          style={{
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle at center, rgba(255,255,255,0.08), rgba(255,202,104,0.06) 20%, transparent 68%)',
            filter: 'blur(22px)',
          }}
        />
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[
            { w:240, h:110, top:'4%', left:'-3%', dur:'18s', dir:'normal', bg:'rgba(255,177,120,0.14)' },
            { w:220, h:96, top:'10%', left:'76%', dur:'24s', dir:'reverse', bg:'rgba(241,100,124,0.12)' },
            { w:280, h:130, top:'68%', left:'24%', dur:'29s', dir:'normal', bg:'rgba(140,234,214,0.08)' },
          ].map((c, i) => (
            <div key={i} className="absolute rounded-full"
              style={{
                width:c.w, height:c.h, top:c.top, left:c.left,
                background:c.bg, filter:'blur(28px)',
                animation:`drift ${c.dur} linear infinite ${c.dir}`,
              }}
            />
          ))}
        </div>

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_45%,rgba(18,6,13,0.22)_100%)]" />

        <AnimatePresence>
          {turnFlash && (
            <motion.div key="flash"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[5] pointer-events-none"
              style={{ boxShadow: 'inset 0 0 120px 28px rgba(255,202,104,0.28)' }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {throwFxCards.length > 0 && (
            <div className="pointer-events-none absolute inset-0 z-[18]">
              {throwFxCards.map((card, idx) => (
                <motion.div
                  key={`throw-fx-${card?.rank || '?'}-${card?.suit || '?'}-${idx}`}
                  initial={{
                    x: 0,
                    y: 0,
                    rotate: (idx - (throwFxCards.length - 1) / 2) * 8,
                    opacity: 0,
                    scale: 0.96,
                  }}
                  animate={{
                    x: (idx - (throwFxCards.length - 1) / 2) * 28,
                    y: -270 - idx * 10,
                    rotate: (idx - (throwFxCards.length - 1) / 2) * 14,
                    opacity: [0, 1, 1, 0],
                    scale: [0.96, 1.02, 1, 0.98],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute bottom-[104px] left-1/2 -translate-x-1/2"
                >
                  <PlayingCard
                    rank={card?.rank}
                    suit={card?.suit}
                    size="md"
                    isDisabled
                    isJoker={isJokerMatch(card, jokerCard)}
                    style={{ boxShadow: '0 18px 36px rgba(23,8,19,0.28)' }}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Results overlay */}
        {(gameState.status === 'roundEnd' || gameState.status === 'gameover') && (
          <ResultsOverlay gameState={gameState} myId={myId} actions={actions} />
        )}

        <div
          className="fixed left-1/2 top-3 z-40 max-w-[calc(100vw-6rem)] whitespace-nowrap rounded-full border border-[rgba(255,245,235,0.16)] bg-[rgba(40,16,24,0.42)] px-4 py-2 backdrop-blur-xl -translate-x-1/2"
          style={{ fontFamily:'var(--font-display)', fontSize: isPhoneLayout ? 14 : 16, color:'var(--bg-cloud)', letterSpacing: isPhoneLayout ? 1.2 : 2 }}
        >
          {resolvedRoomCode} · RD {gameState.round ?? 1}
        </div>

        <div className={`fixed left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 ${isCompactLayout ? 'top-[3.35rem] flex-col' : 'top-[3.65rem] flex-row'}`}>
          <div className="rounded-full border border-[rgba(255,245,235,0.14)] bg-[rgba(40,16,24,0.42)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--gold)] backdrop-blur-xl">
            {phaseLabelText}
          </div>
          <div className={`rounded-full border border-[rgba(255,245,235,0.14)] bg-[rgba(40,16,24,0.38)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/76 backdrop-blur-xl ${isCompactLayout ? 'max-w-[calc(100vw-2rem)] text-center' : ''}`}>
            {stageStatus}
          </div>
        </div>

        {!hasVoice && (
          <div className={`fixed left-1/2 z-40 max-w-[calc(100vw-1.5rem)] whitespace-nowrap rounded-full border border-[rgba(255,245,235,0.16)] bg-[rgba(40,16,24,0.46)] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white/80 backdrop-blur-xl -translate-x-1/2 ${isCompactLayout ? 'top-[7rem]' : 'top-[5.8rem]'}`}>
            {voiceError || 'Voice unavailable. Game continues normally.'}
          </div>
        )}

        {isCompactLayout ? (
          <>
            <button
              type="button"
              onClick={() => setInfoDrawerOpen((prev) => !prev)}
              className="fixed left-3 top-3 z-50 flex h-11 w-11 items-center justify-center rounded-[18px] border border-[rgba(255,245,235,0.18)] bg-[rgba(40,16,24,0.52)] text-[var(--bg-cloud)] backdrop-blur-xl shadow-[0_18px_34px_rgba(23,8,19,0.18)]"
              aria-label={infoDrawerOpen ? 'Close game info' : 'Open game info'}
            >
              {infoDrawerOpen ? <IconClose /> : <IconMenu />}
            </button>
            <AnimatePresence>
              {infoDrawerOpen && (
                <>
                  <motion.button
                    type="button"
                    key="info-drawer-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    onClick={() => setInfoDrawerOpen(false)}
                    className="fixed inset-0 z-40 bg-[rgba(10,4,8,0.26)] backdrop-blur-[1px]"
                    aria-label="Close game info"
                  />
                  <motion.div
                    key="info-drawer"
                    initial={{ opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="fixed left-3 top-[3.8rem] z-50 max-h-[calc(100dvh-5rem)] w-[min(86vw,340px)] overflow-y-auto rounded-[26px] border border-[rgba(255,245,235,0.16)] bg-[rgba(40,16,24,0.72)] p-3 backdrop-blur-xl shadow-[0_24px_44px_rgba(23,8,19,0.26)]"
                  >
                    <div className="mb-3 rounded-[20px] border border-white/12 bg-white/5 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="label-micro">Game Info</div>
                          <div className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-white/62">
                            {phaseLabelText} · {stageStatus}
                          </div>
                        </div>
                        {!isBluffMode ? (
                          <div className="headline-display text-xl leading-none text-[var(--gold)]">{myPlayer.score || 0}</div>
                        ) : (
                          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{myCardCount} cards</div>
                        )}
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="mb-2 label-micro">Opponents</div>
                      <div className="space-y-2">
                        {opponents.map(([id, p]) => (
                          <div key={`drawer-${id}`} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/12 bg-white/5 px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <div
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/14 text-[10px] font-black text-white"
                                style={{ backgroundColor: avatarColor(p?.name || 'P') }}
                              >
                                {(p?.name || 'P')[0]?.toUpperCase?.() || 'P'}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-[var(--bg-cloud)]">{p?.name}</div>
                                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/50">
                                  {id === visualTurnId ? 'On turn' : 'Waiting'}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              {!isBluffMode ? <div className="text-xs font-black text-[var(--gold)]">{p?.score || 0}</div> : null}
                              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/50">{hands[id]?.length ?? 0} cards</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {isBluffMode ? null : null}

                    <button
                      onClick={actions.leaveRoom}
                      className="mt-3 w-full rounded-[18px] border border-[rgba(241,100,124,0.34)] bg-[rgba(241,100,124,0.14)] px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-red-100"
                    >
                      Exit Room
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </>
        ) : null}

        {showDesktopChrome ? (
        <div className="fixed right-3 top-3 z-40 rounded-[24px] border border-[rgba(255,245,235,0.16)] bg-[rgba(40,16,24,0.42)] px-4 py-3 text-right backdrop-blur-xl shadow-[0_18px_34px_rgba(23,8,19,0.18)]">
          {/* <div className="chip-score justify-center">{theme}</div> */}
          {!isBluffMode ? (
            <>
              <div className="label-micro mt-2">Score</div>
              <div className="headline-display text-3xl leading-tight text-[var(--gold)]">
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
        ) : null}

        {showDesktopChrome ? (
        <div className="fixed left-3 top-3 z-40 rounded-[24px] border border-[rgba(255,245,235,0.16)] bg-[rgba(40,16,24,0.42)] px-3 py-3 backdrop-blur-xl shadow-[0_18px_34px_rgba(23,8,19,0.18)]">
          <div className="label-micro mb-2">Opponents</div>
          {opponents.map(([id, p]) => (
            <div key={id} className="flex items-center justify-between gap-4 py-0.5 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/14 text-[9px] font-black text-white"
                  style={{ backgroundColor: avatarColor(p?.name || 'P') }}
                >
                  {(p?.name || 'P')[0]?.toUpperCase?.() || 'P'}
                </div>
                <span className="max-w-[84px] truncate font-semibold text-[var(--bg-cloud)]">{p.name}</span>
                {id === leaderPlayerId ? (
                  <span className="text-[var(--gold)]">
                    <IconCrown />
                  </span>
                ) : null}
              </div>
              {!isBluffMode ? <span className="font-black text-[var(--gold)]">{p.score || 0}</span> : null}
            </div>
          ))}
        </div>
        ) : null}

        {/* ── OPPONENTS ───────────────────────────────────────── */}
        {showFloatingOpponents && opponents.map(([id, player], i) => {
          const slot = oppSlots[i];
          if (!slot) return null;
          return (
            <div key={id} className="fixed z-20" style={slot.style}>
              <OpponentSeat
                player={player}
                cardCount={hands[id]?.length ?? 0}
                isActive={id === visualTurnId}
                isLeaderPlayer={id === leaderPlayerId}
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
        {usePixiRenderer ? (
          <GameBoardCanvas
            gameState={gameState}
            myId={myId}
            actions={actions}
            isBluffMode={isBluffMode}
            displayCards={displayCards}
            selectedTokens={selectedTokens}
            canSelectHand={canSelectHand}
            onToggleToken={toggleSelection}
            canPick={canPick}
            canThrow={canThrow}
            canKnock={canKnock}
            onThrow={onThrowAttempt}
            onKnock={onKnockAttempt}
            phase={phase}
          />
        ) : (
          <div
            className="fixed z-10"
            style={{
              top: leastSumTableTop, left: '50%',
              transform: `translate(-50%, ${leastSumTableTranslateY})`,
              width: tableIslandWidth, height: tableIslandHeight,
              background: 'radial-gradient(ellipse at 50% 38%, rgba(115,255,198,0.28) 0%, rgba(54,139,92,0.26) 20%, rgba(31,92,63,0.94) 56%, rgba(18,58,42,0.98) 100%)',
              borderRadius: '50%',
              boxShadow: isLeastSumPhoneLayout
                ? '0 20px 0 rgba(16,54,38,0.94), 0 38px 84px rgba(18,6,13,0.36), inset 0 -18px 26px rgba(0,0,0,0.2), inset 0 5px 20px rgba(255,255,255,0.2)'
                : '0 18px 0 rgba(16,54,38,0.94), 0 34px 68px rgba(18,6,13,0.34), inset 0 -16px 24px rgba(0,0,0,0.18), inset 0 4px 18px rgba(255,255,255,0.18)',
              display: isBluffMode ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              className="absolute pointer-events-none rounded-[50%]"
              style={{
                inset: isLeastSumPhoneLayout ? '-32px' : '-24px',
                background: 'radial-gradient(circle at center, rgba(255,202,104,0.1), transparent 66%)',
                opacity: isLeastSumPhoneLayout ? (visualIsMyTurn ? 0.52 : 0.3) : (visualIsMyTurn ? 0.45 : 0.24),
              }}
            />
            {isLeastSumPhoneLayout ? (
              <div
                className="absolute inset-[-16px] rounded-[50%] pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at 50% 22%, rgba(255,248,239,0.1), transparent 54%)',
                  filter: 'blur(10px)',
                }}
              />
            ) : null}
            <div className="absolute inset-[-6px] rounded-[50%] pointer-events-none"
                 style={{ border: '4px solid rgba(255,241,224,0.22)' }} />
            <div className="absolute inset-[12px] rounded-[50%] pointer-events-none border border-[rgba(255,248,239,0.12)]" />

            <div className={`z-10 flex items-center ${isCompactLayout ? 'gap-3' : 'gap-5'}`}>
                <div className={`relative flex flex-col items-center gap-1 rounded-[22px] border border-[rgba(255,245,235,0.08)] bg-[rgba(255,248,239,0.04)] ${isCompactLayout ? 'px-2 py-2' : 'px-3 py-2'}`}>
                  <motion.div
                    animate={canPick ? { y: [0, -5, 0] } : {}}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                  >
                    <CardBack
                      size="md"
                      onClick={canPick && !optimisticUi?.drawPreview ? onPickDeckAttempt : undefined}
                      className={canPick && !optimisticUi?.drawPreview ? 'ring-2 ring-[rgba(255,202,104,0.9)] shadow-[0_0_18px_rgba(255,188,92,0.45)] cursor-pointer' : ''}
                    />
                  </motion.div>
                  <div className="headline-display absolute -right-2.5 -top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black shadow"
                       style={{ background:'linear-gradient(180deg,#ffd788,#ffb463)', color:'#34171a', borderColor:'rgba(108,52,19,0.24)' }}>
                    {visualDeckCount > 99 ? '99+' : visualDeckCount}
                  </div>
                  <span className="label-micro text-white/78">Deck</span>
                </div>

                <div className={`relative flex flex-col items-center gap-1 rounded-[22px] border border-[rgba(255,245,235,0.08)] bg-[rgba(255,248,239,0.04)] ${isCompactLayout ? 'px-2 py-2' : 'px-3 py-2'}`}>
                  <motion.div
                    animate={canPick && visualPreviousCard ? { scale: [1, 1.04, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                  >
                    {visualPreviousCard ? (
                      <PlayingCard
                        rank={visualPreviousCard.rank}
                        suit={visualPreviousCard.suit}
                        size="md"
                        onClick={canPick ? onPickPreviousAttempt : undefined}
                        className={canPick ? 'ring-2 ring-[rgba(255,202,104,0.9)] shadow-[0_0_18px_rgba(255,188,92,0.45)] cursor-pointer' : ''}
                        style={{ transform: 'rotate(5deg)' }}
                      />
                    ) : (
                      <div className="flex h-[92px] w-[64px] items-center justify-center rounded-[20px] border-2 border-dashed border-white/18 bg-[rgba(255,248,239,0.04)]">
                        <span className="label-micro text-white/34">Empty</span>
                      </div>
                    )}
                  </motion.div>
                  <span className="label-micro text-white/78">Previous</span>
                </div>

                <div className={`relative flex flex-col items-center gap-1 rounded-[22px] border border-[rgba(255,245,235,0.08)] bg-[rgba(255,248,239,0.04)] ${isCompactLayout ? 'px-2 py-2' : 'px-3 py-2'}`}>
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
                  <div className="headline-display absolute -right-2.5 -top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black shadow"
                       style={{ background:'rgba(255,248,239,0.92)', color:'#34171a', borderColor:'rgba(79,55,71,0.22)' }}>
                    {pileArr.length > 99 ? '99+' : pileArr.length}
                  </div>
                  <span className="label-micro text-white/78">Pile</span>
                </div>

                {jokerCard && (
                  <div className={`relative flex flex-col items-center gap-1 rounded-[22px] border border-[rgba(255,245,235,0.08)] bg-[rgba(255,248,239,0.04)] ${isCompactLayout ? 'px-2 py-2' : 'px-3 py-2'}`}>
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
                    <span className="label-micro text-[var(--gold)]">-1 Pt</span>
                  </div>
                )}
            </div>
          </div>
        )}

        {isBluffMode && (
          <div
            className={`fixed left-1/2 -translate-x-1/2 ${isBluffCompactLayout ? 'z-20' : 'z-30'}`}
            style={{
              top: isBluffCompactLayout ? '37.5%' : isPhoneLayout ? '45%' : '48%',
              transform: isBluffCompactLayout ? 'translate(-50%, -33%)' : 'translate(-50%, -42%)',
            }}
          >
            {bluffTableControls}
          </div>
        )}

        {/* ── BOTTOM AREA (fixed) ─────────────────────────────── */}
        <div className={`fixed bottom-0 left-0 right-0 z-30 flex flex-col pointer-events-none ${isLeastSumPhoneLayout ? 'pb-1' : ''} ${isBluffCompactLayout ? '-translate-y-3' : ''}`}>
          <AnimatePresence>
            {visualIsMyTurn && !isBluffCompactLayout && (
              <motion.div
                key="yourturn"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                className="mb-2 flex justify-center pointer-events-none"
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.7 }}
                  className={`headline-display rounded-full border font-black uppercase ${
                    isCompactLayout ? 'px-5 py-1.5 text-[11px] tracking-[0.14em]' : 'px-6 py-2 text-sm tracking-[0.18em]'
                  }`}
                  style={{ background:'linear-gradient(180deg,#ffd788,#ffb463)', color:'#34171a', borderColor:'rgba(108,52,19,0.24)', boxShadow:'0 10px 22px rgba(255,177,99,0.28)' }}
                >
                  Your Turn
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isBluffCompactLayout ? (
          <div className={`relative z-40 pointer-events-auto ${isLeastSumPhoneLayout ? 'mb-1 px-2.5' : 'mb-1.5 px-3'} ${isBluffCompactLayout && showHandScrollButtons ? 'pb-2' : ''} flex gap-2 ${isCompactLayout ? 'flex-col' : 'flex-wrap items-end justify-between'}`}>
            {!isBluffCompactLayout ? (
            <div className={`flex items-center gap-2 rounded-[24px] border backdrop-blur-xl shadow-[0_18px_34px_rgba(23,8,19,0.18)] ${isCompactLayout ? 'w-full' : ''} ${isLeastSumPhoneLayout ? 'px-3 py-2' : 'px-3 py-2.5'} ${
              visualIsMyTurn
                ? 'border-[rgba(255,202,104,0.34)] bg-[linear-gradient(180deg,rgba(255,202,104,0.14),rgba(40,16,24,0.48))]'
                : 'border-[rgba(255,245,235,0.16)] bg-[rgba(40,16,24,0.46)]'
            }`}>
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/18 text-sm font-black text-white shadow-[0_12px_24px_rgba(23,8,19,0.18)]"
                style={{ backgroundColor: avatarColor(myPlayer.name || 'Y') }}
              >
                {(myPlayer.name || 'Y')[0]?.toUpperCase?.() || 'Y'}
              </div>
              <div>
                <div className={`flex items-center gap-1.5 text-[var(--bg-cloud)] font-semibold leading-tight ${isCompactLayout ? 'text-[11px]' : 'text-xs'}`}>
                  <span>{myPlayer.name}</span>
                  {myId === leaderPlayerId ? (
                    <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full border border-[rgba(255,202,104,0.34)] bg-[rgba(255,202,104,0.14)] text-[var(--gold)]">
                      <IconCrown />
                    </span>
                  ) : null}
                  <span className={`text-white/40 font-semibold ${isCompactLayout ? 'text-[9px]' : 'text-[10px]'}`}>(YOU)</span>
                </div>
                <div className={`text-[var(--gold)] font-black leading-tight ${isCompactLayout ? 'text-[11px]' : 'text-xs'}`}>
                  {isBluffMode ? `Cards: ${myCardCount}` : `Current Sum: ${myRoundSum}`}
                </div>
              </div>
              {hasVoice ? (
                <MyVoiceButton />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border-2 bg-[rgba(40,16,24,0.42)] border-white/20 text-white/45">
                  <IconMicOff />
                </div>
              )}
              {timerActive && visualIsMyTurn && (
                <TurnTimerBadge
                  timerPct={timerPct}
                  timerUrgent={timerUrgent}
                  remainingSec={remainingSec}
                  sizeClass="w-9 h-9"
                />
              )}
            </div>
            ) : null}

            <div className={`flex items-center gap-2 flex-wrap ${isCompactLayout ? 'w-full justify-center' : 'justify-end'} ${isLeastSumPhoneLayout ? 'pb-0.5' : ''}`}>
              {!isBluffMode && actionBlockReason && (
                <div className={`rounded-[20px] border border-[rgba(255,245,235,0.14)] bg-[rgba(40,16,24,0.42)] font-black uppercase text-white/70 backdrop-blur-xl ${
                  isCompactLayout ? 'px-3 py-1.5 text-[9px] tracking-[0.1em]' : 'px-3 py-2 text-[10px] tracking-wider'
                }`}>
                  {actionBlockReason}
                </div>
              )}
              {visualIsMyTurn && isBluffMode && !isBluffCompactLayout ? (
	                <div className={`rounded-[20px] border border-[rgba(255,245,235,0.14)] bg-[rgba(40,16,24,0.42)] font-black uppercase text-white/55 backdrop-blur-xl ${
                    isCompactLayout ? 'px-3 py-1.5 text-[9px] tracking-[0.1em]' : 'px-4 py-2 text-[10px] tracking-wider'
                  }`}>
	                  Table controls
	                </div>
	              ) : phase === 'throw' ? (
                <div className="flex gap-2 flex-wrap items-center justify-end">
                  <button
                    onClick={onThrowAttempt}
                    disabled={!canThrow}
                    className={`font-black uppercase rounded-2xl ${
                      isCompactLayout ? 'px-4 py-2 text-[11px] tracking-[0.08em]' : 'px-5 py-2.5 text-xs'
                    } ${
                      canThrow
                        ? isThrowMatch
                          ? 'btn-primary-game'
                          : 'btn-secondary-game'
                        : 'bg-white/10 text-white/20 cursor-not-allowed'
                    }`}
                  >
                    {isThrowMatch ? `Throw Match ${selectedCards[0]?.rank}s` : 'Throw'}
                  </button>
                  {canKnock && (
                    <button
                      onClick={onKnockAttempt}
                      className={`btn-danger-game ${isCompactLayout ? 'px-3.5 py-2 text-[11px] tracking-[0.08em]' : 'px-4 py-2.5 text-xs'}`}
                    >
                      Knock
                    </button>
                  )}
                  {actionWarning && (
                    <div className={`rounded-[20px] border border-[rgba(241,100,124,0.34)] bg-[rgba(241,100,124,0.14)] font-black uppercase text-red-100 ${
                      isCompactLayout ? 'px-3 py-1.5 text-[9px] tracking-[0.1em]' : 'px-3 py-2 text-[10px] tracking-wider'
                    }`}>
                      {actionWarning}
                    </div>
                  )}
                </div>
	              ) : phase === 'pick' ? (
                <div className="flex gap-2 flex-wrap items-center justify-end">
                  <button
                    onClick={onPickDeckAttempt}
                    disabled={!canPick || !!optimisticUi?.drawPreview}
                    className={`uppercase rounded-2xl ${
                      isCompactLayout ? 'px-4 py-2 text-[10px] font-semibold tracking-[0.14em]' : 'px-4 py-2.5 text-xs font-black'
                    } ${
                      canPick && !optimisticUi?.drawPreview ? 'btn-primary-game' : 'bg-white/10 text-white/20 cursor-not-allowed'
                    }`}
                  >
                    Pick Deck
                  </button>
                  <button
                    onClick={onPickPreviousAttempt}
                    disabled={!canPick || !previousOpenCard || !!optimisticUi?.drawPreview}
                    className={`uppercase rounded-2xl ${
                      isCompactLayout ? 'px-4 py-2 text-[10px] font-semibold tracking-[0.14em]' : 'px-4 py-2.5 text-xs font-black'
                    } ${
                      canPick && previousOpenCard && !optimisticUi?.drawPreview ? 'btn-secondary-game' : 'bg-white/10 text-white/20 cursor-not-allowed'
                    }`}
                  >
                    Pick Previous
                  </button>
                  {optimisticUi?.drawPreview ? (
                    <div className={`rounded-[20px] border border-[rgba(255,202,104,0.34)] bg-[rgba(255,202,104,0.12)] font-black uppercase text-yellow-100 ${
                      isCompactLayout ? 'px-3 py-1.5 text-[9px] tracking-[0.1em]' : 'px-3 py-2 text-[10px] tracking-wider'
                    }`}>
                      Drawing...
                    </div>
                  ) : null}
                  {pendingThrown.length > 0 ? null : null}
                </div>
              ) : null}
            </div>
          </div>
          ) : null}

          {/* ── HAND CARDS — horizontally scrollable, max 10 ──── */}
          {!usePixiRenderer ? (
            <div className={`relative z-10 overflow-visible pointer-events-auto ${isLeastSumPhoneLayout ? 'px-3 pb-4' : 'px-4 pb-5'} ${isBluffCompactLayout ? '-mt-2 px-3 pb-1' : ''} ${isBluffCompactLayout && showHandScrollButtons ? 'pt-0' : ''}`}>
              {showHandScrollButtons && !isBluffCompactLayout ? (
                <div className={`relative z-[120] pointer-events-auto ${isBluffCompactLayout ? 'mb-3 rounded-[18px] border border-[rgba(255,245,235,0.12)] bg-[rgba(40,16,24,0.34)] px-2 py-1.5 shadow-[0_12px_24px_rgba(23,8,19,0.16)]' : 'mb-2 px-1'} flex items-center justify-between`}>
                  <button
                    type="button"
                    onClick={() => scrollHandStripBy(-1)}
                    disabled={!canScrollHandLeft}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                      canScrollHandLeft
                        ? 'border-[rgba(255,202,104,0.42)] bg-[rgba(40,16,24,0.56)] text-[var(--gold)] shadow-[0_12px_24px_rgba(23,8,19,0.18)]'
                        : 'border-white/10 bg-white/5 text-white/25 cursor-not-allowed'
                    }`}
                    aria-label="Scroll cards left"
                  >
                    <IconChevronLeft />
                  </button>
                  {!isBluffCompactLayout ? (
                    <div className="rounded-full border border-[rgba(255,245,235,0.12)] bg-[rgba(40,16,24,0.34)] px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/55">
                      Scroll hand
                    </div>
                  ) : (
                    <div className="px-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-white/50">
                      Scroll
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => scrollHandStripBy(1)}
                    disabled={!canScrollHandRight}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                      canScrollHandRight
                        ? 'border-[rgba(255,202,104,0.42)] bg-[rgba(40,16,24,0.56)] text-[var(--gold)] shadow-[0_12px_24px_rgba(23,8,19,0.18)]'
                        : 'border-white/10 bg-white/5 text-white/25 cursor-not-allowed'
                    }`}
                    aria-label="Scroll cards right"
                  >
                    <IconChevronRight />
                  </button>
                </div>
              ) : null}
              <div
                ref={handStripRef}
                onScroll={onHandStripScroll}
                style={{
                  overflowX: isHandScrollable ? 'auto' : 'hidden',
                  overflowY: 'hidden',
                  scrollbarWidth: 'none',
                  WebkitOverflowScrolling: 'touch',
                  touchAction: isDragging ? 'none' : 'pan-x',
                  paddingTop: `${handTopReservePx}px`,
                  marginTop: `-${handTopReservePx}px`,
                  position: 'relative',
                  zIndex: 10,
                }}
              >
                <div
                  ref={handTrackRef}
                  className={`rounded-t-[28px] border border-b-0 border-[rgba(255,245,235,0.14)] bg-[linear-gradient(180deg,rgba(40,16,24,0.42),rgba(40,16,24,0.14))] ${isBluffCompactLayout ? 'pt-0' : 'pt-3'} shadow-[0_-14px_28px_rgba(23,8,19,0.14)] ${
                    isBluffMode
                      ? isHandScrollable
                        ? 'flex w-max min-w-max items-end justify-start pl-4 pr-8'
                        : 'mx-auto flex w-max items-end justify-start pl-4 pr-8'
                      : isHandScrollable
                        ? 'flex w-max min-w-max items-end justify-start px-4'
                        : 'mx-auto flex min-w-full w-max items-end justify-center px-4'
                  }`}
                >
  	              {handVisualCards.map((card, cardIdx) => {
  	                if (card?.preview) {
  	                  return (
                      <motion.div
                        key={card.token}
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: -18, scale: 1 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                          flexShrink: 0,
                          position: 'relative',
                          overflow: 'visible',
                          marginLeft: isBluffMode && cardIdx > 0 ? -bluffOverlapPx : 0,
                          zIndex: 20 + cardIdx,
                        }}
                      >
                        {card.source === 'previous' ? (
                          <PlayingCard
                            rank={card.rank}
                            suit={card.suit}
                            size={isBluffMode ? bluffHandCardSize : 'lg'}
                            isDisabled
                            style={{ boxShadow: '0 16px 30px rgba(23,8,19,0.24)' }}
                          />
                        ) : (
                          <CardBack
                            size={isBluffMode ? 'lg' : 'lg'}
                            className="opacity-95"
                            style={{ boxShadow: '0 16px 30px rgba(23,8,19,0.24)' }}
                          />
                        )}
                      </motion.div>
                    );
                  }
  	              const isChosen    = selectedTokens.includes(card.token);
  	                const isJokerCard = isJokerMatch(card, jokerCard);
  	                const isMatchable = !isBluffMode && phase === 'throw' && card.rank === previousOpenCard?.rank && isMyTurn;
  	                const baseAngle = isBluffMode
  	                  ? clamp((cardIdx - (displayCards.length - 1) / 2) * 0.7, -6, 6)
  	                  : 0;
                  const isDragged = dragToken === card.token;
                  const overlap = isBluffMode && cardIdx > 0
                    ? ((isChosen || isDragged) ? 0 : -bluffOverlapPx)
                    : 0;
                  const liftY = isDragged
                    ? -58
                    : 0;

                  return (
                    <motion.div
                      key={card.token}
                      ref={(node) => {
                        if (node) cardNodeRefs.current.set(card.token, node);
                        else cardNodeRefs.current.delete(card.token);
                      }}
                      data-token={card.token}
                      initial={{ opacity: 0, y: 36, rotate: baseAngle + 2 }}
                      animate={{ opacity: 1, y: liftY, x: 0, scale: isDragged ? 1.04 : 1, rotate: baseAngle }}
                      transition={{ type: 'spring', stiffness: 400, damping: 22, delay: Math.min(cardIdx * 0.018, 0.16) }}
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
                        marginRight: (isBluffMode && (isChosen || isDragged)) ? 6 : 0,
                        zIndex: isDragged ? 640 : (isChosen ? 460 + cardIdx : 20 + cardIdx),
                        cursor: isDragging ? 'grabbing' : 'grab',
                      }}
  	                  >
                      <PlayingCard
                        rank={card.rank}
                        suit={card.suit}
                        size={isBluffMode ? bluffHandCardSize : 'lg'}
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
          ) : (
            <div className="h-4" />
          )}
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
