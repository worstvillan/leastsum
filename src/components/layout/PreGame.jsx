import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { avatarColor } from '../../utils/gameUtils';

const INPUT_CLS = [
  'lobby-input w-full rounded-[22px] border px-4 py-4 outline-none transition-all',
  'bg-[rgba(255,248,239,0.92)] text-[var(--ink)]',
  'border-[rgba(255,224,196,0.28)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_14px_26px_rgba(65,19,35,0.08)]',
  'focus:border-[rgba(255,202,104,0.8)] focus:shadow-[0_0_0_3px_rgba(255,202,104,0.14),inset_0_1px_0_rgba(255,255,255,0.82)]',
].join(' ');

const AUTOFILL = {
  WebkitBoxShadow: '0 0 0 1000px rgba(255,248,239,0.92) inset',
};

const CONFIG_DEFAULTS = {
  gameMode: 'leastsum',
  bluffDeckCount: 1,
  cardsPerPlayer: 6,
  maxPlayers: 4,
  elimScore: 200,
  knockerPenalty: 60,
  useJoker: false,
};

const GAME_OPTIONS = {
  leastsum: {
    key: 'leastsum',
    title: 'Least Sum',
    eyebrow: 'Classic',
    description: 'Keep the lowest score in hand.',
    summary: 'Draw, discard, and knock before your score catches you.',
    accent: 'var(--gold)',
    surface:
      'linear-gradient(145deg, rgba(255,214,139,0.18), rgba(255,248,239,0.05))',
    config: {
      gameMode: 'leastsum',
      bluffDeckCount: 1,
      cardsPerPlayer: 6,
      maxPlayers: 4,
      elimScore: 200,
      knockerPenalty: 60,
      useJoker: false,
    },
  },
  bluff: {
    key: 'bluff',
    title: 'Bluff',
    eyebrow: 'Fast',
    description: 'Declare ranks and force objections.',
    summary: 'Place cards face down, claim boldly, survive the objection.',
    accent: 'var(--mint)',
    surface:
      'linear-gradient(145deg, rgba(140,234,214,0.18), rgba(255,248,239,0.05))',
    config: {
      gameMode: 'bluff',
      bluffDeckCount: 1,
      maxPlayers: 4,
    },
  },
};

function ModeTile({ option, onSelect }) {
  return (
    <button
      onClick={() => onSelect(option.key)}
      className="surface-panel group relative overflow-hidden p-5 text-left transition-transform duration-200 hover:-translate-y-1"
      style={{ background: option.surface }}
    >
      <div
        className="absolute right-4 top-4 h-16 w-16 rounded-full blur-2xl transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: option.accent, opacity: 0.16 }}
      />
      <div className="relative">
        <div className="label-micro">{option.eyebrow}</div>
        <div className="headline-display mt-3 text-3xl text-[var(--bg-cloud)]">{option.title}</div>
        <div className="mt-2 text-sm text-white/68">{option.description}</div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-white/56">{option.summary}</div>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-black"
            style={{ background: 'rgba(255,248,239,0.12)', color: option.accent }}
          >
            →
          </div>
        </div>
      </div>
    </button>
  );
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={message}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="surface-glass mb-5 flex items-center gap-3 rounded-[22px] border border-[rgba(241,100,124,0.32)] bg-[rgba(241,100,124,0.14)] px-4 py-3 text-sm text-[var(--bg-cloud)]"
      >
        <div className="chip-danger shrink-0">Alert</div>
        <span className="flex-1 font-semibold">{message}</span>
        <button onClick={onDismiss} className="text-lg leading-none text-white/70 transition-colors hover:text-white">
          x
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

function SliderRow({ label, min, max, step = 1, value, onChange, onCommit, onStart, display }) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="block rounded-[22px] border border-[rgba(255,239,220,0.14)] bg-[rgba(255,248,239,0.05)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="label-micro">{label}</div>
        </div>
        <div className="chip-score">{display ?? value}</div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        onPointerDown={onStart}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        onKeyUp={(e) => {
          if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
            onCommit?.();
          }
        }}
        className="h-2 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background: `linear-gradient(90deg, #ffca68 ${progress}%, rgba(255,255,255,0.12) ${progress}%)`,
        }}
      />
      <div className="mt-2 flex justify-between text-[10px] font-semibold text-white/35">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </label>
  );
}

