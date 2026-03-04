import { motion, AnimatePresence } from 'framer-motion';
import { getSuitStyle, isJokerMatch } from '../../utils/gameUtils';

// ── Mini Card for Hand Display ──────────────────────────
function MiniResultCard({ rank, suit, isJoker }) {
  const s = getSuitStyle(suit);
  return (
    <div className={`relative w-9 h-12 rounded-lg border-2 border-white/40 flex flex-col items-center justify-center ${s.bg} ${s.text} shadow-lg flex-shrink-0`}>
      <span className="font-black text-[10px] leading-none">{rank}</span>
      <span className="text-xl leading-none select-none">{suit}</span>
      {/* LATEST FEATURE: Joker badge */}
      {isJoker && (
        <div className="absolute -top-1.5 -right-1.5 bg-uno-yellow text-black text-[7px] font-black px-1 rounded-sm border border-black z-10 shadow-glow-yellow">
          J
        </div>
      )}
    </div>
  );
}

export default function ResultsOverlay({ gameState, myId, actions }) {
  const isGameOver = gameState.status === 'gameover';
  const players = gameState.players || {};
  const rr = gameState.roundResults || {};
  const cfg = gameState.config || {};
  const joker = gameState.jokerCard;

  // Sorting players by their new total score
  const allPlayers = Object.entries(players).sort((a, b) => a[1].score - b[1].score);
  const knockerName = players[gameState.knocker]?.name;

  return (
    <div className="absolute inset-0 bg-uno-dark/95 backdrop-blur-xl z-[100] flex items-center justify-center p-6 overflow-hidden">
      {/* Background Glows for ambiance */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-uno-blue rounded-full blur-[120px]" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-uno-red rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-black/40 border border-white/10 rounded-[40px] p-8 max-w-lg w-full shadow-solid max-h-[90dvh] flex flex-col"
      >
        {/* Subtle Status Pill */}
        <div className="flex justify-center mb-6">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] shadow-sm ${
            gameState.knockerFailed ? 'bg-uno-red/20 border-uno-red/50 text-uno-red shadow-glow-red' : 'bg-uno-green/20 border-uno-green/50 text-uno-green shadow-glow-blue'
          }`}>
            {isGameOver ? '🏆 Final Results' : `Round ${gameState.round} Complete`}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-8 custom-scrollbar">
          {allPlayers.map(([id, p], i) => {
            const result = rr[id];
            // Identify the player with the lowest hand sum in the round
            const allSums = Object.values(rr).map(r => r.sum);
            const minSum = Math.min(...allSums);
            const isLowest = result?.sum === minSum;
            const isMe = id === myId;

            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`relative p-4 rounded-2xl border flex flex-col gap-3 transition-all ${
                  isLowest ? 'bg-uno-green/20 border-uno-green/40 shadow-glow-green' :
                  isMe ? 'bg-uno-blue/20 border-uno-blue/40 shadow-glow-blue' : 'bg-black/30 border-white/10'
                }`}
              >
                {/* Player Identity Row */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col">
                    <span className="font-black text-white text-lg flex items-center gap-2">
                      {p.name}
                      {id === myId && <span className="text-uno-yellow text-sm">★</span>}
                      {id === gameState.knocker && <span className="text-[8px] bg-uno-yellow text-black px-1.5 py-0.5 rounded-md">KNOCK</span>}
                    </span>
                    <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">
                      Hand Sum: <span className={isLowest ? 'text-uno-green' : 'text-white/60'}>{result?.sum || 0}</span>
                    </span>
                  </div>
                  
                  {/* Score Delta & Total */}
                  <div className="flex flex-col items-end">
                    <div className={`text-xs font-black ${result?.addedScore > 0 ? 'text-uno-red' : 'text-uno-green'}`}>
                      +{result?.addedScore || 0} pts
                    </div>
                    <div className="text-2xl font-black text-white">
                      {result?.newScore || p.score}
                    </div>
                  </div>
                </div>

                {/* Hand Display */}
                <div className="flex gap-2 flex-wrap">
                  {result?.cards?.map((c, idx) => (
                    <MiniResultCard 
                      key={idx} 
                      rank={c.rank} 
                      suit={c.suit} 
                      isJoker={isJokerMatch(c, joker)} 
                    />
                  ))}
                </div>

                {/* Penalty Indicator */}
                {result?.penaltyApplied && (
                  <div className="absolute top-3 right-12 bg-uno-red text-[7px] font-black px-1.5 py-0.5 rounded-sm rotate-12">
                    PENALTY
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Action Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={isGameOver ? actions.playAgain : actions.nextRound}
          className="w-full bg-uno-yellow text-black font-black uppercase tracking-widest py-5 rounded-3xl shadow-glow-yellow text-sm border-t border-white/30"
        >
          {isGameOver ? 'Start New Match' : 'Begin Next Round →'}
        </motion.button>
      </motion.div>
    </div>
  );
}

// Appended new code for heavenly UI enhancements
// Enhanced MiniResultCard with polished styles
function EnhancedMiniResultCard({ rank, suit, isJoker }) {
  const s = getSuitStyle(suit);
  return (
    <div className={`relative w-10 h-14 rounded-lg border-2 border-yellow-300 flex flex-col items-center justify-center ${s.bg} ${s.text} shadow-[0_4px_12px_rgba(0,0,0,0.3)] flex-shrink-0`}>
      <span className="font-black text-[11px] leading-none">{rank}</span>
      <span className="text-2xl leading-none select-none">{suit}</span>
      {isJoker && (
        <div className="absolute -top-2 -right-2 bg-yellow-400 text-black text-[8px] font-black px-1.5 rounded-sm border border-black z-10 gold-glow">
          J
        </div>
      )}
    </div>
  );
}

// Enhanced ResultsOverlay with vibrant backgrounds and gold glows
export function EnhancedResultsOverlay({ gameState, myId, actions }) {
  const isGameOver = gameState.status === 'gameover';
  const players = gameState.players || {};
  const rr = gameState.roundResults || {};
  const cfg = gameState.config || {};
  const joker = gameState.jokerCard;

  const allPlayers = Object.entries(players).sort((a, b) => a[1].score - b[1].score);
  const knockerName = players[gameState.knocker]?.name;

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-blue-900/95 to-green-900/95 backdrop-blur-xl z-[100] flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-30">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-yellow-400 rounded-full blur-[120px]" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-yellow-400 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-yellow-500/50 rounded-[40px] p-8 max-w-lg w-full gold-glow max-h-[90dvh] flex flex-col"
      >
        <div className="flex justify-center mb-6">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] shadow-sm ${
            gameState.knockerFailed ? 'bg-red-500/20 border-red-500/50 text-red-300 gold-glow' : 'bg-green-500/20 border-green-500/50 text-green-300 gold-glow'
          }`}>
            {isGameOver ? '🏆 Final Results' : `Round ${gameState.round} Complete`}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-8 custom-scrollbar">
          {allPlayers.map(([id, p], i) => {
            const result = rr[id];
            const allSums = Object.values(rr).map(r => r.sum);
            const minSum = Math.min(...allSums);
            const isLowest = result?.sum === minSum;
            const isMe = id === myId;

            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`relative p-4 rounded-2xl border flex flex-col gap-3 transition-all ${
                  isLowest ? 'bg-green-500/20 border-green-500/40 gold-glow' :
                  isMe ? 'bg-blue-500/20 border-blue-500/40 gold-glow' : 'bg-black/30 border-yellow-500/20'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col">
                    <span className="font-black text-white text-lg flex items-center gap-2">
                      {p.name}
                      {id === myId && <span className="text-yellow-400 text-sm">★</span>}
                      {id === gameState.knocker && <span className="text-[8px] bg-yellow-400 text-black px-1.5 py-0.5 rounded-md">KNOCK</span>}
                    </span>
                    <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider">
                      Hand Sum: <span className={isLowest ? 'text-green-400' : 'text-white'}>{result?.sum || 0}</span>
                    </span>
                  </div>
                  
                  <div className="flex flex-col items-end">
                    <div className={`text-xs font-black ${result?.addedScore > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      +{result?.addedScore || 0} pts
                    </div>
                    <div className="text-2xl font-black text-white">
                      {result?.newScore || p.score}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {result?.cards?.map((c, idx) => (
                    <EnhancedMiniResultCard 
                      key={idx} 
                      rank={c.rank} 
                      suit={c.suit} 
                      isJoker={isJokerMatch(c, joker)} 
                    />
                  ))}
                </div>

                {result?.penaltyApplied && (
                  <div className="absolute top-3 right-12 bg-red-500 text-[7px] font-black px-1.5 py-0.5 rounded-sm rotate-12 text-white">
                    PENALTY
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={isGameOver ? actions.playAgain : actions.nextRound}
          className="w-full bg-yellow-400 text-black font-black uppercase tracking-widest py-5 rounded-3xl gold-glow text-sm border-t border-yellow-500/50"
        >
          {isGameOver ? 'Start New Match' : 'Begin Next Round →'}
        </motion.button>
      </motion.div>
    </div>
  );
}
