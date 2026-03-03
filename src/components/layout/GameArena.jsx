import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LiveKitRoom,
  AudioConference,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react';
import {
  avatarColor, handSum, playSound, vibrate,
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

// ── Opponent voice indicator (read-only) ──────────────────────
function OppVoiceIndicator({ identity }) {
  const participants = useParticipants();
  const participant  = participants.find(p => p.identity === identity);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!participant?.on) { setIsSpeaking(false); return; }
    setIsSpeaking(!!participant.isSpeaking);
    const h = s => setIsSpeaking(!!s);
    participant.on('isSpeakingChanged', h);
    return () => participant.off('isSpeakingChanged', h);
  }, [participant]);

  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border transition-all ${
        isSpeaking
          ? 'bg-green-400/50 border-green-400 text-white'
          : 'bg-black/30 border-white/25 text-white/60'
      }`}
      style={{ animation: isSpeaking ? 'pulsemic 1.2s ease infinite' : 'none' }}
    >
      <IconMic />
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
function OpponentSeat({ player, cardCount, isActive, id, fanRotation = 0 }) {
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
        <OppVoiceIndicator identity={id} />
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
export default function GameArena({ gameState, myId, actions }) {
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [turnFlash,       setTurnFlash]       = useState(false);
  const prevTurnRef = useRef(null);

  const lkUrl   = import.meta.env.VITE_LIVEKIT_URL;
  const lkToken = gameState?.liveKitToken || gameState?.players?.[myId]?.liveKitToken;

  if (!gameState) return null;

  if (!lkUrl || !lkToken) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: 'linear-gradient(165deg,#5BC8F5 0%,#4CC95A 100%)' }}
      >
        <div className="bg-black/30 backdrop-blur-xl rounded-3xl p-8 text-center border border-white/20">
          <p className="font-black text-white text-sm uppercase tracking-widest animate-pulse">
            Connecting to voice…
          </p>
        </div>
      </div>
    );
  }

  const {
    phase = 'draw',
    turnOrder = [],
    currentTurnIdx = 0,
    hands = {},
    deck = [],
    discard = [],
    drawnCard   = null,
    drawSource  = null,
    config      = {},
    jokerCard   = null,
  } = gameState ?? {};

  const allPlayersSorted   = Object.entries(gameState?.players ?? {}).sort((a, b) => a[1].order - b[1].order);
  const fallbackTurnOrder  = allPlayersSorted.map(([id]) => id);
  const effectiveTurnOrder = turnOrder.length > 0 ? turnOrder : fallbackTurnOrder;
  const currentTurnId      = effectiveTurnOrder[currentTurnIdx] ?? null;
  const isMyTurn           = currentTurnId === myId;
  const myCards            = hands?.[myId] ?? [];
  const deckCount          = Array.isArray(deck) ? deck.length : 0;
  const discardArr         = Array.isArray(discard) ? discard : [];
  const topDiscard         = discardArr[discardArr.length - 1] ?? null;
  const myPlayer           = gameState?.players?.[myId] ?? { name: 'You', score: 0 };
  const currentTurnPlayer  = currentTurnId ? gameState?.players?.[currentTurnId] : null;
  const myTurnCount        = gameState?.turnCount ?? 0;
  const canKnock           = myTurnCount >= (config.minTurnsToKnock ?? 1);
  const myHandSum          = handSum(myCards, jokerCard);

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

  const handleCardClick = (originalIdx) => {
    if (!isMyTurn) return;
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
  const isValidMatch  = phase === 'draw' && selectedCards.length > 0 && topDiscard && selectedCards[0]?.rank === topDiscard.rank;
  const isValidSwap   = phase === 'swap'  && selectedCards.length > 0;

  return (
    <LiveKitRoom audio token={lkToken} serverUrl={lkUrl} connect>
      {/* Audio only — no visible LiveKit UI */}
      <div style={{ display: 'none' }}><AudioConference /></div>

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
          {gameState.roomCode ?? '----'} · RD {gameState.round ?? 1}
        </div>

        {/* My total score — top right */}
        <div className="fixed top-3 right-3 z-40 bg-black/35 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-2 text-right">
          <div className="text-[9px] font-black text-white/50 uppercase tracking-[1.5px]">Score</div>
          <div className="text-2xl font-black text-yellow-400 leading-tight"
               style={{ fontFamily:"'Fredoka One',cursive" }}>
            {myPlayer.score || 0}
          </div>
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
                fanRotation={slot.fan}
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

          {/* Center: Deck | Discard | Joker | Drawn */}
          <div className="flex items-center gap-5 z-10">

            {/* Deck */}
            <div className="flex flex-col items-center gap-1 relative">
              <motion.div
                animate={isMyTurn && phase === 'draw' ? { y: [0, -5, 0] } : {}}
                transition={{ repeat: Infinity, duration: 1.6 }}
              >
                <CardBack
                  size="md"
                  onClick={isMyTurn && phase === 'draw'
                    ? () => { vibrate(25); playSound('draw'); actions.drawFromDeck(); }
                    : undefined}
                  className={isMyTurn && phase === 'draw'
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

            {/* Discard */}
            <div className="flex flex-col items-center gap-1 relative">
              <motion.div
                animate={isMyTurn && phase === 'draw' && topDiscard ? { scale: [1, 1.04, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1.6 }}
              >
                {topDiscard ? (
                  <PlayingCard
                    rank={topDiscard.rank} suit={topDiscard.suit} size="md"
                    onClick={isMyTurn && phase === 'draw'
                      ? () => { vibrate(25); playSound('draw'); actions.takeDiscard(); }
                      : undefined}
                    className={isMyTurn && phase === 'draw'
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
                    style={{ textShadow:'0 1px 4px rgba(0,0,0,0.5)' }}>DISCARD</span>
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

            {/* Drawn card (swap phase) */}
            <AnimatePresence>
              {phase === 'swap' && drawnCard && (
                <motion.div
                  initial={{ scale: 0, y: 20 }} animate={{ scale: 1.05, y: 0 }} exit={{ scale: 0 }}
                  className="flex flex-col items-center gap-1"
                >
                  {(isMyTurn || drawSource === 'discard')
                    ? <PlayingCard rank={drawnCard.rank} suit={drawnCard.suit} size="sm"
                                   className="ring-2 ring-white shadow-[0_0_14px_rgba(255,255,255,0.55)]" />
                    : <CardBack size="sm" />
                  }
                  <span className="text-white font-black text-[9px] uppercase tracking-widest"
                        style={{ textShadow:'0 1px 4px rgba(0,0,0,0.5)' }}>DRAWN</span>
                </motion.div>
              )}
            </AnimatePresence>
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
              <MyVoiceButton />
            </div>

            {/* Phase actions */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {!isMyTurn ? (
                <div className="px-4 py-2 bg-black/28 backdrop-blur-md border border-white/15 rounded-2xl text-white/40 text-[10px] font-black uppercase tracking-wider">
                  {currentTurnPlayer?.name ?? '…'}'s turn
                </div>
              ) : phase === 'draw' ? (
                isValidMatch ? (
                  <motion.button
                    initial={{ scale: 0.88 }} animate={{ scale: 1 }}
                    onClick={() => { vibrate([30,20,60]); playSound('match'); actions.matchCards(selectedIndices); }}
                    className="px-5 py-2.5 bg-yellow-400 text-black font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] hover:brightness-110 active:scale-95"
                  >
                    MATCH {selectedCards[0]?.rank}s ✓
                  </motion.button>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => { vibrate(25); playSound('draw'); actions.drawFromDeck(); }}
                      className="px-4 py-2.5 bg-sky-500 text-white font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] hover:brightness-110 active:scale-95"
                    >
                      ↑ DRAW
                    </button>
                    <button
                      onClick={() => { vibrate(25); playSound('draw'); actions.takeDiscard(); }}
                      disabled={!topDiscard}
                      className={`px-4 py-2.5 font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] ${
                        topDiscard ? 'bg-emerald-500 text-white hover:brightness-110 active:scale-95' : 'bg-white/10 text-white/20 cursor-not-allowed'
                      }`}
                    >
                      DISCARD ↓
                    </button>
                    {canKnock && (
                      <button
                        onClick={() => { vibrate(50); playSound('knock'); actions.knock(); }}
                        className="px-4 py-2.5 bg-red-500 text-white font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] hover:brightness-110 active:scale-95"
                      >
                        ✊ KNOCK
                      </button>
                    )}
                  </div>
                )
              ) : phase === 'swap' ? (
                isValidSwap ? (
                  <motion.button
                    initial={{ scale: 0.88 }} animate={{ scale: 1 }}
                    onClick={() => { vibrate(30); playSound('discard'); actions.swapCards(selectedIndices); }}
                    className="px-5 py-2.5 bg-yellow-400 text-black font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] active:scale-95"
                  >
                    SWAP ✓
                  </motion.button>
                ) : (
                  <div className="flex gap-2 items-center">
                    <span className="text-yellow-400 text-[10px] font-black uppercase animate-pulse">
                      Select card(s) to swap
                    </span>
                    {drawSource === 'deck' && (
                      <button
                        onClick={() => { vibrate(20); playSound('discard'); actions.discardDrawn(); }}
                        className="px-4 py-2.5 bg-red-500 text-white font-black text-xs uppercase rounded-2xl shadow-[0_4px_0_rgba(0,0,0,0.28)] active:scale-95"
                      >
                        DISCARD DRAWN
                      </button>
                    )}
                  </div>
                )
              ) : null}
            </div>
          </div>

          {/* ── HAND CARDS — horizontally scrollable, max 10 ──── */}
          <div
            className="flex items-end gap-[6px] pb-5 pt-1"
            style={{
              overflowX: groupedHand.length > 6 ? 'auto' : 'visible',
              overflowY: 'visible',
              paddingLeft: 16,
              paddingRight: 16,
              justifyContent: groupedHand.length <= 6 ? 'center' : 'flex-start',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {groupedHand.map((card) => {
              const isChosen    = selectedIndices.includes(card.originalIdx);
              const isJokerCard = jokerCard && card.rank === jokerCard.rank && card.suit === jokerCard.suit;
              const isMatchable = phase === 'draw' && card.rank === topDiscard?.rank && isMyTurn;

              return (
                <motion.div
                  key={card.originalIdx}
                  animate={{ y: isChosen ? -28 : 0, scale: isChosen ? 1.08 : 1 }}
                  whileHover={isMyTurn ? { y: -18, scale: 1.05 } : {}}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  onClick={() => handleCardClick(card.originalIdx)}
                  style={{ flexShrink: 0, position: 'relative', zIndex: isChosen ? 60 : 10, cursor: isMyTurn ? 'pointer' : 'default' }}
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
    </LiveKitRoom>
  );
}