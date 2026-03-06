import { useEffect, useMemo, useState } from 'react';
import { Container, Graphics, Stage, Text } from '@pixi/react';
import { TextStyle } from 'pixi.js';
import { isJokerMatch } from '../../utils/gameUtils';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function detectQualityTier() {
  const preferred = String(import.meta.env.VITE_PIXI_QUALITY || 'auto').trim().toLowerCase();
  if (preferred === 'low' || preferred === 'medium' || preferred === 'high') return preferred;

  const memory = Number(window.navigator?.deviceMemory || 0);
  const threads = Number(window.navigator?.hardwareConcurrency || 0);
  const isMobile = /android|iphone|ipad|ipod/i.test(window.navigator?.userAgent || '');

  if (isMobile || memory <= 4 || threads <= 4) return 'low';
  if (memory <= 8 || threads <= 8) return 'medium';
  return 'high';
}

function getPixelRatioForTier(tier) {
  const dpr = Number(window.devicePixelRatio || 1);
  if (tier === 'low') return 1;
  if (tier === 'medium') return clamp(dpr, 1, 1.5);
  return clamp(dpr, 1, 2);
}

const CARD_COLORS = {
  '♠': { bg: 0xe5e7eb, fg: 0x111827 },
  '♥': { bg: 0xffe4e6, fg: 0xb91c1c },
  '♦': { bg: 0xfff7ed, fg: 0xc2410c },
  '♣': { bg: 0xdcfce7, fg: 0x166534 },
};

function drawCardShape(graphics, width, height, borderColor, fillColor) {
  graphics.clear();
  graphics.lineStyle(2, borderColor, 1);
  graphics.beginFill(fillColor, 1);
  graphics.drawRoundedRect(0, 0, width, height, 10);
  graphics.endFill();
}

function drawBackShape(graphics, width, height, tier = 'medium') {
  graphics.clear();
  graphics.lineStyle(2, 0x9ca3af, 1);
  graphics.beginFill(0x1e3a8a, 1);
  graphics.drawRoundedRect(0, 0, width, height, 10);
  graphics.endFill();

  if (tier !== 'low') {
    graphics.lineStyle(1, 0x60a5fa, 0.65);
    graphics.drawRoundedRect(7, 7, width - 14, height - 14, 8);
    graphics.moveTo(width / 2, 9);
    graphics.lineTo(width / 2, height - 9);
    graphics.moveTo(9, height / 2);
    graphics.lineTo(width - 9, height / 2);
  }
}

function drawTable(graphics, width, height, activePulse = 0) {
  graphics.clear();
  graphics.beginFill(0x15803d, 0.96);
  graphics.drawEllipse(0, 0, width / 2, height / 2);
  graphics.endFill();

  graphics.lineStyle(5, 0x86efac, 0.6 + activePulse * 0.2);
  graphics.drawEllipse(0, 0, width / 2 + 3, height / 2 + 3);
}

const labelStyle = new TextStyle({
  fill: 0xffffff,
  fontFamily: 'Arial',
  fontSize: 11,
  fontWeight: '700',
  letterSpacing: 1.1,
});

const chipStyle = new TextStyle({
  fill: 0x111827,
  fontFamily: 'Arial',
  fontSize: 10,
  fontWeight: '700',
});

const cardRankStyle = new TextStyle({
  fill: 0x111827,
  fontFamily: 'Arial',
  fontSize: 20,
  fontWeight: '900',
});

const cardSuitStyle = new TextStyle({
  fill: 0x111827,
  fontFamily: 'Arial',
  fontSize: 20,
  fontWeight: '900',
});

