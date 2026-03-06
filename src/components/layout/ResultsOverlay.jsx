import { motion } from 'framer-motion';
import { avatarColor, isJokerMatch } from '../../utils/gameUtils';

function cardTone(card, jokerCard) {
  if (isJokerMatch(card, jokerCard)) return { fg: '#34171a', bg: 'linear-gradient(180deg,#ffd788,#ffb463)', label: 'Joker' };
  if (card?.suit === '♥') return { fg: '#fff8ef', bg: 'linear-gradient(180deg,#f1647c,#cf3156)', label: 'Heart' };
  if (card?.suit === '♦') return { fg: '#34171a', bg: 'linear-gradient(180deg,#ffbe89,#ff8b6b)', label: 'Diamond' };
  if (card?.suit === '♣') return { fg: '#fff8ef', bg: 'linear-gradient(180deg,#4bc18e,#268976)', label: 'Club' };
  return { fg: '#fff8ef', bg: 'linear-gradient(180deg,#4b3240,#27161f)', label: 'Spade' };
}

function MiniResultCard({ card, jokerCard }) {
  const tone = cardTone(card, jokerCard);
  const isJoker = isJokerMatch(card, jokerCard);
  return (
    <div
      className="relative flex h-14 w-10 shrink-0 flex-col items-center justify-center overflow-visible rounded-[14px] border text-center shadow-[0_12px_18px_rgba(23,8,19,0.18)]"
      style={{ background: tone.bg, color: tone.fg, borderColor: 'rgba(255,248,239,0.2)' }}
    >
      <span className="headline-display text-[11px] leading-none">{card?.rank}</span>
      <span className="text-base leading-none">{card?.suit}</span>
      {isJoker ? (
        <div className="absolute -right-2 -top-2 rounded-full border border-[rgba(108,52,19,0.24)] bg-[var(--gold)] px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-[var(--ink)]">
          -1
        </div>
      ) : null}
    </div>
  );
}

