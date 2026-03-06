import { motion } from 'framer-motion';

function suitTone(suit) {
  if (suit === '♥') return { fg: '#cf3156', pip: '#f1647c', edge: 'rgba(241,100,124,0.24)' };
  if (suit === '♦') return { fg: '#de5f3e', pip: '#ff8b6b', edge: 'rgba(255,139,107,0.24)' };
  if (suit === '♣') return { fg: '#256b55', pip: '#3bb7a1', edge: 'rgba(59,183,161,0.24)' };
  return { fg: '#231622', pip: '#3b2736', edge: 'rgba(35,22,34,0.16)' };
}

export default function PlayingCard({
  rank,
  suit,
  onClick,
  isSelected = false,
  isMatchable = false,
  isDisabled = false,
  isJoker = false,
  isDraggable = false,
  size = 'md',
  style = {},
  className = '',
}) {
  const tone = suitTone(suit);
  const sizes = {
    sm: { w: 46, h: 66, cornerPx: 9, padX: 5, padY: 5, pip: 'text-xl', center: 1.35, badge: 'text-[8px]' },
    md: { w: 64, h: 92, cornerPx: 11, padX: 6, padY: 6, pip: 'text-3xl', center: 1.7, badge: 'text-[9px]' },
    lg: { w: 82, h: 118, cornerPx: 13, padX: 7, padY: 7, pip: 'text-[2.55rem]', center: 2.1, badge: 'text-[10px]' },
    compact: { w: 76, h: 108, cornerPx: 12, padX: 7, padY: 6, pip: 'text-[2.2rem]', center: 1.85, badge: 'text-[10px]' },
  };
  const sz = sizes[size] ?? sizes.md;
  const suitCornerSize = `${Math.round(sz.cornerPx * 0.86)}px`;

  return (
    <motion.div
      whileHover={isDisabled || isSelected ? undefined : { y: -2 }}
      animate={isMatchable && !isSelected ? { y: [0, -4, 0] } : undefined}
      transition={isMatchable && !isSelected ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      onClick={isDisabled ? undefined : onClick}
      style={{
        width: sz.w,
        height: sz.h,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,248,239,0.98) 30%, rgba(248,235,223,0.98) 100%)',
        borderColor: isSelected ? 'rgba(255,202,104,0.95)' : tone.edge,
        boxShadow: isSelected
          ? '0 16px 30px rgba(56,20,30,0.24), 0 0 0 1px rgba(255,214,139,0.4), 0 0 24px rgba(255,188,92,0.3)'
          : isMatchable
          ? '0 18px 34px rgba(40,16,24,0.22), 0 0 0 2px rgba(255,202,104,0.42), 0 0 24px rgba(255,202,104,0.34), 0 0 42px rgba(255,202,104,0.2)'
          : '0 12px 24px rgba(60,18,31,0.16), inset 0 1px 0 rgba(255,255,255,0.82)',
        ...style,
      }}
      className={[
        'relative flex items-center justify-center flex-shrink-0 overflow-visible rounded-[20px] border-[3px]',
        isSelected ? 'brightness-[1.03]' : '',
        isDisabled ? 'opacity-60 cursor-default' : (isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'),
        className,
      ].filter(Boolean).join(' ')}
    >
      <div
        className="absolute inset-[4px] rounded-[16px] border overflow-hidden"
        style={{
          borderColor: 'rgba(154, 95, 84, 0.15)',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.68), rgba(255,255,255,0) 18%), repeating-linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.22) 2px, transparent 2px, transparent 8px)',
        }}
      />

      {isDraggable && (
        <div className="absolute left-1/2 top-1.5 h-1.5 w-6 -translate-x-1/2 rounded-full bg-[rgba(74,55,67,0.2)] pointer-events-none" />
      )}

      {isJoker && (
        <div
          className={`headline-display absolute -right-3 -top-3 z-20 rounded-xl border px-2 py-0.5 font-extrabold uppercase rotate-[10deg] ${sz.badge}`}
          style={{
            background: 'linear-gradient(180deg, #ffd788, #ffb463)',
            color: '#34171a',
            borderColor: 'rgba(108,52,19,0.24)',
            boxShadow: '0 10px 18px rgba(255,177,99,0.24)',
          }}
        >
          Joker
        </div>
      )}

      {isMatchable && !isSelected && (
        <div
          className={`headline-display absolute -left-2 -top-2 z-20 rounded-full border px-2 py-0.5 font-extrabold uppercase ${sz.badge}`}
          style={{
            background: 'linear-gradient(180deg, #ffd788, #ffb463)',
            color: '#34171a',
            borderColor: 'rgba(108,52,19,0.24)',
            boxShadow: '0 10px 18px rgba(255,177,99,0.24)',
          }}
        >
          Match
        </div>
      )}

      <div
        className="absolute flex flex-col items-center leading-none"
        style={{ top: sz.padY, left: sz.padX, color: tone.fg }}
      >
        <span className="headline-display leading-none" style={{ fontSize: `${sz.cornerPx}px` }}>{rank}</span>
        <span className="leading-none" style={{ fontSize: suitCornerSize }}>{suit}</span>
      </div>

      <span
        className={`${sz.pip} select-none leading-none`}
        style={{
          color: tone.pip,
          transform: `translateY(-${sz.center}px)`,
          textShadow: '0 3px 10px rgba(255,255,255,0.28)',
        }}
      >
        {suit}
      </span>

      <div
        className="absolute flex rotate-180 flex-col items-center leading-none"
        style={{ bottom: sz.padY, right: sz.padX, color: tone.fg }}
      >
        <span className="headline-display leading-none" style={{ fontSize: `${sz.cornerPx}px` }}>{rank}</span>
        <span className="leading-none" style={{ fontSize: suitCornerSize }}>{suit}</span>
      </div>

      {isSelected && (
        <motion.div
          initial={false}
          animate={{ opacity: [0.15, 0.28, 0.15] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="pointer-events-none absolute inset-0 rounded-[20px]"
          style={{ background: 'linear-gradient(180deg, rgba(255,208,128,0.34), rgba(255,208,128,0.04))' }}
        />
      )}

      {isMatchable && !isSelected && (
        <motion.div
          animate={{ opacity: [0.1, 0.24, 0.1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
          className="pointer-events-none absolute inset-0 rounded-[20px]"
          style={{ background: 'linear-gradient(180deg, rgba(255,202,104,0.28), rgba(255,202,104,0.04))' }}
        />
      )}

      {isMatchable && !isSelected && (
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.1, repeat: Infinity }}
          className="pointer-events-none absolute inset-[-4px] rounded-[24px] border-2"
          style={{ borderColor: 'rgba(255,202,104,0.68)' }}
        />
      )}
    </motion.div>
  );
}

export function CardBack({ size = 'md', style = {}, className = '', onClick }) {
  const sizes = {
    sm: 'w-[46px] h-[66px]',
    md: 'w-[64px] h-[92px]',
    lg: 'w-[82px] h-[118px]',
  };

  return (
    <motion.div
      whileHover={onClick ? { y: -2 } : undefined}
      onClick={onClick}
      style={style}
      className={[
        `relative ${sizes[size] ?? sizes.md} flex-shrink-0 overflow-hidden rounded-[20px] border-[3px]`,
        onClick ? 'cursor-pointer' : 'cursor-default',
        className,
      ].join(' ')}
      layout
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 24%), linear-gradient(135deg, #6a1633 0%, #541830 34%, #2b1736 100%)',
          borderColor: 'rgba(255, 224, 194, 0.22)',
          boxShadow: '0 16px 30px rgba(44,12,24,0.28)',
        }}
      />
      <div className="absolute inset-[5px] rounded-[15px] border border-[rgba(255,232,205,0.14)]" />
      <div
        className="absolute inset-[10px] rounded-[12px]"
        style={{
          background:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 2px, transparent 2px, transparent 8px), radial-gradient(circle at center, rgba(255,203,120,0.16), transparent 55%)',
          border: '1px solid rgba(255,239,220,0.08)',
        }}
      />
      <div className="relative flex h-full items-center justify-center">
        <div className="relative flex h-8 w-8 items-center justify-center">
          <div className="absolute h-6 w-6 rotate-45 rounded-[8px] border border-[rgba(255,222,183,0.28)] bg-[rgba(255,212,142,0.12)]" />
          <div className="absolute h-3 w-3 rotate-45 rounded-[4px] bg-[rgba(255,250,245,0.8)]" />
        </div>
      </div>
    </motion.div>
  );
}

export function MiniCardBack({ rotationDeg = 0, zIndex = 0, lift = 0 }) {
  return (
    <div
      className="absolute h-14 w-10 overflow-hidden rounded-[12px] border-2"
      style={{
        transform: `rotate(${rotationDeg}deg) translateY(-${lift}px)`,
        zIndex,
        left: '50%',
        bottom: 0,
        marginLeft: '-20px',
        transformOrigin: 'bottom center',
        borderColor: 'rgba(255,233,204,0.3)',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 24%), linear-gradient(135deg, #6a1633 0%, #541830 34%, #2b1736 100%)',
        boxShadow: '0 10px 18px rgba(33,12,22,0.24)',
        position: 'absolute',
      }}
    >
      <div
        className="absolute inset-[3px] rounded-[8px] border"
        style={{ borderColor: 'rgba(255,232,205,0.12)' }}
      />
      <div
        className="absolute inset-[7px] rounded-[6px]"
        style={{
          background:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 2px, transparent 2px, transparent 7px)',
        }}
      />
    </div>
  );
}
