// gameUtils.js (removed duplicate getSuitStyle and getSeatPosition definitions; kept the first ones and added UNO support as before)
export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ADDED: UNO-specific constants without changing existing
export const UNO_COLORS = ['blue', 'red', 'yellow', 'green'];
export const UNO_RANKS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const UNO_ACTIONS = ['skip', 'reverse', 'draw2'];
export const UNO_WILDS = ['wild', 'wilddraw4'];

export function cardValue(c) {
  if (!c) return 0;
  if (c.rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(c.rank)) return 10;
  // ADDED: Support for UNO card values without changing existing
  if (UNO_RANKS.includes(c.rank)) return parseInt(c.rank);
  if (UNO_ACTIONS.includes(c.rank)) return 20;
  if (UNO_WILDS.includes(c.rank)) return 50;
  return parseInt(c.rank);
}

export function makeCard(r, s) {
  return { rank: r, suit: s, value: cardValue({ rank: r, suit: s }) };
}

/**
 * Joker rule: match by rank/value only (ignore suit/color).
 */
export function isJokerMatch(card, jokerCard) {
  if (!card || !jokerCard) return false;
  return card.rank === jokerCard.rank;
}

export function getSuitStyle(suit) {
  if (suit === '♠') return { bg: 'bg-gray-800', text: 'text-white', accent: '#94a3b8', label: 'spade' };
  if (suit === '♥') return { bg: 'bg-red-500', text: 'text-white', accent: '#ff0000', label: 'heart' }; // Brighter red
  if (suit === '♦') return { bg: 'bg-yellow-400', text: 'text-black', accent: '#ffd700', label: 'diamond' }; // Goldish yellow
  if (suit === '♣') return { bg: 'bg-green-600', text: 'text-white', accent: '#00ff00', label: 'club' }; // Vibrant green
  return { bg: 'bg-gray-700', text: 'text-white', accent: '#ccc', label: '' };
}

// ADDED: getColorStyle for UNO colors without changing getSuitStyle
export function getColorStyle(color) {
  if (color === 'blue') return { bg: 'bg-uno-blue', text: 'text-white', accent: '#3b82f6', label: 'blue' };
  if (color === 'red') return { bg: 'bg-uno-red', text: 'text-white', accent: '#ef4444', label: 'red' };
  if (color === 'yellow') return { bg: 'bg-uno-yellow', text: 'text-black', accent: '#eab308', label: 'yellow' };
  if (color === 'green') return { bg: 'bg-uno-green', text: 'text-white', accent: '#22c55e', label: 'green' };
  if (color === 'wild') return { bg: 'bg-black', text: 'text-white', accent: '#ffffff', label: 'wild' };
  return getSuitStyle(color); // Fallback to original
}

// Enhanced seat positioning with better radius for larger cards
export function getSeatPosition(playerSortedIndex, myIndex, totalPlayers, radiusPct = 45) { // Increased radius
  const relIdx = (playerSortedIndex - myIndex + totalPlayers) % totalPlayers;
  const angleDeg = 90 + (360 / totalPlayers) * relIdx;
  const angleRad = (angleDeg * Math.PI) / 180;
  const x = 50 + radiusPct * Math.cos(angleRad);
  const y = 50 + radiusPct * Math.sin(angleRad);
  return { x, y };
}

export const jokerSparkle = 'animate-sparkle'; // Add to index.css: @keyframes sparkle { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } } with pseudo-elements for stars
/**
 * LATEST FEATURE: Calculates the total hand sum.
 * If a card matches the designated joker rank, it is worth -1 point.
 */
export function handSum(cards, jokerCard = null) {
  return (cards || []).reduce((s, c) => {
    if (isJokerMatch(c, jokerCard)) return s - 1;
    return s + cardValue(c);
  }, 0);
}

// ── Discard pile rotation ──────────────────────────────────────
export function getMessyRotation(index) {
  const angles = [-11, 7, -4, 13, -7, 9, -14, 5, -9, 12];
  return angles[index % angles.length];
}

