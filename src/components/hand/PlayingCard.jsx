import { motion } from 'framer-motion';
import { getSuitStyle } from '../../utils/gameUtils';

// ── Face-up Playing Card ───────────────────────────────────────
export default function PlayingCard({
  rank,
  suit,
  onClick,
  isSelected  = false,
  isMatchable = false,
  isDisabled  = false,
  isJoker     = false, // LATEST FEATURE: Visual indicator for -1 point Joker
  isDraggable = false,
  size        = 'md',
  style       = {},
  className   = '',
}) {
  const isRd = suit === '♥' || suit === '♦';

  const sizes = {
    sm: { w: 44,  h: 62,  cornerPx: 8,  top: 3, left: 4,  suitCls: 'text-xl'  },
    md: { w: 62,  h: 88,  cornerPx: 10, top: 4, left: 5,  suitCls: 'text-3xl' },
    lg: { w: 76,  h: 108, cornerPx: 12, top: 5, left: 6,  suitCls: 'text-4xl' },
    compact: { w: 60, h: 86, cornerPx: 11, top: 4, left: 5, suitCls: 'text-3xl' },
  };
  const sz = sizes[size] ?? sizes.md;

  const suitCornerSize = `${Math.round(sz.cornerPx * 0.85)}px`;

  return (
    <motion.div
      onClick={isDisabled ? undefined : onClick}
      style={{ width: sz.w, height: sz.h, ...style }}
      className={[
        'relative rounded-xl border-[3px] border-white flex items-center justify-center flex-shrink-0',
        'bg-white',
        'shadow-[3px_3px_0px_rgba(0,0,0,0.55)]',
        isSelected  ? 'ring-4 ring-blue-400 ring-offset-2 ring-offset-black/20 brightness-110' : '',
        isMatchable && !isSelected ? 'ring-[3px] ring-yellow-400 ring-offset-1' : '',
        isDisabled  ? 'opacity-40 cursor-default' : (isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'),
        className,
      ].filter(Boolean).join(' ')}
    >
      {isDraggable && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-1 rounded-full bg-slate-700/35 pointer-events-none" />
      )}

      {/* JOKER VISUAL BADGE */}
      {isJoker && (
        <div className="absolute -top-3 -right-3 bg-yellow-400 text-black text-[9px] font-black px-2 py-0.5 rounded-md shadow-[0_2px_10px_rgba(250,204,21,0.5)] rotate-12 z-20 border border-black pointer-events-none">
          JOKER
        </div>
      )}

      {/* Top-left corner */}
      <div className="absolute flex flex-col items-center leading-none"
        style={{ top: sz.top, left: sz.left }}>
        <span className={`font-black leading-none ${isRd ? 'text-red-600' : 'text-slate-900'}`}
          style={{ fontSize: `${sz.cornerPx}px` }}>
          {rank}
        </span>
        <span className={`leading-none ${isRd ? 'text-red-600' : 'text-slate-900'}`}
          style={{ fontSize: suitCornerSize }}>
          {suit}
        </span>
      </div>

      {/* Center suit symbol */}
      <span className={`${sz.suitCls} select-none leading-none ${isRd ? 'text-red-600' : 'text-slate-900'}`}>
        {suit}
      </span>

      {/* Bottom-right corner (rotated) */}
      <div className="absolute flex flex-col items-center leading-none rotate-180"
        style={{ bottom: sz.top, right: sz.left }}>
        <span className={`font-black leading-none ${isRd ? 'text-red-600' : 'text-slate-900'}`}
          style={{ fontSize: `${sz.cornerPx}px` }}>
          {rank}
        </span>
        <span className={`leading-none ${isRd ? 'text-red-600' : 'text-slate-900'}`}
          style={{ fontSize: suitCornerSize }}>
          {suit}
        </span>
      </div>

      {isMatchable && !isSelected && (
        <motion.div
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="absolute inset-0 rounded-xl bg-yellow-400 pointer-events-none"
        />
      )}
    </motion.div>
  );
}

// ── Face-down Card Back ────────────────────────────────────────
export function CardBack({ size = 'md', style = {}, className = '', onClick }) {
  const sizes = { sm: 'w-11 h-16', md: 'w-[62px] h-[88px]', lg: 'w-[76px] h-[108px]' };
  return (
    <motion.div
      onClick={onClick}
      style={style}
      className={[
        `relative ${sizes[size] ?? sizes.md} rounded-xl border-[3px] border-white/70`,
        'bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900',
        'shadow-[3px_3px_0px_rgba(0,0,0,0.55)] flex items-center justify-center overflow-hidden flex-shrink-0',
        onClick ? 'cursor-pointer' : 'cursor-default',
        className,
      ].join(' ')}
    >
      <div className="absolute inset-2 rounded-lg border border-white/10" style={{
        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 5px)`,
      }} />
      <div className="relative w-7 h-7 flex items-center justify-center">
        <div className="w-4 h-4 bg-white/10 border border-white/20 rotate-45 rounded-sm" />
      </div>
    </motion.div>
  );
}

// ── Mini back card for opponent fan ───────────────────────────
export function MiniCardBack({ rotationDeg = 0, zIndex = 0, lift = 0 }) {
  return (
    <div
      className="absolute w-10 h-14 rounded-md border-2 border-white/60 bg-gradient-to-br from-blue-900 to-slate-800 shadow-[2px_2px_0px_rgba(0,0,0,0.5)] overflow-hidden"
      style={{
        transform: `rotate(${rotationDeg}deg) translateY(-${lift}px)`,
        zIndex,
        left: '50%',
        bottom: 0,
        marginLeft: '-20px',
        transformOrigin: 'bottom center',
        position: 'absolute',
      }}
    >
      <div className="absolute inset-1 rounded border border-white/10" style={{
        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 3px)`,
      }} />
    </div>
  );
}
