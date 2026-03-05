import { motion } from 'framer-motion';
import { getSuitStyle, isJokerMatch } from '../../utils/gameUtils';

function MiniResultCard({ card, jokerCard }) {
  const s = getSuitStyle(card?.suit);
  const isJoker = isJokerMatch(card, jokerCard);
  return (
    <div className={`relative w-8 h-11 rounded-md border border-white/40 flex flex-col items-center justify-center ${s.bg} ${s.text} shadow-lg flex-shrink-0`}>
      <span className="font-black text-[9px] leading-none">{card?.rank}</span>
      <span className="text-sm leading-none select-none">{card?.suit}</span>
      {isJoker && (
        <div className="absolute -top-1 -right-1 bg-yellow-300 text-black text-[7px] font-black px-1 rounded-sm border border-black">
          J
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry, players }) {
  const playerIds = Object.keys(entry?.results || {});
  return (
    <div className="bg-black/25 border border-white/10 rounded-xl px-3 py-2">
      <div className="text-[10px] text-white/60 font-black uppercase tracking-wider mb-2">
        Round {entry?.round}
      </div>
      <div className="space-y-1">
        {playerIds.map((playerId) => {
          const row = entry.results[playerId] || {};
          return (
            <div key={`${entry.round}-${playerId}`} className="flex items-center justify-between text-[11px]">
              <span className="text-white/80 font-bold">{players[playerId]?.name || 'Player'}</span>
              <span className="text-white/70">{row.prevScore ?? 0} -&gt; {row.newScore ?? 0}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ResultsOverlay({ gameState, myId, actions }) {
  const isGameOver = gameState.status === 'gameover';
  const isBluffMode = String(gameState?.config?.gameMode || 'leastsum').toLowerCase() === 'bluff';
  const players = gameState.players || {};
  const roundResults = gameState.roundResults || {};
  const roundReveal = gameState.roundReveal || null;
  const roundHistory = Array.isArray(gameState.roundHistory) ? gameState.roundHistory : [];
  const jokerCard = gameState.jokerCard || null;

  const allPlayers = Object.entries(players).sort((a, b) => (a[1]?.score || 0) - (b[1]?.score || 0));
  const allSums = Object.values(roundResults).map((r) => Number(r?.sum || 0));
  const minSum = allSums.length ? Math.min(...allSums) : null;
  const previousHistory = [...roundHistory].slice(0, -1).reverse();

  if (isBluffMode) {
    const finishOrder = Array.isArray(gameState?.bluffFinishOrder) ? gameState.bluffFinishOrder : [];
    const rankedIds = [...finishOrder];
    Object.keys(players).forEach((playerId) => {
      if (!rankedIds.includes(playerId)) rankedIds.push(playerId);
    });

    return (
      <div className="absolute inset-0 bg-uno-dark/95 backdrop-blur-xl z-[100] flex items-center justify-center p-6 overflow-hidden">
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative bg-black/40 border border-white/10 rounded-[32px] p-6 max-w-xl w-full shadow-solid max-h-[90dvh] flex flex-col"
        >
          <div className="flex justify-center mb-5">
            <div className="px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] bg-uno-green/20 border-uno-green/50 text-uno-green">
              Bluff Final Order
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3 mb-6 custom-scrollbar">
            {rankedIds.map((playerId, idx) => {
              const player = players[playerId] || {};
              const handCount = Number(gameState?.handCounts?.[playerId] ?? gameState?.hands?.[playerId]?.length ?? 0);
              return (
                <div key={`bluff-rank-${playerId}`} className="relative p-3 rounded-2xl border bg-black/25 border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="font-black text-white text-sm">
                      #{idx + 1} {player?.name || 'Player'} {playerId === myId ? <span className="text-yellow-300">*</span> : null}
                    </div>
                    <div className="text-[11px] text-white/70 uppercase tracking-wider font-black">
                      Cards left: {handCount}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={actions.playAgain}
            className="w-full bg-uno-yellow text-black font-black uppercase tracking-widest py-4 rounded-2xl text-sm border-t border-white/30"
          >
            Start New Match
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-uno-dark/95 backdrop-blur-xl z-[100] flex items-center justify-center p-6 overflow-hidden">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-black/40 border border-white/10 rounded-[32px] p-6 max-w-xl w-full shadow-solid max-h-[90dvh] flex flex-col"
      >
        <div className="flex justify-center mb-5">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] ${
            gameState.knockerFailed ? 'bg-uno-red/20 border-uno-red/50 text-uno-red' : 'bg-uno-green/20 border-uno-green/50 text-uno-green'
          }`}>
            {isGameOver ? 'Final Results' : `Round ${gameState.round} Complete`}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-3 mb-6 custom-scrollbar">
          {allPlayers.map(([id, player]) => {
            const result = roundResults[id] || {};
            const revealCards = roundReveal?.handsByPlayer?.[id];
            const isLowest = minSum != null && Number(result?.sum ?? 0) === minSum;
            return (
              <div
                key={id}
                className={`relative p-3 rounded-2xl border ${
                  isLowest ? 'bg-emerald-500/20 border-emerald-400/40' : 'bg-black/25 border-white/10'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-black text-white text-sm flex items-center gap-2">
                      {player?.name}
                      {id === myId && <span className="text-yellow-300">*</span>}
                      {id === gameState.knocker && <span className="text-[8px] bg-yellow-300 text-black px-1.5 py-0.5 rounded-sm">KNOCK</span>}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-white/65">
                      Sum {result?.sum ?? 0} · Added {result?.addedScore ?? 0}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-white/45 uppercase tracking-wider">Total</div>
                    <div className="text-xl font-black text-white">{result?.newScore ?? player?.score ?? 0}</div>
                  </div>
                </div>

                <div className="mt-2">
                  {Array.isArray(revealCards) ? (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {revealCards.map((card, idx) => (
                        <MiniResultCard key={`${id}-${idx}`} card={card} jokerCard={jokerCard} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] text-white/50 uppercase tracking-wider">
                      Cards hidden
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {previousHistory.length > 0 && (
            <div className="pt-2">
              <div className="text-[10px] text-white/55 font-black uppercase tracking-[0.2em] mb-2">
                Previous Rounds
              </div>
              <div className="space-y-2">
                {previousHistory.map((entry) => (
                  <HistoryRow key={`h-${entry.round}-${entry.at}`} entry={entry} players={players} />
                ))}
              </div>
            </div>
          )}
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={isGameOver ? actions.playAgain : actions.nextRound}
          className="w-full bg-uno-yellow text-black font-black uppercase tracking-widest py-4 rounded-2xl text-sm border-t border-white/30"
        >
          {isGameOver ? 'Start New Match' : 'Begin Next Round'}
        </motion.button>
      </motion.div>
    </div>
  );
}
