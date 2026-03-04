import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { avatarColor } from '../../utils/gameUtils';

// ── Design tokens (vibrant sky-green theme) ───────────────────
const CARD_CLS =
  'w-full bg-slate-100/95 backdrop-blur-md border border-white/60 rounded-2xl px-4 py-3 ' +
  'lobby-input font-medium text-slate-900 outline-none transition-all ' +
  'focus:border-yellow-400 focus:bg-white';

const AUTOFILL = {
  WebkitBoxShadow: '0 0 0 1000px rgba(255,255,255,0.92) inset',
};

const CONFIG_DEFAULTS = {
  cardsPerPlayer:  6,
  maxPlayers:      4,
  elimScore:       200,
  minTurnsToKnock: 1,
  knockerPenalty:  60,
  useJoker:        false,
};

// ── Error banner ───────────────────────────────────────────────
function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <AnimatePresence>
      <motion.div
        key="err"
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
        className="flex items-center gap-3 bg-red-500/20 border border-red-400/50 text-red-200 rounded-xl px-4 py-3 mb-4 text-sm font-bold"
      >
        <span className="flex-1">{message}</span>
        <button onClick={onDismiss} className="text-red-300/60 hover:text-red-200 text-lg leading-none">✕</button>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Slider row with visible value ──────────────────────────────
function SliderRow({ label, min, max, step = 1, value, onChange, display }) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black text-white/55 uppercase tracking-widest">{label}</span>
        <span
          className="text-sm font-black text-yellow-400 min-w-[32px] text-right"
          style={{ fontFamily: "'Fredoka One', cursive" }}
        >
          {display ?? value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-2 rounded-full appearance-none accent-yellow-400 cursor-pointer"
        style={{
          background: `linear-gradient(to right, #FFD93D ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.2) 0%)`,
        }}
      />
      <div className="flex justify-between text-[9px] text-white/30 font-bold">
        <span>{min}</span><span>{max}</span>
      </div>
    </label>
  );
}