function PremiumHero({ eyebrow, title, subtitle, className = '', titleClassName = '', subtitleClassName = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-[32px] border border-[rgba(255,236,219,0.16)] bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)),linear-gradient(135deg,rgba(99,24,44,0.92),rgba(55,17,34,0.88))] px-5 py-5 shadow-[0_28px_60px_rgba(23,8,19,0.28)] sm:px-6 sm:py-6 ${className}`}>
      <div className="absolute -left-10 top-2 h-24 w-24 rounded-full bg-[rgba(255,170,116,0.22)] blur-2xl" />
      <div className="absolute -right-12 top-8 h-28 w-28 rounded-full bg-[rgba(241,100,124,0.18)] blur-2xl" />
      <div className="absolute bottom-0 right-10 h-24 w-24 rounded-full bg-[rgba(140,234,214,0.12)] blur-2xl" />
      <div className="relative">
        <div className="label-micro mb-3">{eyebrow}</div>
        <h1 className={`headline-display text-[2.35rem] leading-[0.92] text-[var(--bg-cloud)] sm:text-[3.35rem] ${titleClassName}`}>
          {title}
        </h1>
        <p className={`mt-3 max-w-md text-sm leading-6 text-white/72 ${subtitleClassName}`}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

export function Lobby({ onCreateRoom, onJoinRoom, error, clearError, loading }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [tab, setTab] = useState('create');
  const [selectedMode, setSelectedMode] = useState('');

  const activeMode = selectedMode ? GAME_OPTIONS[selectedMode] : null;

  const handleCreate = () => {
    if (name.trim() && !loading && activeMode) onCreateRoom(name.trim(), activeMode.config);
  };
  const handleJoin = () => {
    if (name.trim() && code.length === 4 && !loading) onJoinRoom(name.trim(), code);
  };
  const switchTab = (nextTab) => {
    setTab(nextTab);
    if (nextTab === 'join') setCode('');
    clearError?.();
  };
  const selectMode = (modeKey) => {
    setSelectedMode(modeKey);
    setTab('create');
    setCode('');
    clearError?.();
  };

  return (
    <div className="relative z-20 flex h-full w-full items-start justify-center overflow-y-auto px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="my-auto w-full max-w-6xl"
      >
        {!activeMode ? (
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <PremiumHero
              eyebrow="Card Rooms"
              title="Choose a Game"
              subtitle="Pick a room type, then create or join."
              titleClassName="max-w-[10ch]"
              subtitleClassName="max-w-[28ch]"
            />

            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              {Object.values(GAME_OPTIONS).map((option) => (
                <ModeTile key={option.key} option={option} onSelect={selectMode} />
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <PremiumHero
              eyebrow={activeMode.eyebrow}
              title={activeMode.title}
              subtitle={activeMode.description}
              titleClassName="max-w-[11ch]"
              subtitleClassName="max-w-[28ch]"
            />

            <div className="surface-panel relative overflow-hidden p-5 sm:p-6">
              <div className="absolute inset-x-8 top-0 h-px bg-white/20" />
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className="label-micro">Enter the table</div>
                  <div className="mt-2 headline-display text-3xl text-[var(--bg-cloud)]">
                    {tab === 'create' ? 'Create Room' : 'Join Room'}
                  </div>
                </div>
                <div className="chip-score">{activeMode.title}</div>
              </div>

              <button
                onClick={() => setSelectedMode('')}
                className="mb-4 text-sm font-semibold text-white/60 transition-colors hover:text-white"
              >
                Back
              </button>

              <ErrorBanner message={error} onDismiss={clearError} />

              <div className="mb-5 grid grid-cols-2 gap-2 rounded-[22px] border border-[rgba(255,245,235,0.12)] bg-[rgba(255,248,239,0.04)] p-1.5">
                {['create', 'join'].map((item) => (
                  <button
                    key={item}
                    onClick={() => switchTab(item)}
                    className={[
                      'rounded-[18px] px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] transition-all',
                      tab === item
                        ? 'surface-lacquer !shadow-none text-[var(--bg-cloud)]'
                        : 'text-white/58 hover:bg-white/6 hover:text-white/88',
                    ].join(' ')}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label-micro mb-2 block">Player Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 20))}
                    className={INPUT_CLS}
                    placeholder="Type your name"
                    autoComplete="off"
                    style={AUTOFILL}
                    onKeyDown={(e) => e.key === 'Enter' && (tab === 'create' ? handleCreate() : handleJoin())}
                  />
                </div>

                <AnimatePresence initial={false}>
                  {tab === 'join' && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 12 }}
                    >
                      <label className="label-micro mb-2 block">Room Code</label>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
                        className={`${INPUT_CLS} lobby-code-input`}
                        placeholder="ABCD"
                        autoComplete="off"
                        style={AUTOFILL}
                        onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                disabled={loading || !name.trim() || (tab === 'join' && code.length !== 4)}
                onClick={tab === 'create' ? handleCreate : handleJoin}
                className="btn-primary-game mt-6 w-full px-5 py-4"
              >
                {loading ? 'Loading' : tab === 'create' ? `Create ${activeMode.title}` : 'Join Room'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function PlayerSeatRow({
  id,
  player,
  isSelf,
  isHostPlayer,
  canKick,
  kickingPlayerId,
  onKickAttempt,
}) {
  return (
    <div className="surface-glass flex items-center gap-3 rounded-[22px] px-3 py-3 sm:rounded-[24px] sm:p-3.5">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/30 text-sm font-extrabold text-white shadow-[0_12px_20px_rgba(0,0,0,0.12)] sm:h-11 sm:w-11 sm:rounded-[16px]"
        style={{ backgroundColor: avatarColor(player?.name || 'P') }}
      >
        {(player?.name || 'P')[0].toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--bg-cloud)]">{player?.name || 'Player'}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {isSelf ? <span className="chip-you">You</span> : null}
          {isHostPlayer ? <span className="chip-host">Host</span> : null}
        </div>
      </div>
      {canKick ? (
        <button
          onClick={() => onKickAttempt(id, player?.name || 'Player')}
          disabled={kickingPlayerId === id}
          className="btn-danger-game shrink-0 px-3 py-2 text-[10px] sm:text-[11px]"
        >
          {kickingPlayerId === id ? 'Kicking' : 'Kick'}
        </button>
      ) : null}
    </div>
  );
}

export function WaitingRoom({
  roomCode,
  isHost,
  gameState,
  myId,
  onUpdateConfig,
  onStartGame,
  onKickPlayer,
  onLeave,
}) {
  const [showConfig, setShowConfig] = useState(false);
  const [kickingPlayerId, setKickingPlayerId] = useState('');
  const [kickError, setKickError] = useState('');
  const commitTimerRef = useRef(null);
  const remoteCfg = { ...CONFIG_DEFAULTS, ...(gameState?.config ?? {}) };
  const remoteCfgKey = JSON.stringify(remoteCfg);
  const [draftCfg, setDraftCfg] = useState(remoteCfg);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const cfg = draftCfg;
  const players = Object.entries(gameState?.players ?? {}).sort((a, b) => a[1].order - b[1].order);
  const hostPlayerId = gameState?.hostPlayerId ?? players[0]?.[0] ?? null;
  const modeLabel = cfg.gameMode === 'bluff' ? 'Bluff' : 'Least Sum';

  useEffect(() => {
    setDraftCfg(remoteCfg);
  }, [remoteCfgKey]);

  useEffect(() => () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isHost || !showConfig) return undefined;
    if (isEditingConfig) return undefined;
    const draftKey = JSON.stringify(draftCfg);
    if (draftKey === remoteCfgKey) return undefined;
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      onUpdateConfig(draftCfg);
    }, 180);
    return () => {
      if (commitTimerRef.current) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
    };
  }, [draftCfg, remoteCfgKey, isEditingConfig, isHost, onUpdateConfig, showConfig]);

  const updLocal = (key, val) => {
    setDraftCfg((prev) => ({ ...prev, [key]: val }));
  };

  const startSliderEdit = () => {
    setIsEditingConfig(true);
  };

  const commitSliderEdit = () => {
    setIsEditingConfig(false);
  };

  const onKickAttempt = async (targetPlayerId, playerName) => {
    if (!isHost || !onKickPlayer || !targetPlayerId || targetPlayerId === myId) return;
    if (!window.confirm(`Kick ${playerName} from lobby?`)) return;

    setKickingPlayerId(targetPlayerId);
    setKickError('');
    const result = await onKickPlayer(targetPlayerId);
    if (!result?.ok) {
      setKickError(result?.message || result?.error || 'Unable to kick player.');
    }
    setKickingPlayerId('');
  };

  return (
    <div className="relative z-20 flex h-full w-full items-start justify-center overflow-y-auto px-4 py-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="my-auto grid min-h-fit w-full max-w-6xl gap-4 sm:gap-5 xl:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="space-y-4 sm:space-y-5">
          <PremiumHero
            eyebrow="Waiting Room"
            title="Waiting Room"
            subtitle="Waiting for players."
            titleClassName="max-w-[10ch]"
            subtitleClassName="max-w-[24ch]"
          />

          <div className="surface-panel p-4 sm:hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="label-micro">Room Code</div>
                <div className="headline-display mt-2 text-3xl tracking-[0.18em] text-[var(--gold)]">{roomCode}</div>
              </div>
              <div className="chip-score">{modeLabel}</div>
            </div>
            <div className="mt-3 text-sm text-white/58">Share this code and wait for the full table.</div>
          </div>

          <div className="surface-panel p-4 sm:p-5 lg:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="label-micro">Player lineup</div>
                <div className="mt-2 headline-display text-3xl text-[var(--bg-cloud)]">
                  {players.length} seated
                </div>
              </div>
              <div className="chip-score">{modeLabel}</div>
            </div>

            {kickError ? <ErrorBanner message={kickError} onDismiss={() => setKickError('')} /> : null}

            <div className="space-y-3">
              {players.map(([id, player]) => (
                <PlayerSeatRow
                  key={id}
                  id={id}
                  player={player}
                  isSelf={id === myId}
                  isHostPlayer={id === hostPlayerId}
                  canKick={isHost && id !== myId}
                  kickingPlayerId={kickingPlayerId}
                  onKickAttempt={onKickAttempt}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="surface-panel p-4 sm:p-5 lg:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="label-micro">Host rail</div>
              <div className="mt-2 headline-display text-3xl text-[var(--bg-cloud)]">
                Match Setup
              </div>
            </div>
            <div className="chip-host">{isHost ? 'You are host' : 'Guest seat'}</div>
          </div>

          <div className="surface-glass mb-4 hidden rounded-[24px] p-4 sm:block">
            <div className="label-micro">Room Code</div>
            <div className="headline-display mt-2 text-4xl tracking-[0.18em] text-[var(--gold)]">{roomCode}</div>
            <div className="mt-2 text-sm text-white/58">Share this code.</div>
          </div>

          {isHost ? (
            <>
              <button
                onClick={() => setShowConfig((prev) => !prev)}
                className="btn-secondary-game mb-4 w-full px-4 py-3"
              >
                {showConfig ? 'Hide Settings' : 'Show Settings'}
              </button>

              <AnimatePresence initial={false}>
                {showConfig && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 sm:space-y-4">
                      <div className="rounded-[24px] border border-[rgba(255,245,235,0.14)] bg-[rgba(255,248,239,0.04)] p-4">
                        <div className="label-micro mb-3">Game Mode</div>
                        <div className="chip-score">
                          {modeLabel}
                        </div>
                      </div>

                      {cfg.gameMode === 'bluff' ? (
                        <SliderRow
                          label="Bluff Deck Count"
                          min={1}
                          max={10}
                          value={cfg.bluffDeckCount}
                          onChange={(v) => updLocal('bluffDeckCount', v)}
                          onStart={startSliderEdit}
                          onCommit={commitSliderEdit}
                          display={`${cfg.bluffDeckCount} deck${cfg.bluffDeckCount === 1 ? '' : 's'}`}
                        />
                      ) : null}

                      <SliderRow
                        label="Max Players"
                        min={2}
                        max={8}
                        value={cfg.maxPlayers}
                        onChange={(v) => updLocal('maxPlayers', v)}
                        onStart={startSliderEdit}
                        onCommit={commitSliderEdit}
                      />

                      {cfg.gameMode === 'leastsum' ? (
                        <>
                          <SliderRow
                            label="Elimination Score"
                            min={50}
                            max={300}
                            step={25}
                            value={cfg.elimScore}
                            onChange={(v) => updLocal('elimScore', v)}
                            onStart={startSliderEdit}
                            onCommit={commitSliderEdit}
                            display={`${cfg.elimScore} pts`}
                          />

                          <SliderRow
                            label="Cards per Player"
                            min={4}
                            max={10}
                            value={cfg.cardsPerPlayer}
                            onChange={(v) => updLocal('cardsPerPlayer', v)}
                            onStart={startSliderEdit}
                            onCommit={commitSliderEdit}
                          />

                          <SliderRow
                            label="Knocker Penalty"
                            min={0}
                            max={100}
                            step={10}
                            value={cfg.knockerPenalty}
                            onChange={(v) => updLocal('knockerPenalty', v)}
                            onStart={startSliderEdit}
                            onCommit={commitSliderEdit}
                            display={`${cfg.knockerPenalty} pts`}
                          />

                          <div className="rounded-[22px] border border-[rgba(255,239,220,0.14)] bg-[rgba(255,248,239,0.05)] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="label-micro">Joker Card</div>
                                <div className="mt-1 text-sm text-white/58">Enable one -1 point rank in the deck.</div>
                              </div>
                              <button
                                onClick={() => updLocal('useJoker', !cfg.useJoker)}
                                className={`relative h-7 w-14 rounded-full border transition-all ${cfg.useJoker ? 'border-[rgba(255,202,104,0.55)] bg-[rgba(255,202,104,0.2)]' : 'border-white/18 bg-white/8'}`}
                              >
                                <span
                                  className={`absolute top-1 h-5 w-5 rounded-full transition-all ${cfg.useJoker ? 'left-8 bg-[var(--gold)]' : 'left-1 bg-white/70'}`}
                                />
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-[22px] border border-[rgba(255,239,220,0.14)] bg-[rgba(255,248,239,0.05)] p-4 text-sm text-white/58">
                          Bluff mode.
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={onStartGame}
                disabled={players.length < 2}
                className="btn-primary-game mt-5 w-full px-5 py-4"
              >
                Start {modeLabel} with {players.length}
              </button>
            </>
          ) : (
            <div className="surface-glass rounded-[24px] p-5">
              <div className="label-micro">Host controls</div>
              <div className="mt-3 headline-display text-2xl text-[var(--bg-cloud)]">Waiting for host</div>
              <div className="mt-2 text-sm text-white/58">Host will start the game.</div>
            </div>
          )}

          <button onClick={onLeave} className="mt-4 w-full text-center text-sm font-semibold text-white/56 transition-colors hover:text-white">
            Leave Room
          </button>
        </div>
      </motion.div>
    </div>
  );
}