// ── Deck + shuffle ─────────────────────────────────────────────
export function hardShuffle(arr) {
  let a = [...arr];
  for (let pass = 0; pass < 3; pass++) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }
  const cut = Math.floor(a.length * 0.3 + Math.random() * a.length * 0.4);
  a = [...a.slice(cut), ...a.slice(0, cut)];
  return a;
}

export function freshDoubleDeck() {
  const d = [];
  for (let i = 0; i < 2; i++)
    for (const s of SUITS)
      for (const r of RANKS)
        d.push(makeCard(r, s));
  return hardShuffle(d);
}

// ADDED: freshUnoDeck for UNO support without changing freshDoubleDeck
export function freshUnoDeck() {
  const d = [];
  UNO_COLORS.forEach(s => {
    // 0 one per color
    d.push(makeCard('0', s));
    // 1-9 two per color
    for (const r of UNO_RANKS.slice(1)) {
      d.push(makeCard(r, s));
      d.push(makeCard(r, s));
    }
    // actions two per color
    for (const a of UNO_ACTIONS) {
      d.push(makeCard(a, s));
      d.push(makeCard(a, s));
    }
  });
  // wilds
  for (let i = 0; i < 4; i++) {
    d.push(makeCard('wild', 'wild'));
    d.push(makeCard('wilddraw4', 'wild'));
  }
  return hardShuffle(d);
}

// ── Avatar color ───────────────────────────────────────────────
export function avatarColor(name) {
  const cols = ['#0ea5e9', '#22c55e', '#ec4899', '#eab308', '#a855f7', '#ef4444', '#14b8a6', '#f97316'];
  let h = 0;
  if (!name) return cols[0];
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return cols[h % cols.length];
}

// ── Web Audio sound synthesis (no files needed) ────────────────
let _audioCtx = null;
let _hasUserGesture = false;
let _gestureBound = false;

function ensureGestureBinding() {
  if (_gestureBound || typeof window === 'undefined') return;
  _gestureBound = true;

  const markGesture = () => {
    _hasUserGesture = true;
    window.removeEventListener('pointerdown', markGesture, true);
    window.removeEventListener('touchstart', markGesture, true);
    window.removeEventListener('keydown', markGesture, true);
  };

  window.addEventListener('pointerdown', markGesture, true);
  window.addEventListener('touchstart', markGesture, true);
  window.addEventListener('keydown', markGesture, true);
}

function getCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

export function playSound(type) {
  try {
    ensureGestureBinding();
    if (!_hasUserGesture) return;
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    if (type === 'draw') {
      // Short card flip — white noise burst
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      src.connect(gain); gain.connect(ctx.destination);
      src.start(now);
    } else if (type === 'discard') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'knock') {
      // Dramatic chord stab
      [220, 277, 330].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.03);
        gain.gain.linearRampToValueAtTime(0.18, now + i * 0.03 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.4);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.03); osc.stop(now + 0.6);
      });
    } else if (type === 'myturn') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.45);
    } else if (type === 'match') {
      [440, 554, 659, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.07);
        gain.gain.linearRampToValueAtTime(0.14, now + i * 0.07 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.25);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.07); osc.stop(now + 0.5);
      });
    } else if (type === 'reveal') {
      [330, 392, 523].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.04);
        gain.gain.setValueAtTime(0, now + i * 0.04);
        gain.gain.linearRampToValueAtTime(0.12, now + i * 0.04 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.32);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.04); osc.stop(now + 0.45);
      });
    } else if (type === 'victory') {
      [392, 523, 659, 784].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        gain.gain.setValueAtTime(0, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.14, now + i * 0.05 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.48);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * 0.05); osc.stop(now + 0.7);
      });
    }
  } catch (_) { /* audio blocked */ }
}

export function vibrate(pattern = 30) {
  try {
    ensureGestureBinding();
    if (!_hasUserGesture) return;
    navigator.vibrate?.(pattern);
  } catch (_) {}
}