// ══════════════════════════════════════════════════════════════
// LOBBY
// ══════════════════════════════════════════════════════════════
export function Lobby({ onCreateRoom, onJoinRoom, error, clearError, loading }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [tab,  setTab]  = useState('create');

  const handleCreate = () => { if (name.trim() && !loading) onCreateRoom(name.trim()); };
  const handleJoin   = () => { if (name.trim() && code.length === 4 && !loading) onJoinRoom(name.trim(), code); };
  const switchTab    = (t) => { setTab(t); if (t === 'join') setCode(''); if (clearError) clearError(); };

  return (
    <div
      className="relative flex flex-col items-center justify-center h-full w-full px-4 z-20"
      style={{ background: 'transparent' }}
    >
      {/* Background card */}
      <div className="bg-black/35 backdrop-blur-xl border border-white/20 rounded-3xl p-8 max-w-sm w-full shadow-[0_28px_64px_rgba(0,0,0,0.45)]">

        {/* Title */}
        <h1
          className="text-5xl text-center text-white mb-1 tracking-widest uppercase"
          style={{ fontFamily: "'Fredoka One', cursive" }}
        >
          LEAST SUM
        </h1>
        <p className="text-center text-white/40 text-xs font-black tracking-[0.2em] uppercase mb-8">
          Lowest hand wins
        </p>

        <ErrorBanner message={error} onDismiss={clearError} />

        <label className="block text-[10px] font-black text-white/50 uppercase tracking-widest mb-1.5">
          Your Name
        </label>
        <input
          type="text" value={name}
          onChange={e => setName(e.target.value.slice(0, 20))}
          className={CARD_CLS} placeholder="Type your name"
          autoComplete="off" style={AUTOFILL}
          onKeyDown={e => e.key === 'Enter' && (tab === 'create' ? handleCreate() : handleJoin())}
        />

        {/* Tabs */}
        <div className="flex gap-2 mt-6 mb-3">
          {['create','join'].map(t => (
            <button key={t} onClick={() => switchTab(t)}
              className={`flex-1 py-2.5 font-black text-xs uppercase tracking-widest rounded-xl transition-all ${
                tab === t
                  ? 'bg-yellow-400 text-black shadow-[0_4px_0_rgba(0,0,0,0.25)]'
                  : 'bg-white/10 text-white/50 border border-white/20 hover:bg-white/18'
              }`}>
              {t === 'create' ? 'Create' : 'Join'}
            </button>
          ))}
        </div>

        {/* Join code */}
        <AnimatePresence>
          {tab === 'join' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mb-3">
              <label className="block text-[10px] font-black text-white/50 uppercase tracking-widest mb-1.5">
                Room Code
              </label>
              <input
                type="text" value={code}
                onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
                className={`${CARD_CLS} lobby-code-input`}
                placeholder="Type room code" autoComplete="off" style={AUTOFILL}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action button */}
        <button
          disabled={loading || !name.trim() || (tab === 'join' && code.length !== 4)}
          onClick={tab === 'create' ? handleCreate : handleJoin}
          className={`w-full font-black uppercase tracking-widest py-4 rounded-2xl mb-3 text-sm transition-all ${
            loading || !name.trim() || (tab === 'join' && code.length !== 4)
              ? 'bg-white/10 text-white/25 cursor-not-allowed'
              : 'bg-yellow-400 text-black shadow-[0_5px_0_rgba(0,0,0,0.25),0_0_24px_rgba(255,217,61,0.4)] hover:brightness-105 active:scale-95'
          }`}
          style={{ fontFamily: "'Fredoka One', cursive", fontSize: 16 }}
        >
          {loading ? 'Loading…' : tab === 'create' ? 'Create Room' : 'Join Room'}
        </button>

        <p className="text-center text-white/20 text-[9px] font-bold uppercase tracking-widest">
          Least Sum · Card Game
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// WAITING ROOM
// ══════════════════════════════════════════════════════════════
export function WaitingRoom({ roomCode, isHost, gameState, myId, onUpdateConfig, onStartGame, onLeave }) {
  const [showConfig, setShowConfig] = useState(false);
  const cfg     = { ...CONFIG_DEFAULTS, ...(gameState?.config ?? {}) };
  const players = Object.entries(gameState?.players ?? {}).sort((a, b) => a[1].order - b[1].order);
  const hostPlayerId = gameState?.hostPlayerId ?? players[0]?.[0] ?? null;

  const upd = (key, val) => onUpdateConfig({ ...cfg, [key]: val });

  return (
    <div className="relative flex flex-col items-center justify-center h-full w-full px-4 z-20 overflow-y-auto py-6">
      <div className="bg-black/35 backdrop-blur-xl border border-white/20 rounded-3xl p-8 max-w-sm w-full shadow-[0_28px_64px_rgba(0,0,0,0.45)]">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl text-white mb-1 uppercase tracking-widest"
              style={{ fontFamily: "'Fredoka One', cursive" }}>
            Waiting Room
          </h1>
          <div className="inline-block bg-yellow-400/20 border border-yellow-400/50 text-yellow-400 font-black text-lg px-5 py-1.5 rounded-full tracking-[0.3em] mt-1"
               style={{ fontFamily: "'Fredoka One', cursive" }}>
            {roomCode}
          </div>
          <p className="text-white/35 text-[10px] font-bold tracking-widest uppercase mt-2">
            Share code with friends
          </p>
        </div>

        {/* Config toggle (host only) */}
        {isHost && (
          <button
            onClick={() => setShowConfig(v => !v)}
            className="w-full mb-4 px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl font-black text-xs uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/16 transition-all flex items-center justify-center gap-2"
          >
            ⚙ Game Settings
            <span className={`text-[9px] transition-transform duration-200 ${showConfig ? 'rotate-90' : ''}`}>▶</span>
          </button>
        )}

        {/* Config panel */}
        <AnimatePresence>
          {isHost && showConfig && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-5"
            >
              <div className="bg-white/8 border border-white/15 rounded-2xl p-4 space-y-5">

                <SliderRow label="Cards per Player" min={4} max={10} value={cfg.cardsPerPlayer}
                  onChange={v => upd('cardsPerPlayer', v)} />

                <SliderRow label="Max Players" min={2} max={8} value={cfg.maxPlayers}
                  onChange={v => upd('maxPlayers', v)} />

                <SliderRow label="Elimination Score" min={50} max={300} step={25} value={cfg.elimScore}
                  onChange={v => upd('elimScore', v)} display={`${cfg.elimScore} pts`} />

                <SliderRow label="Min Turns to Knock" min={0} max={5} value={cfg.minTurnsToKnock}
                  onChange={v => upd('minTurnsToKnock', v)}
                  display={cfg.minTurnsToKnock === 0 ? 'Any' : `${cfg.minTurnsToKnock}`} />

                <SliderRow label="Knocker Penalty" min={0} max={100} step={10} value={cfg.knockerPenalty}
                  onChange={v => upd('knockerPenalty', v)} display={`${cfg.knockerPenalty} pts`} />

                {/* Joker toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black text-white/55 uppercase tracking-widest block">
                      Joker Card (−1 pt)
                    </span>
                    <span className="text-[9px] text-white/30">One card in deck is worth −1</span>
                  </div>
                  <button
                    onClick={() => upd('useJoker', !cfg.useJoker)}
                    className={`relative w-12 h-6 rounded-full border-2 transition-all flex-shrink-0 ${
                      cfg.useJoker ? 'bg-yellow-400 border-yellow-400' : 'bg-white/15 border-white/25'
                    }`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                      cfg.useJoker ? 'left-6 bg-black' : 'left-0.5 bg-white/60'
                    }`} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player list */}
        <div className="flex flex-col gap-2.5 mb-5">
          {players.map(([id, p]) => (
            <div key={id}
              className="flex items-center gap-3 bg-white/8 border border-white/15 rounded-xl p-3"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white border-2 border-white/35 flex-shrink-0"
                style={{ backgroundColor: avatarColor(p.name) }}
              >
                {p.name[0].toUpperCase()}
              </div>
              <span className="font-bold text-white flex-1 text-sm truncate">{p.name}</span>
              <div className="flex gap-1.5">
                {id === myId && (
                  <span className="text-[9px] bg-sky-500 px-2 py-0.5 rounded-full font-black text-white uppercase">You</span>
                )}
                {id === hostPlayerId && (
                  <span className="text-[9px] bg-yellow-400 px-2 py-0.5 rounded-full font-black text-black uppercase">Host</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Start / Waiting */}
        {isHost ? (
          <button
            onClick={onStartGame}
            disabled={players.length < 2}
            className={`w-full font-black uppercase tracking-widest py-4 rounded-2xl mb-3 text-sm transition-all ${
              players.length >= 2
                ? 'bg-emerald-500 text-white shadow-[0_5px_0_rgba(0,0,0,0.25),0_0_24px_rgba(52,211,153,0.4)] hover:brightness-105 active:scale-95'
                : 'bg-white/10 text-white/25 cursor-not-allowed'
            }`}
            style={{ fontFamily: "'Fredoka One', cursive", fontSize: 16 }}
          >
            Start Game · {players.length} {players.length === 1 ? 'player' : 'players'}
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 py-3 mb-3">
            {[0, 150, 300].map(d => (
              <div key={d} className="w-2 h-2 bg-yellow-400/60 rounded-full animate-bounce"
                   style={{ animationDelay: `${d}ms` }} />
            ))}
            <span className="text-white/40 font-bold text-xs uppercase tracking-widest ml-1">
              Waiting for host
            </span>
          </div>
        )}

        <button
          onClick={onLeave}
          className="w-full text-center text-white/25 text-xs font-bold uppercase tracking-widest hover:text-white/50 transition-colors py-1"
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}

// import { useState } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import { avatarColor } from '../../utils/gameUtils';

// const INPUT_CLS =
//   'w-full rounded-xl px-4 py-3 font-bold outline-none transition-all ' +
//   'bg-[#1c1c1c] text-white placeholder:text-white/25 ' +
//   'border border-white/20 focus:border-yellow-400 focus:bg-[#222]';

// const AUTOFILL_STYLE = {
//   WebkitBoxShadow: '0 0 0 1000px #1c1c1c inset',
//   WebkitTextFillColor: '#ffffff',
// };

// // BUG FIX #4: safe defaults so config[key] never lands as undefined on a controlled input
// const CONFIG_DEFAULTS = {
//   cardsPerPlayer: 6,
//   maxPlayers: 4,
//   elimScore: 200,
//   minTurnsToKnock: 1,
//   knockerPenalty: 0,
//   useJoker: false, // LATEST FEATURE: Default Joker state
// };

// // ── Reusable error banner ──────────────────────────────────────
// function ErrorBanner({ message, onDismiss }) {
//   if (!message) return null;
//   return (
//     <AnimatePresence>
//       <motion.div
//         key="error"
//         initial={{ opacity: 0, y: -8 }}
//         animate={{ opacity: 1, y: 0 }}
//         exit={{ opacity: 0, y: -8 }}
//         className="flex items-center gap-3 bg-red-500/15 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 mb-4 text-sm font-bold"
//       >
//         <span className="flex-1">{message}</span>
//         <button onClick={onDismiss} className="text-red-300/60 hover:text-red-300 text-lg leading-none">✕</button>
//       </motion.div>
//     </AnimatePresence>
//   );
// }

// // ── Lobby ──────────────────────────────────────────────────────
// export function Lobby({ onCreateRoom, onJoinRoom, error, clearError, loading }) {
//   const [name, setName] = useState('');
//   const [code, setCode] = useState('');
//   const [tab, setTab]   = useState('create');

//   const handleCreate = () => {
//     if (name.trim() && !loading) onCreateRoom(name.trim());
//   };
//   const handleJoin = () => {
//     if (name.trim() && code.length === 4 && !loading) onJoinRoom(name.trim(), code);
//   };

//   const handleTabSwitch = (t) => {
//     setTab(t);
//     if (t === 'join') setCode('');
//     if (clearError) clearError();
//   };

//   return (
//     <div className="relative flex flex-col items-center justify-center h-full w-full px-4 z-20">
//       <div className="bg-[#111] border border-white/15 rounded-3xl p-8 max-w-sm w-full shadow-[0_24px_60px_rgba(0,0,0,0.75)]">

//         <h1 className="font-black text-5xl text-center text-white mb-1 tracking-widest uppercase">
//           LEAST SUM
//         </h1>
//         <p className="text-center text-white/35 text-xs font-bold tracking-widest uppercase mb-8">
//           Lowest hand wins
//         </p>

//         <ErrorBanner message={error} onDismiss={clearError} />

//         <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">
//           Your Name
//         </label>
//         <input
//           type="text"
//           value={name}
//           onChange={e => setName(e.target.value.slice(0, 20))}
//           className={INPUT_CLS}
//           placeholder="Enter callsign"
//           autoComplete="off"
//           style={AUTOFILL_STYLE}
//           onKeyDown={e => e.key === 'Enter' && (tab === 'create' ? handleCreate() : handleJoin())}
//         />

//         <div className="flex gap-2 mt-6 mb-3">
//           <button onClick={() => handleTabSwitch('create')} className={`flex-1 py-2.5 font-black text-xs uppercase tracking-widest transition-all ${tab === 'create' ? 'bg-white text-black' : 'bg-black/30 text-white/50 border border-white/20'}`}>
//             Create
//           </button>
//           <button onClick={() => handleTabSwitch('join')} className={`flex-1 py-2.5 font-black text-xs uppercase tracking-widest transition-all ${tab === 'join' ? 'bg-white text-black' : 'bg-black/30 text-white/50 border border-white/20'}`}>
//             Join
//           </button>
//         </div>

//         {tab === 'join' && (
//           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-3">
//             <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-1.5">
//               Room Code
//             </label>
//             <input
//               type="text"
//               value={code}
//               onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
//               className={INPUT_CLS}
//               placeholder="ABCD"
//               autoComplete="off"
//               style={AUTOFILL_STYLE}
//               onKeyDown={e => e.key === 'Enter' && handleJoin()}
//             />
//           </motion.div>
//         )}

//         <button
//           disabled={loading || !name.trim() || (tab === 'join' && code.length !== 4)}
//           onClick={tab === 'create' ? handleCreate : handleJoin}
//           className={
//             'w-full font-black uppercase tracking-widest py-4 rounded-xl mb-3 border-2 text-sm transition-all ' +
//             (loading || !name.trim() || (tab === 'join' && code.length !== 4)
//               ? 'bg-white/8 text-white/25 border-white/8 cursor-not-allowed'
//               : 'bg-yellow-400 text-black border-white/30 shadow-[0_4px_24px_rgba(234,179,8,0.4)] hover:scale-[1.01] active:scale-95')
//           }
//         >
//           {loading ? 'Loading...' : tab === 'create' ? 'Create Room' : 'Join Room'}
//         </button>

//         <div className="text-center text-white/20 text-[9px] font-bold uppercase tracking-widest">
//           Powered by xAI
//         </div>
//       </div>
//     </div>
//   );
// }

// // ── Waiting Room ───────────────────────────────────────────────
// export function WaitingRoom({ roomCode, isHost, gameState, myId, onUpdateConfig, onStartGame, onLeave }) {
//   const [showConfig, setShowConfig] = useState(false);
//   const config = gameState?.config ?? CONFIG_DEFAULTS;
//   const players = Object.entries(gameState?.players ?? {}).sort((a, b) => a[1].order - b[1].order);

//   return (
//     <div className="relative flex flex-col items-center justify-center h-full w-full px-4 z-20">
//       <div className="bg-[#111] border border-white/15 rounded-3xl p-8 max-w-sm w-full shadow-[0_24px_60px_rgba(0,0,0,0.75)]">

//         <div className="text-center mb-8">
//           <h1 className="font-black text-4xl text-white mb-1 tracking-widest uppercase">Waiting Room</h1>
//           <p className="text-white/35 text-xs font-bold tracking-widest uppercase mb-2">Code: {roomCode}</p>
//           <p className="text-white/35 text-[10px] font-bold tracking-widest uppercase">Share with operatives</p>
//         </div>

//         {isHost && (
//           <button
//             onClick={() => setShowConfig(!showConfig)}
//             className="w-full mb-5 px-4 py-2.5 bg-black/30 border border-white/20 font-black text-xs uppercase tracking-widest text-white/80 hover:text-white transition-colors flex items-center justify-center gap-2"
//           >
//             Game Config
//             <span className={`text-[9px] ${showConfig ? 'rotate-90' : ''} transition-transform`}>▶</span>
//           </button>
//         )}

//         {isHost && showConfig && (
//           <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden mb-6">
//             <div className="space-y-4">
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Cards per Player</span>
//                 <input type="range" min="4" max="10" value={config.cardsPerPlayer} onChange={e => onUpdateConfig({ ...config, cardsPerPlayer: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Max Players</span>
//                 <input type="range" min="2" max="8" value={config.maxPlayers} onChange={e => onUpdateConfig({ ...config, maxPlayers: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Elimination Score</span>
//                 <input type="range" min="50" max="300" step="50" value={config.elimScore} onChange={e => onUpdateConfig({ ...config, elimScore: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Min Turns to Knock</span>
//                 <input type="range" min="0" max="3" value={config.minTurnsToKnock} onChange={e => onUpdateConfig({ ...config, minTurnsToKnock: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Knocker Penalty</span>
//                 <input type="range" min="0" max="100" step="10" value={config.knockerPenalty} onChange={e => onUpdateConfig({ ...config, knockerPenalty: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex items-center gap-3">
//                 <span className="text-[9px] font-black text-white/40 uppercase tracking-widest flex-1">Use Joker (-1 pt)</span>
//                 <input type="checkbox" checked={config.useJoker} onChange={e => onUpdateConfig({ ...config, useJoker: e.target.checked })} className="w-5 h-5 accent-yellow-400" />
//               </label>
//             </div>
//           </motion.div>
//         )}

//         <div className="flex flex-col gap-2.5 mb-6">
//           {players.map(([id, p], i) => (
//             <div
//               key={id}
//               className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-3"
//             >
//               <div
//                 className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white border-2 border-white/35 flex-shrink-0"
//                 style={{ backgroundColor: avatarColor(p.name) }}
//               >
//                 {p.name[0].toUpperCase()}
//               </div>
//               <span className="font-bold text-white flex-1 text-sm">{p.name}</span>
//               <div className="flex gap-1.5">
//                 {id === myId && (
//                   <span className="text-[9px] bg-sky-500 px-2 py-0.5 rounded font-black text-white uppercase">
//                     You
//                   </span>
//                 )}
//                 {i === 0 && (
//                   <span className="text-[9px] bg-yellow-400 px-2 py-0.5 rounded font-black text-black uppercase">
//                     Host
//                   </span>
//                 )}
//               </div>
//             </div>
//           ))}
//         </div>

//         {isHost ? (
//           <button
//             onClick={onStartGame}
//             disabled={players.length < 2}
//             className={
//               'w-full font-black uppercase tracking-widest py-4 rounded-xl mb-3 border-2 text-sm transition-all ' +
//               (players.length >= 2
//                 ? 'bg-green-500 text-white border-white/30 shadow-[0_4px_24px_rgba(34,197,94,0.4)] hover:scale-[1.01] active:scale-95'
//                 : 'bg-white/8 text-white/25 border-white/8 cursor-not-allowed')
//             }
//           >
//             Start Game ({players.length} players)
//           </button>
//         ) : (
//           <div className="flex items-center justify-center gap-2 py-3 mb-3">
//             {[0, 150, 300].map(d => (
//               <div
//                 key={d}
//                 className="w-1.5 h-1.5 bg-white/35 rounded-full animate-bounce"
//                 style={{ animationDelay: `${d}ms` }}
//               />
//             ))}
//             <span className="text-white/35 font-bold text-xs uppercase tracking-widest ml-1">
//               Waiting for host
//             </span>
//           </div>
//         )}

//         <button
//           onClick={onLeave}
//           className="w-full text-center text-white/25 text-xs font-bold uppercase tracking-widest hover:text-white/55 transition-colors py-1"
//         >
//           Leave Room
//         </button>
//       </div>
//     </div>
//   );
// }

// // Appended new code for heavenly UI enhancements
// // Enhanced ErrorBanner with smooth animations
// function EnhancedErrorBanner({ message, onDismiss }) {
//   if (!message) return null;
//   return (
//     <AnimatePresence>
//       <motion.div
//         key="error"
//         initial={{ opacity: 0, y: -8 }}
//         animate={{ opacity: 1, y: 0 }}
//         exit={{ opacity: 0, y: -8 }}
//         className="flex items-center gap-3 bg-red-500/20 border border-red-500/50 text-red-300 rounded-xl px-4 py-3 mb-4 text-sm font-bold shadow-lg"
//       >
//         <span className="flex-1">{message}</span>
//         <button onClick={onDismiss} className="text-red-300/60 hover:text-red-300 text-lg leading-none">✕</button>
//       </motion.div>
//     </AnimatePresence>
//   );
// }

// // Enhanced Lobby with vibrant colors and gold accents
// export function EnhancedLobby({ onCreateRoom, onJoinRoom, error, clearError, loading }) {
//   const [name, setName] = useState('');
//   const [code, setCode] = useState('');
//   const [tab, setTab]   = useState('create');

//   const handleCreate = () => {
//     if (name.trim() && !loading) onCreateRoom(name.trim());
//   };
//   const handleJoin = () => {
//     if (name.trim() && code.length === 4 && !loading) onJoinRoom(name.trim(), code);
//   };

//   const handleTabSwitch = (t) => {
//     setTab(t);
//     if (t === 'join') setCode('');
//     if (clearError) clearError();
//   };

//   return (
//     <div className="relative flex flex-col items-center justify-center h-full w-full px-4 z-20">
//       <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-yellow-500/30 rounded-3xl p-8 max-w-sm w-full shadow-[0_24px_60px_rgba(0,0,0,0.75)] gold-glow">

//         <h1 className="font-black text-5xl text-center text-yellow-400 mb-1 tracking-widest uppercase">
//           LEAST SUM
//         </h1>
//         <p className="text-center text-yellow-400/50 text-xs font-bold tracking-widest uppercase mb-8">
//           Lowest hand wins
//         </p>

//         <EnhancedErrorBanner message={error} onDismiss={clearError} />

//         <label className="block text-[10px] font-black text-yellow-400/60 uppercase tracking-widest mb-1.5">
//           Your Name
//         </label>
//         <input
//           type="text"
//           value={name}
//           onChange={e => setName(e.target.value.slice(0, 20))}
//           className={INPUT_CLS.replace('border-white/20', 'border-yellow-500/30 focus:border-yellow-400')}
//           placeholder="Enter callsign"
//           autoComplete="off"
//           style={AUTOFILL_STYLE}
//           onKeyDown={e => e.key === 'Enter' && (tab === 'create' ? handleCreate() : handleJoin())}
//         />

//         <div className="flex gap-2 mt-6 mb-3">
//           <button onClick={() => handleTabSwitch('create')} className={`flex-1 py-2.5 font-black text-xs uppercase tracking-widest transition-all ${tab === 'create' ? 'bg-yellow-400 text-black' : 'bg-black/30 text-yellow-400/50 border border-yellow-500/30'}`}>
//             Create
//           </button>
//           <button onClick={() => handleTabSwitch('join')} className={`flex-1 py-2.5 font-black text-xs uppercase tracking-widest transition-all ${tab === 'join' ? 'bg-yellow-400 text-black' : 'bg-black/30 text-yellow-400/50 border border-yellow-500/30'}`}>
//             Join
//           </button>
//         </div>

//         {tab === 'join' && (
//           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-3">
//             <label className="block text-[10px] font-black text-yellow-400/60 uppercase tracking-widest mb-1.5">
//               Room Code
//             </label>
//             <input
//               type="text"
//               value={code}
//               onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
//               className={INPUT_CLS.replace('border-white/20', 'border-yellow-500/30 focus:border-yellow-400')}
//               placeholder="ABCD"
//               autoComplete="off"
//               style={AUTOFILL_STYLE}
//               onKeyDown={e => e.key === 'Enter' && handleJoin()}
//             />
//           </motion.div>
//         )}

//         <button
//           disabled={loading || !name.trim() || (tab === 'join' && code.length !== 4)}
//           onClick={tab === 'create' ? handleCreate : handleJoin}
//           className={
//             'w-full font-black uppercase tracking-widest py-4 rounded-xl mb-3 border-2 text-sm transition-all ' +
//             (loading || !name.trim() || (tab === 'join' && code.length !== 4)
//               ? 'bg-yellow-400/10 text-yellow-400/25 border-yellow-500/10 cursor-not-allowed'
//               : 'bg-yellow-400 text-black border-yellow-500/30 gold-glow hover:scale-[1.01] active:scale-95')
//           }
//         >
//           {loading ? 'Loading...' : tab === 'create' ? 'Create Room' : 'Join Room'}
//         </button>

//         <div className="text-center text-yellow-400/30 text-[9px] font-bold uppercase tracking-widest">
//           Powered by xAI
//         </div>
//       </div>
//     </div>
//   );
// }

// // Enhanced Waiting Room with polished elements
// export function EnhancedWaitingRoom({ roomCode, isHost, gameState, myId, onUpdateConfig, onStartGame, onLeave }) {
//   const [showConfig, setShowConfig] = useState(false);
//   const config = gameState?.config ?? CONFIG_DEFAULTS;
//   const players = Object.entries(gameState?.players ?? {}).sort((a, b) => a[1].order - b[1].order);

//   return (
//     <div className="relative flex flex-col items-center justify-center h-full w-full px-4 z-20">
//       <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-yellow-500/30 rounded-3xl p-8 max-w-sm w-full shadow-[0_24px_60px_rgba(0,0,0,0.75)] gold-glow">

//         <div className="text-center mb-8">
//           <h1 className="font-black text-4xl text-yellow-400 mb-1 tracking-widest uppercase">Waiting Room</h1>
//           <p className="text-yellow-400/50 text-xs font-bold tracking-widest uppercase mb-2">Code: {roomCode}</p>
//           <p className="text-yellow-400/50 text-[10px] font-bold tracking-widest uppercase">Share with operatives</p>
//         </div>

//         {isHost && (
//           <button
//             onClick={() => setShowConfig(!showConfig)}
//             className="w-full mb-5 px-4 py-2.5 bg-black/30 border border-yellow-500/30 font-black text-xs uppercase tracking-widest text-yellow-400/80 hover:text-yellow-400 transition-colors flex items-center justify-center gap-2"
//           >
//             Game Config
//             <span className={`text-[9px] ${showConfig ? 'rotate-90' : ''} transition-transform`}>▶</span>
//           </button>
//         )}

//         {isHost && showConfig && (
//           <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden mb-6">
//             <div className="space-y-4">
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-yellow-400/60 uppercase tracking-widest">Cards per Player</span>
//                 <input type="range" min="4" max="10" value={config.cardsPerPlayer} onChange={e => onUpdateConfig({ ...config, cardsPerPlayer: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-yellow-400/60 uppercase tracking-widest">Max Players</span>
//                 <input type="range" min="2" max="8" value={config.maxPlayers} onChange={e => onUpdateConfig({ ...config, maxPlayers: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-yellow-400/60 uppercase tracking-widest">Elimination Score</span>
//                 <input type="range" min="50" max="300" step="50" value={config.elimScore} onChange={e => onUpdateConfig({ ...config, elimScore: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-yellow-400/60 uppercase tracking-widest">Min Turns to Knock</span>
//                 <input type="range" min="0" max="3" value={config.minTurnsToKnock} onChange={e => onUpdateConfig({ ...config, minTurnsToKnock: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex flex-col gap-1">
//                 <span className="text-[9px] font-black text-yellow-400/60 uppercase tracking-widest">Knocker Penalty</span>
//                 <input type="range" min="0" max="100" step="10" value={config.knockerPenalty} onChange={e => onUpdateConfig({ ...config, knockerPenalty: parseInt(e.target.value) })} className="w-full accent-yellow-400" />
//               </label>
//               <label className="flex items-center gap-3">
//                 <span className="text-[9px] font-black text-yellow-400/60 uppercase tracking-widest flex-1">Use Joker (-1 pt)</span>
//                 <input type="checkbox" checked={config.useJoker} onChange={e => onUpdateConfig({ ...config, useJoker: e.target.checked })} className="w-5 h-5 accent-yellow-400" />
//               </label>
//             </div>
//           </motion.div>
//         )}

//         <div className="flex flex-col gap-2.5 mb-6">
//           {players.map(([id, p], i) => (
//             <div
//               key={id}
//               className="flex items-center gap-3 bg-yellow-400/5 border border-yellow-500/20 rounded-xl p-3"
//             >
//               <div
//                 className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white border-2 border-yellow-500/50 flex-shrink-0 gold-glow"
//                 style={{ backgroundColor: avatarColor(p.name) }}
//               >
//                 {p.name[0].toUpperCase()}
//               </div>
//               <span className="font-bold text-white flex-1 text-sm">{p.name}</span>
//               <div className="flex gap-1.5">
//                 {id === myId && (
//                   <span className="text-[9px] bg-sky-500 px-2 py-0.5 rounded font-black text-white uppercase">
//                     You
//                   </span>
//                 )}
//                 {i === 0 && (
//                   <span className="text-[9px] bg-yellow-400 px-2 py-0.5 rounded font-black text-black uppercase">
//                     Host
//                   </span>
//                 )}
//               </div>
//             </div>
//           ))}
//         </div>

//         {isHost ? (
//           <button
//             onClick={onStartGame}
//             disabled={players.length < 2}
//             className={
//               'w-full font-black uppercase tracking-widest py-4 rounded-xl mb-3 border-2 text-sm transition-all ' +
//               (players.length >= 2
//                 ? 'bg-green-500 text-white border-yellow-500/30 gold-glow hover:scale-[1.01] active:scale-95'
//                 : 'bg-yellow-400/10 text-yellow-400/25 border-yellow-500/10 cursor-not-allowed')
//             }
//           >
//             Start Game ({players.length} players)
//           </button>
//         ) : (
//           <div className="flex items-center justify-center gap-2 py-3 mb-3">
//             {[0, 150, 300].map(d => (
//               <div
//                 key={d}
//                 className="w-1.5 h-1.5 bg-yellow-400/50 rounded-full animate-bounce"
//                 style={{ animationDelay: `${d}ms` }}
//               />
//             ))}
//             <span className="text-yellow-400/50 font-bold text-xs uppercase tracking-widest ml-1">
//               Waiting for host
//             </span>
//           </div>
//         )}

//         <button
//           onClick={onLeave}
//           className="w-full text-center text-yellow-400/30 text-xs font-bold uppercase tracking-widest hover:text-yellow-400/60 transition-colors py-1"
//         >
//           Leave Room
//         </button>
//       </div>
//     </div>
//   );
// }