function HistoryRow({ entry, players }) {
  const playerIds = Object.keys(entry?.results || {});
  return (
    <div className="surface-glass rounded-[22px] p-3.5">
      <div className="label-micro mb-2">Round {entry?.round}</div>
      <div className="space-y-2">
        {playerIds.map((playerId) => {
          const row = entry.results[playerId] || {};
          return (
            <div key={`${entry.round}-${playerId}`} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[var(--bg-cloud)]">{players[playerId]?.name || 'Player'}</span>
              <span className="text-white/62">
                {row.prevScore ?? 0} to {row.newScore ?? 0}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankChip({ index, isWinner }) {
  const label = index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}th`;
  return <span className={isWinner ? 'chip-host' : 'chip-score'}>{label}</span>;
}

function PodiumTile({ label, playerName, value, accent = 'var(--gold)', isYou = false }) {
  return (
    <div className="surface-glass rounded-[24px] p-4">
      <div className="label-micro">{label}</div>
      <div className="mt-3 flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-white/18 text-base font-black text-white shadow-[0_12px_22px_rgba(23,8,19,0.18)]"
          style={{ backgroundColor: avatarColor(playerName || 'P') }}
        >
          {(playerName || 'P')[0]?.toUpperCase?.() || 'P'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-[var(--bg-cloud)]">
            {playerName} {isYou ? <span className="text-[var(--mint)]">(You)</span> : null}
          </div>
          <div className="headline-display mt-1 text-3xl" style={{ color: accent }}>
            {value}
          </div>
        </div>
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
  const previousHistory = [...roundHistory].slice(0, -1).reverse();

  const title = isGameOver ? 'Final Results' : `Round ${gameState.round ?? 1} Complete`;
  const shellClassName = 'surface-panel relative flex max-h-[92dvh] w-full flex-col overflow-y-auto p-4 sm:p-6';

  if (isBluffMode) {
    const finishOrder = Array.isArray(gameState?.bluffFinishOrder) ? gameState.bluffFinishOrder : [];
    const rankedIds = [...finishOrder];
    Object.keys(players).forEach((playerId) => {
      if (!rankedIds.includes(playerId)) rankedIds.push(playerId);
    });
    const podium = rankedIds.slice(0, 3);
    const tableOrder = rankedIds.slice(3);

    return (
      <div className="absolute inset-0 z-[100] flex items-start justify-center overflow-hidden bg-[rgba(30,9,21,0.72)] px-3 pb-3 pt-16 backdrop-blur-xl sm:items-center sm:p-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className={`${shellClassName} max-h-[calc(100dvh-5rem)] max-w-3xl rounded-[28px] sm:max-h-[92dvh] sm:rounded-[32px]`}
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-5">
            <div>
              <div className="label-micro">Bluff Summary</div>
              <h2 className="headline-display mt-2 text-[2.25rem] text-[var(--bg-cloud)] sm:text-4xl">{title}</h2>
            </div>
            <div className="chip-host">Bluff Mode</div>
          </div>

          <div className="grid flex-1 gap-4 overflow-visible lg:grid-cols-[0.96fr_1.04fr]">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {podium.map((playerId, idx) => {
                const player = players[playerId] || {};
                const handCount = Number(gameState?.handCounts?.[playerId] ?? gameState?.hands?.[playerId]?.length ?? 0);
                return (
                  <PodiumTile
                    key={`bluff-podium-${playerId}`}
                    label={idx === 0 ? 'Winner' : idx === 1 ? 'Runner Up' : 'Third'}
                    playerName={player?.name || 'Player'}
                    value={`${handCount}`}
                    accent={idx === 0 ? 'var(--gold)' : idx === 1 ? 'var(--mint)' : 'var(--coral)'}
                    isYou={playerId === myId}
                  />
                );
              })}
            </div>

            <div className="space-y-3 overflow-visible lg:overflow-y-auto lg:pr-1">
              {tableOrder.length ? <div className="label-micro mb-1">Table Order</div> : null}
              {(tableOrder.length ? tableOrder : rankedIds).map((playerId, idx) => {
                const player = players[playerId] || {};
                const handCount = Number(gameState?.handCounts?.[playerId] ?? gameState?.hands?.[playerId]?.length ?? 0);
                const actualIndex = tableOrder.length ? idx + 3 : idx;
                return (
                  <div key={`bluff-rank-${playerId}`} className="surface-glass flex items-center justify-between gap-3 rounded-[24px] p-4">
                    <div className="flex items-center gap-3">
                      <RankChip index={actualIndex} isWinner={actualIndex === 0} />
                      <div>
                        <div className="text-base font-semibold text-[var(--bg-cloud)]">
                          {player?.name || 'Player'} {playerId === myId ? <span className="text-[var(--mint)]">(You)</span> : null}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/46">Cards left</div>
                      </div>
                    </div>
                    <div className="headline-display text-3xl text-[var(--gold)]">{handCount}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={actions.playAgain} className="btn-primary-game mt-4 w-full px-5 py-4 sm:mt-5">
            Start New Match
          </button>
        </motion.div>
      </div>
    );
  }

  const allPlayers = Object.entries(players).sort((a, b) => (a[1]?.score || 0) - (b[1]?.score || 0));
  const allSums = Object.values(roundResults).map((r) => Number(r?.sum || 0));
  const minSum = allSums.length ? Math.min(...allSums) : null;
  const leaderId = allPlayers[0]?.[0] || null;
  const runnerUpId = allPlayers[1]?.[0] || null;
  const leaderPlayer = leaderId ? players[leaderId] || {} : null;
  const runnerUpPlayer = runnerUpId ? players[runnerUpId] || {} : null;
  const leaderResult = leaderId ? roundResults[leaderId] || {} : {};
  const runnerUpResult = runnerUpId ? roundResults[runnerUpId] || {} : {};

  return (
    <div className="absolute inset-0 z-[100] flex items-end justify-center overflow-hidden bg-[rgba(30,9,21,0.72)] p-3 backdrop-blur-xl sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={`${shellClassName} max-w-4xl rounded-[28px] sm:rounded-[32px]`}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-5">
          <div>
            <div className="label-micro">{gameState.knockerFailed ? 'Penalty Resolution' : 'Round Summary'}</div>
            <h2 className="headline-display mt-2 text-[2.25rem] text-[var(--bg-cloud)] sm:text-4xl">{title}</h2>
          </div>
          <div className={gameState.knockerFailed ? 'chip-danger' : 'chip-host'}>
            {gameState.knockerFailed ? 'Knock Failed' : 'Scored'}
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leaderPlayer ? (
            <PodiumTile
              label="Leader"
              playerName={leaderPlayer?.name || 'Player'}
              value={`${leaderResult?.newScore ?? leaderPlayer?.score ?? 0}`}
              accent="var(--gold)"
              isYou={leaderId === myId}
            />
          ) : null}
          {runnerUpPlayer ? (
            <PodiumTile
              label="Runner Up"
              playerName={runnerUpPlayer?.name || 'Player'}
              value={`${runnerUpResult?.newScore ?? runnerUpPlayer?.score ?? 0}`}
              accent="var(--mint)"
              isYou={runnerUpId === myId}
            />
          ) : null}
          <div className="surface-glass rounded-[24px] p-4">
            <div className="label-micro">Lowest Sum</div>
            <div className="headline-display mt-3 text-4xl text-[var(--gold)]">{minSum ?? 0}</div>
          </div>
        </div>

        <div className="grid flex-1 gap-4 overflow-visible lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-3 overflow-visible lg:overflow-y-auto lg:pr-1">
            {allPlayers.map(([id, player], idx) => {
              const result = roundResults[id] || {};
              const revealCards = roundReveal?.handsByPlayer?.[id];
              const isLowest = minSum != null && Number(result?.sum ?? 0) === minSum;
              return (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-[26px] border p-4"
                  style={{
                    background: isLowest
                      ? 'linear-gradient(145deg, rgba(140,234,214,0.16), rgba(255,248,239,0.05))'
                      : 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                    borderColor: isLowest ? 'rgba(140,234,214,0.3)' : 'rgba(255,245,235,0.14)',
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <RankChip index={idx} isWinner={idx === 0} />
                        <div className="text-base font-semibold text-[var(--bg-cloud)]">
                          {player?.name || 'Player'} {id === myId ? <span className="text-[var(--mint)]">(You)</span> : null}
                        </div>
                        {id === gameState.knocker ? <span className="chip-danger">Knock</span> : null}
                      </div>
                      <div className="mt-2 text-sm text-white/58">
                        Sum {result?.sum ?? 0} · Added {result?.addedScore ?? 0}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="label-micro">Total Score</div>
                      <div className="headline-display mt-2 text-3xl text-[var(--gold)]">
                        {result?.newScore ?? player?.score ?? 0}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    {Array.isArray(revealCards) ? (
                      <div className="flex gap-2 overflow-x-auto overflow-y-visible px-1 pt-2 pb-1">
                        {revealCards.map((card, revealIdx) => (
                          <MiniResultCard key={`${id}-${revealIdx}`} card={card} jokerCard={jokerCard} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs uppercase tracking-[0.16em] text-white/42">Cards hidden</div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="space-y-3 overflow-visible lg:overflow-y-auto lg:pr-1">
            <div className="surface-glass rounded-[24px] p-4">
              <div className="label-micro">Score Insight</div>
              <div className="headline-display mt-2 text-2xl text-[var(--bg-cloud)]">
                Lowest visible sum: {minSum ?? 0}
              </div>
            </div>

            {previousHistory.length > 0 ? (
              <div>
                <div className="label-micro mb-2">Previous Rounds</div>
                <div className="space-y-2">
                  {previousHistory.map((entry) => (
                    <HistoryRow key={`history-${entry.round}-${entry.at}`} entry={entry} players={players} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <button onClick={isGameOver ? actions.playAgain : actions.nextRound} className="btn-primary-game mt-4 w-full px-5 py-4 sm:mt-5">
          {isGameOver ? 'Start New Match' : 'Begin Next Round'}
        </button>
      </motion.div>
    </div>
  );
}