export default function GameBoardCanvas({
  gameState,
  myId,
  actions,
  isBluffMode = false,
  displayCards = [],
  selectedTokens = [],
  canSelectHand = false,
  onToggleToken,
  canPick = false,
  canThrow = false,
  canKnock = false,
  onThrow,
  onKnock,
  phase = 'throw',
}) {
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  });
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const onResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const qualityTier = useMemo(() => detectQualityTier(), []);
  const resolution = useMemo(() => getPixelRatioForTier(qualityTier), [qualityTier]);
  const width = viewport.width;
  const height = viewport.height;

  useEffect(() => {
    if (qualityTier === 'low') return undefined;
    let rafId = 0;
    let lastMs = performance.now();

    const tick = (now) => {
      const dt = clamp((now - lastMs) / 16.6667, 0.2, 2.2);
      lastMs = now;
      setPulse((v) => (v + dt * 0.012) % 1);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [qualityTier]);

  const deckCount = Array.isArray(gameState?.deck) ? gameState.deck.length : 0;
  const pile = Array.isArray(gameState?.pile) ? gameState.pile : [];
  const pileTop = pile[pile.length - 1] || null;
  const previousCard = gameState?.previousCard || null;
  const jokerCard = gameState?.jokerCard || null;

  const tableW = clamp(width * 0.28, 300, 430);
  const tableH = clamp(height * 0.22, 190, 260);
  const centerX = width * 0.5;
  const centerY = height * 0.52;

  const handCardW = isBluffMode ? 48 : 64;
  const handCardH = isBluffMode ? 68 : 92;
  const handOverlap = isBluffMode ? 26 : 56;
  const handTotalWidth = displayCards.length > 0
    ? handCardW + handOverlap * Math.max(0, displayCards.length - 1)
    : handCardW;
  const handStartX = centerX - handTotalWidth / 2;
  const handY = height - (isBluffMode ? 172 : 184);

  const midYOffset = Math.sin(pulse * Math.PI * 2) * (qualityTier === 'high' ? 3 : 2);

  return (
    <div className="fixed inset-0 z-[12] pointer-events-none">
      <Stage
        width={width}
        height={height}
        options={{
          backgroundAlpha: 0,
          antialias: qualityTier !== 'low',
          resolution,
          autoDensity: true,
          powerPreference: 'high-performance',
        }}
        style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}
      >
        <Container x={centerX} y={centerY + midYOffset}>
          <Graphics draw={(graphics) => drawTable(graphics, tableW, tableH, pulse)} />

          <Container
            x={-110}
            y={-44}
            interactive={canPick}
            cursor={canPick ? 'pointer' : 'default'}
            pointertap={() => {
              if (!canPick) return;
              actions?.pickFromDeck?.();
            }}
          >
            <Graphics draw={(graphics) => drawBackShape(graphics, 62, 88, qualityTier)} />
            <Text text={deckCount > 99 ? '99+' : String(deckCount)} x={47} y={-8} style={chipStyle} />
            <Text text="DECK" x={17} y={95} anchor={0.5} style={labelStyle} />
          </Container>

          <Container
            x={-26}
            y={-44}
            interactive={canPick && !!previousCard}
            cursor={canPick && previousCard ? 'pointer' : 'default'}
            pointertap={() => {
              if (!canPick || !previousCard) return;
              actions?.pickFromPrevious?.();
            }}
          >
            {previousCard ? (
              <>
                <Graphics
                  draw={(graphics) => {
                    const color = CARD_COLORS[previousCard.suit] || { bg: 0xf3f4f6, fg: 0x111827 };
                    drawCardShape(graphics, 62, 88, 0x111827, color.bg);
                  }}
                />
                <Text text={previousCard.rank || '?'} x={14} y={8} style={cardRankStyle} />
                <Text text={previousCard.suit || '?'} x={16} y={38} style={cardSuitStyle} />
              </>
            ) : (
              <Graphics
                draw={(graphics) => {
                  graphics.clear();
                  graphics.lineStyle(2, 0xffffff, 0.35);
                  graphics.drawRoundedRect(0, 0, 62, 88, 10);
                }}
              />
            )}
            <Text text="PREV" x={20} y={95} anchor={0.5} style={labelStyle} />
          </Container>

          <Container x={58} y={-44}>
            <Graphics draw={(graphics) => drawBackShape(graphics, 56, 78, qualityTier)} />
            {pileTop && (
              <Container x={10} y={6}>
                <Graphics
                  draw={(graphics) => {
                    const color = CARD_COLORS[pileTop.suit] || { bg: 0xf3f4f6, fg: 0x111827 };
                    drawCardShape(graphics, 50, 72, 0x111827, color.bg);
                  }}
                />
                <Text text={pileTop.rank || '?'} x={12} y={6} style={cardRankStyle} />
                <Text text={pileTop.suit || '?'} x={12} y={36} style={cardSuitStyle} />
              </Container>
            )}
            <Text text={String(pile.length)} x={50} y={-8} style={chipStyle} />
            <Text text="PILE" x={18} y={95} anchor={0.5} style={labelStyle} />
          </Container>

          {jokerCard && !isBluffMode && (
            <Container x={130} y={-44}>
              <Graphics
                draw={(graphics) => {
                  const color = CARD_COLORS[jokerCard.suit] || { bg: 0xf3f4f6, fg: 0x111827 };
                  drawCardShape(graphics, 50, 72, 0x111827, color.bg);
                }}
              />
              <Text text={jokerCard.rank || '?'} x={9} y={4} style={cardRankStyle} />
              <Text text={jokerCard.suit || '?'} x={9} y={30} style={cardSuitStyle} />
              <Text text="J" x={34} y={-8} style={chipStyle} />
            </Container>
          )}
        </Container>

        {displayCards.map((card, idx) => {
          const token = card?.token;
          const isSelected = selectedTokens.includes(token);
          const canMatch = !isBluffMode
            && phase === 'throw'
            && (card?.rank || '') === (previousCard?.rank || '');
          const cardX = handStartX + idx * handOverlap;
          const cardY = handY - (isSelected ? 24 : 0);
          const style = CARD_COLORS[card?.suit] || { bg: 0xf3f4f6, fg: 0x111827 };
          const isJoker = isJokerMatch(card, jokerCard);

          return (
            <Container
              key={token || `card-${idx}`}
              x={cardX}
              y={cardY}
              interactive={canSelectHand}
              cursor={canSelectHand ? 'pointer' : 'default'}
              pointertap={() => {
                if (!canSelectHand || !token) return;
                onToggleToken?.(token);
              }}
            >
              <Graphics
                draw={(graphics) => {
                  const border = isSelected ? 0xf59e0b : (canMatch ? 0x22c55e : 0x111827);
                  drawCardShape(graphics, handCardW, handCardH, border, style.bg);
                }}
              />
              <Text
                text={card?.rank || '?'}
                x={12}
                y={8}
                style={new TextStyle({
                  fill: style.fg,
                  fontFamily: 'Arial',
                  fontSize: isBluffMode ? 16 : 20,
                  fontWeight: '900',
                })}
              />
              <Text
                text={card?.suit || '?'}
                x={12}
                y={38}
                style={new TextStyle({
                  fill: style.fg,
                  fontFamily: 'Arial',
                  fontSize: isBluffMode ? 16 : 20,
                  fontWeight: '900',
                })}
              />
              {isJoker && (
                <Text text="J" x={handCardW - 14} y={6} style={chipStyle} />
              )}
            </Container>
          );
        })}

        {!isBluffMode && (
          <Container x={width - 230} y={height - 176}>
            <Container
              interactive={canThrow}
              cursor={canThrow ? 'pointer' : 'default'}
              pointertap={() => { if (canThrow) onThrow?.(); }}
            >
              <Graphics
                draw={(graphics) => {
                  graphics.clear();
                  graphics.beginFill(canThrow ? 0x10b981 : 0x6b7280, 0.88);
                  graphics.drawRoundedRect(0, 0, 94, 32, 12);
                  graphics.endFill();
                }}
              />
              <Text text="THROW" x={47} y={16} anchor={0.5} style={labelStyle} />
            </Container>
            <Container
              x={108}
              interactive={canKnock}
              cursor={canKnock ? 'pointer' : 'default'}
              pointertap={() => { if (canKnock) onKnock?.(); }}
            >
              <Graphics
                draw={(graphics) => {
                  graphics.clear();
                  graphics.beginFill(canKnock ? 0xef4444 : 0x6b7280, 0.88);
                  graphics.drawRoundedRect(0, 0, 94, 32, 12);
                  graphics.endFill();
                }}
              />
              <Text text="KNOCK" x={47} y={16} anchor={0.5} style={labelStyle} />
            </Container>
          </Container>
        )}

        <Container x={16} y={height - 26}>
          <Text
            text={`Renderer: PIXI (${qualityTier.toUpperCase()})`}
            style={new TextStyle({
              fill: 0xffffff,
              fontFamily: 'Arial',
              fontSize: 10,
              fontWeight: '700',
              letterSpacing: 1.3,
            })}
          />
        </Container>
      </Stage>
    </div>
  );
}
