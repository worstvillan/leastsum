import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LiveKitRoom,
  AudioConference,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react';
import {
  avatarColor, handSum, isJokerMatch, playSound, vibrate,
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
          <span className="text-yellow-400 font-black text-[10px]">{player.score || 0}</span>
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

// ── Opponent fixed-slot positions ─────────────────────────────
function getOppSlots(n) {
  if (n === 1) return [
    { style: { top: '8vh', left: '50%', transform: 'translateX(-50%)' }, fan: 0 },
  ];
  if (n === 2) return [
    { style: { top: '8vh', left: '28%', transform: 'translateX(-50%)' }, fan: 0 },
    { style: { top: '8vh', left: '72%', transform: 'translateX(-50%)' }, fan: 0 },
  ];
  if (n === 3) return [
    { style: { top: '8vh', left: '50%', transform: 'translateX(-50%)' }, fan: 0 },
    { style: { top: '40%',  left: '3%', transform: 'translateY(-50%)' }, fan: 90 },
    { style: { top: '40%',  right: '3%', transform: 'translateY(-50%)' }, fan: -90 },
  ];
  // 4 – 7 opponents
  return [
    { style: { top: '8vh', left: '50%', transform: 'translateX(-50%)' }, fan: 0 },
    { style: { top: '8vh', left: '22%', transform: 'translateX(-50%)' }, fan: 0 },
    { style: { top: '8vh', left: '78%', transform: 'translateX(-50%)' }, fan: 0 },
    { style: { top: '38%', left: '2%',  transform: 'translateY(-50%)' }, fan: 90 },
    { style: { top: '38%', right: '2%', transform: 'translateY(-50%)' }, fan: -90 },
    { style: { top: '20%', left: '4%',  transform: 'translateY(-50%)' }, fan: 75 },
    { style: { top: '20%', right: '4%', transform: 'translateY(-50%)' }, fan: -75 },
  ].slice(0, n);
}

// ══════════════════════════════════════════════════════════════
// MAIN GAME ARENA
// ══════════════════════════════════════════════════════════════
export default function GameArena({ gameState, myId, roomCode = '', actions, voiceToken = '', voiceUrl = '', voiceError = '' }) {
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [turnFlash,       setTurnFlash]       = useState(false);
  const [nowMs,           setNowMs]           = useState(() => Date.now());
  const [actionWarning,   setActionWarning]   = useState('');
  const prevTurnRef = useRef(null);

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
  const myTurnCount        = gameState?.turnCount ?? 0;
  const canKnock           = myTurnCount >= (config.minTurnsToKnock ?? 1);
  const myHandSum          = handSum(myCards, jokerCard);
  const turnDeadlineAt     = Number(gameState?.turnDeadlineAt || 0);
  const totalTurnMs        = Math.max(5000, (Number(config?.turnTimeSec) || 45) * 1000);
  const timerActive        = gameState?.status === 'playing' && turnDeadlineAt > 0;
  const remainingMs        = timerActive ? Math.max(0, turnDeadlineAt - nowMs) : 0;
  const remainingSec       = timerActive ? Math.ceil(remainingMs / 1000) : 0;
  const timerPct           = timerActive ? Math.max(0, Math.min(100, (remainingMs / totalTurnMs) * 100)) : 0;
  const timerUrgent        = timerActive && remainingMs <= 7000;

  const opponents = allPlayersSorted.filter(([id]) => id !== myId);
  const oppSlots  = getOppSlots(opponents.length);

  // Sort hand by rank for display
  const groupedHand = myCards
    .map((card, originalIdx) => ({ ...card, originalIdx }))
    .sort((a, b) => (a.rank > b.rank ? 1 : -1));

  useEffect(() => { setSelectedIndices([]); }, [phase, currentTurnId]);

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

  const handleCardClick = (originalIdx) => {
    if (!isMyTurn || phase !== 'throw') return;
    vibrate(20);
    const card = myCards[originalIdx];
    if (!card) return;
    setSelectedIndices(prev => {
      if (prev.includes(originalIdx) || (prev.length > 0 && myCards[prev[0]]?.rank !== card.rank))
        return [originalIdx];
      return [...prev, originalIdx];
    });
  };

  const selectedCards = selectedIndices.map(i => myCards[i]).filter(Boolean);
  const hasSelection = selectedIndices.length > 0;
  const canThrow = isMyTurn && phase === 'throw' && hasSelection;
  const isThrowMatch = !!previousOpenCard && selectedCards.length > 0 && selectedCards[0]?.rank === previousOpenCard.rank;
  const canPick = isMyTurn && phase === 'pick';
  const shouldScrollHand = groupedHand.length > 6;

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
    const result = await actions.throwSelected(selectedIndices);
    if (result?.ok) {
      setActionWarning('');
      return;
    }
    if (result?.reason === 'MATCH_REQUIRES_ONE_CARD_LEFT') {
      setActionWarning('Match throw must leave at least 1 card in hand.');
      vibrate([18, 12, 18]);
      return;
    }
    setActionWarning('Throw is not allowed right now.');
  };

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
          <div className="text-[9px] font-black text-white/50 uppercase tracking-[1.5px]">Score</div>
          <div className="text-2xl font-black text-yellow-400 leading-tight"
               style={{ fontFamily:"'Fredoka One',cursive" }}>
            {myPlayer.score || 0}
          </div>
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
              <span className="text-yellow-400">{p.score || 0}</span>
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
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Rim */}
          <div className="absolute inset-[-6px] rounded-[50%] pointer-events-none"
               style={{ border: '4px solid rgba(255,255,255,0.22)' }} />

          {/* Center: Deck | Previous | Pile | Joker */}
          <div className="flex items-center gap-5 z-10">

            {/* Deck */}
            <div className="flex flex-col items-center gap-1 relative">
              <motion.div
                animate={canPick ? { y: [0, -5, 0] } : {}}
                transition={{ repeat: Infinity, duration: 1.6 }}
              >
                <CardBack
                  size="md"
                  onClick={canPick
                    ? () => { vibrate(25); playSound('draw'); actions.pickFromDeck(); }
                    : undefined}
                  className={canPick
                    ? 'ring-2 ring-yellow-400 shadow-[0_0_18px_rgba(250,204,21,0.65)] cursor-pointer'
                    : ''}
                />
              </motion.div>
              {/* Count bubble */}
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
                    rank={previousOpenCard.rank} suit={previousOpenCard.suit} size="md"
                    onClick={canPick
                      ? () => { vibrate(25); playSound('draw'); actions.pickFromPrevious(); }
                      : undefined}
                    className={canPick
                      ? 'ring-2 ring-yellow-400 shadow-[0_0_18px_rgba(250,204,21,0.65)] cursor-pointer'
                      : ''}
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

            {/* Pile (history, reshuffle source) */}
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
                    rank={jokerCard.rank} suit={jokerCard.suit} size="sm"
                    isDisabled style={{ transform: 'rotate(-6deg)', opacity: 0.9 }}
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
          <div className="flex items-end justify-between px-3 mb-1.5 gap-2 flex-wrap">

            {/* My info + voice toggle */}
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2">
              <div>
                <div className="text-white font-black text-xs leading-tight">
                  {myPlayer.name}&nbsp;<span className="text-white/40 font-bold text-[10px]">(YOU)</span>
                </div>
                <div className="text-yellow-400 text-xs font-black leading-tight">Sum: {myHandSum}</div>
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
              {!isMyTurn ? (
                <div className="px-4 py-2 bg-black/28 backdrop-blur-md border border-white/15 rounded-2xl text-white/40 text-[10px] font-black uppercase tracking-wider">
                  {currentTurnPlayer?.name ?? '…'}'s turn
                </div>
              ) : phase === 'throw' ? (
                <div className="flex gap-2 flex-wrap items-center justify-end">
                  {!hasSelection && (
                    <div className="px-3 py-2 bg-black/28 backdrop-blur-md border border-white/15 rounded-2xl text-white/55 text-[10px] font-black uppercase tracking-wider">
                      Select same-rank card(s), then throw
                    </div>
                  )}
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
                  <div className="px-3 py-2 bg-black/28 backdrop-blur-md border border-white/15 rounded-2xl text-white/65 text-[10px] font-black uppercase tracking-wider">
                    Non-match throw done. Pick one source
                  </div>
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
          <div
            className="pb-5 pt-1 px-4"
            style={{
              overflowX: shouldScrollHand ? 'auto' : 'visible',
              overflowY: 'visible',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="flex items-end gap-[6px] w-max min-w-full justify-center mx-auto">
              {groupedHand.map((card) => {
                const isChosen    = selectedIndices.includes(card.originalIdx);
                const isJokerCard = isJokerMatch(card, jokerCard);
                const canSelectHand = isMyTurn && phase === 'throw';
                const isMatchable = phase === 'throw' && card.rank === previousOpenCard?.rank && isMyTurn;

                return (
                  <motion.div
                    key={card.originalIdx}
                    animate={{ y: isChosen ? -28 : 0, scale: isChosen ? 1.08 : 1 }}
                    whileHover={canSelectHand ? { y: -18, scale: 1.05 } : {}}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    onClick={() => handleCardClick(card.originalIdx)}
                    style={{ flexShrink: 0, position: 'relative', zIndex: isChosen ? 60 : 10, cursor: canSelectHand ? 'pointer' : 'default' }}
                  >
                    <PlayingCard
                      rank={card.rank}
                      suit={card.suit}
                      size="lg"
                      isSelected={isChosen}
                      isMatchable={isMatchable && !isChosen}
                      isJoker={isJokerCard}
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </>
  );

  if (!hasVoice) return board;

  return (
    <LiveKitRoom audio token={voiceToken} serverUrl={voiceUrl} connect>
      <div style={{ display: 'none' }}><AudioConference /></div>
      {board}
    </LiveKitRoom>
  );
}
