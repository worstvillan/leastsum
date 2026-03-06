import { useEffect, useState } from 'react';
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
  minTurnsToKnock: 1,
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
      minTurnsToKnock: 1,
      knockerPenalty: 60,
      useJoker: false,
    },
    tutorial: {
      goal: 'Finish each round with the lowest hand total.',
      loop: ['Pick from deck or previous', 'Throw one rank or a matching set', 'Knock only when your hand is ready'],
      tension: ['Open discard information', 'Timed knock windows', 'Penalty if the knock fails'],
      visualCards: [
        { rank: '5', suit: '♥' },
        { rank: '7', suit: '♠' },
        { rank: '2', suit: '♣' },
      ],
      spotlight: 'Low total wins',
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
    tutorial: {
      goal: 'Get rid of your cards before the table catches your lie.',
      loop: ['Play cards face down', 'Declare a single rank for that play', 'Pass, close, or object when the claim feels wrong'],
      tension: ['Hidden information every turn', 'Pressure on the active claim', 'One objection can flip the round'],
      visualCards: [
        { rank: '?', suit: '🂠' },
        { rank: 'Q', suit: 'Claim' },
        { rank: '!', suit: 'Obj' },
      ],
      spotlight: 'Best liar survives',
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

function TutorialPanel({ option }) {
  const cardOffset = [-10, 0, 10];
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const total = option.tutorial.loop.length;
    if (!total) return undefined;
    const id = window.setInterval(() => {
      setActiveStep((prev) => (prev + 1) % total);
    }, 1800);
    return () => window.clearInterval(id);
  }, [option]);

  return (
    <div className="surface-glass rounded-[28px] p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="label-micro">{option.eyebrow}</div>
          <div className="headline-display mt-2 text-2xl text-[var(--bg-cloud)]">{option.title}</div>
        </div>
        <div
          className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
          style={{ background: 'rgba(255,248,239,0.12)', color: option.accent }}
        >
          {option.tutorial.spotlight}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-[24px] border border-[rgba(255,245,235,0.12)] bg-[rgba(255,248,239,0.04)] p-4">
          <div className="label-micro">Table Snapshot</div>
          <div className="mt-4 flex min-h-[140px] items-center justify-center">
            <div className="relative h-[116px] w-[180px]">
              {option.tutorial.visualCards.map((card, index) => (
                <motion.div
                  key={`${option.key}-visual-${card.rank}-${card.suit}-${index}`}
                  className="absolute top-4 h-[92px] w-[66px] rounded-[18px] border border-[rgba(255,240,224,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,239,0.96))] shadow-[0_16px_30px_rgba(23,8,19,0.18)]"
                  animate={{
                    y: activeStep === index ? -10 : 0,
                    scale: activeStep === index ? 1.04 : 1,
                    boxShadow: activeStep === index
                      ? '0 20px 36px rgba(23,8,19,0.24), 0 0 0 2px rgba(255,248,239,0.18)'
                      : '0 16px 30px rgba(23,8,19,0.18)',
                  }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    left: `${26 + index * 34}px`,
                    transform: `rotate(${cardOffset[index] || 0}deg)`,
                  }}
                >
                  <div className="absolute left-3 top-2 text-[12px] font-black text-[var(--ink)]">{card.rank}</div>
                  <div className="absolute bottom-2 right-3 text-[11px] font-bold text-[rgba(79,55,71,0.76)]">{card.suit}</div>
                  <div
                    className="absolute inset-x-3 top-8 rounded-full px-2 py-1 text-center text-[9px] font-black uppercase tracking-[0.14em]"
                    style={{
                      background: activeStep === index ? 'rgba(255,248,239,0.16)' : 'rgba(255,248,239,0.08)',
                      color: option.accent,
                    }}
                  >
                    {index === 0 ? 'Hand' : index === 1 ? 'Play' : 'Risk'}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <div className="rounded-[18px] border border-[rgba(255,245,235,0.1)] bg-[rgba(255,248,239,0.04)] p-3">
            <div className="label-micro">Goal</div>
            <div className="mt-2 text-sm leading-6 text-white/78">{option.tutorial.goal}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="label-micro mb-3">Round Flow</div>
            <div className="grid gap-3">
              {option.tutorial.loop.map((step, index) => (
                <div key={`${option.key}-loop-${step}`} className="relative">
                  {index < option.tutorial.loop.length - 1 ? (
                    <div className="absolute left-4 top-10 h-8 w-px bg-[rgba(255,248,239,0.12)]" />
                  ) : null}
                  <motion.div
                    animate={{
                      borderColor: activeStep === index ? 'rgba(255,248,239,0.22)' : 'rgba(255,245,235,0.12)',
                      backgroundColor: activeStep === index ? 'rgba(255,248,239,0.08)' : 'rgba(255,248,239,0.04)',
                      x: activeStep === index ? 4 : 0,
                    }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center gap-3 rounded-[20px] border px-4 py-3"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black"
                      style={{
                        background: activeStep === index ? 'rgba(255,248,239,0.2)' : 'rgba(255,248,239,0.12)',
                        color: option.accent,
                      }}
                    >
                      {index + 1}
                    </div>
                    <div className="text-sm text-white/76">{step}</div>
                  </motion.div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              {option.tutorial.loop.map((step, index) => (
                <motion.div
                  key={`${option.key}-indicator-${step}`}
                  animate={{
                    width: activeStep === index ? 28 : 10,
                    opacity: activeStep === index ? 1 : 0.42,
                  }}
                  transition={{ duration: 0.25 }}
                  className="h-2 rounded-full"
                  style={{ background: option.accent }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
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

function PremiumHero({ eyebrow, title, subtitle }) {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-[rgba(255,236,219,0.16)] bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)),linear-gradient(135deg,rgba(99,24,44,0.92),rgba(55,17,34,0.88))] px-6 py-6 shadow-[0_28px_60px_rgba(23,8,19,0.28)]">
      <div className="absolute -left-10 top-2 h-24 w-24 rounded-full bg-[rgba(255,170,116,0.22)] blur-2xl" />
      <div className="absolute -right-12 top-8 h-28 w-28 rounded-full bg-[rgba(241,100,124,0.18)] blur-2xl" />
      <div className="absolute bottom-0 right-10 h-24 w-24 rounded-full bg-[rgba(140,234,214,0.12)] blur-2xl" />
      <div className="relative">
        <div className="label-micro mb-3">{eyebrow}</div>
        <h1 className="headline-display text-4xl leading-[0.92] text-[var(--bg-cloud)] sm:text-[3.35rem]">
          {title}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-white/72">
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
          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <PremiumHero
              eyebrow="Card Rooms"
              title="Choose a Game"
              subtitle="Pick a room type, then create or join."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              {Object.values(GAME_OPTIONS).map((option) => (
                <ModeTile key={option.key} option={option} onSelect={selectMode} />
              ))}
            </div>

            <div className="surface-panel p-5 sm:p-6 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="label-micro">How to Play</div>
                  <div className="headline-display mt-2 text-3xl text-[var(--bg-cloud)]">Game Briefing</div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {Object.values(GAME_OPTIONS).map((option) => (
                  <TutorialPanel key={`tutorial-${option.key}`} option={option} />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <PremiumHero
              eyebrow={activeMode.eyebrow}
              title={activeMode.title}
              subtitle={activeMode.description}
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
    <div className="surface-glass flex items-center gap-3 rounded-[24px] p-3.5">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-white/30 text-sm font-extrabold text-white shadow-[0_12px_20px_rgba(0,0,0,0.12)]"
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
          className="btn-danger-game px-3 py-2 text-[11px]"
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
  const remoteCfg = { ...CONFIG_DEFAULTS, ...(gameState?.config ?? {}) };
  const remoteCfgKey = JSON.stringify(remoteCfg);
  const [draftCfg, setDraftCfg] = useState(remoteCfg);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [pendingConfigKey, setPendingConfigKey] = useState('');
  const cfg = draftCfg;
  const players = Object.entries(gameState?.players ?? {}).sort((a, b) => a[1].order - b[1].order);
  const hostPlayerId = gameState?.hostPlayerId ?? players[0]?.[0] ?? null;

  useEffect(() => {
    if (isEditingConfig) return;
    if (pendingConfigKey && pendingConfigKey !== remoteCfgKey) return;
    setDraftCfg(remoteCfg);
    if (pendingConfigKey && pendingConfigKey === remoteCfgKey) {
      setPendingConfigKey('');
    }
  }, [remoteCfg, remoteCfgKey, isEditingConfig, pendingConfigKey]);

  const submitConfig = (nextCfg) => {
    const nextKey = JSON.stringify(nextCfg);
    setDraftCfg(nextCfg);
    setPendingConfigKey(nextKey);
    onUpdateConfig(nextCfg);
  };

  const upd = (key, val) => {
    submitConfig({ ...draftCfg, [key]: val });
  };

  const updLocal = (key, val) => {
    setDraftCfg((prev) => ({ ...prev, [key]: val }));
  };

  const startSliderEdit = () => {
    setIsEditingConfig(true);
  };

  const commitSliderEdit = () => {
    setIsEditingConfig(false);
    submitConfig(draftCfg);
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
        className="my-auto grid min-h-fit w-full max-w-6xl gap-5 xl:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="space-y-5">
          <PremiumHero
            eyebrow="Waiting Room"
            title={`Room ${roomCode}`}
            subtitle="Waiting for players."
          />

          <div className="surface-panel p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="label-micro">Player lineup</div>
                <div className="mt-2 headline-display text-3xl text-[var(--bg-cloud)]">
                  {players.length} seated
                </div>
              </div>
              <div className="chip-score">{cfg.gameMode === 'bluff' ? 'Bluff' : 'Least Sum'}</div>
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

        <div className="surface-panel p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="label-micro">Host rail</div>
              <div className="mt-2 headline-display text-3xl text-[var(--bg-cloud)]">
                Match Setup
              </div>
            </div>
            <div className="chip-host">{isHost ? 'You are host' : 'Guest seat'}</div>
          </div>

          <div className="surface-glass mb-4 rounded-[24px] p-4">
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
                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-[rgba(255,245,235,0.14)] bg-[rgba(255,248,239,0.04)] p-4">
                        <div className="label-micro mb-3">Game Mode</div>
                        <div className="chip-score">
                          {cfg.gameMode === 'bluff' ? 'Bluff' : 'Least Sum'}
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
                            label="Min Turns to Knock"
                            min={0}
                            max={5}
                            value={cfg.minTurnsToKnock}
                            onChange={(v) => updLocal('minTurnsToKnock', v)}
                            onStart={startSliderEdit}
                            onCommit={commitSliderEdit}
                            display={cfg.minTurnsToKnock === 0 ? 'Any' : `${cfg.minTurnsToKnock}`}
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
                                onClick={() => upd('useJoker', !cfg.useJoker)}
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
                Start {cfg.gameMode === 'bluff' ? 'Bluff' : 'Least Sum'} with {players.length}
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
