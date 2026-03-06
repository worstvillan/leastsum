import { useEffect } from 'react';
import { useGame } from './hooks/useGame';
import { Lobby, WaitingRoom } from './components/layout/PreGame';
import GameArena from './components/layout/GameArena';

const BG = () => (
  <>
    <div className="absolute inset-0 z-0 pointer-events-none premium-atmosphere" />
    <div className="ambient-orb orb-a z-0 pointer-events-none" />
    <div className="ambient-orb orb-b z-0 pointer-events-none" />
    <div className="ambient-orb orb-c z-0 pointer-events-none" />
    <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_35%),radial-gradient(circle_at_bottom,rgba(0,0,0,0.16),transparent_40%)]" />
  </>
);

export default function App() {
  const game   = useGame();
  const status = game.gameState?.status;
  const theme = 'midnight';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // BUG FIX #6: if roomCode is cleared (host deleted room or null gameState),
  // fall through to the Lobby — no stuck "waiting" screen for non-host players.
  if (!game.roomCode) {
    return (
      <div className="relative w-full h-[100dvh] overflow-hidden">
        <BG />
        {/* BUG FIX #5 & #7 & #10: pass error, clearError, loading down to Lobby */}
        <Lobby
          onCreateRoom={game.createRoom}
          onJoinRoom={game.joinRoom}
          error={game.error}
          clearError={game.clearError}
          loading={game.loading}
        />
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="relative w-full h-[100dvh] overflow-hidden">
        <BG />
        <WaitingRoom
          roomCode={game.roomCode}
          isHost={game.isHost}
          gameState={game.gameState}
          myId={game.myId}
          onUpdateConfig={game.updateConfig}
          onStartGame={game.startGame}
          onKickPlayer={game.kickPlayer}
          onLeave={game.leaveRoom}
        />
      </div>
    );
  }

  if (status === 'playing' || status === 'roundEnd' || status === 'gameover') {
    return (
      <GameArena
        gameState={game.gameState}
        myId={game.myId}
        roomCode={game.roomCode}
        actions={game}
        voiceToken={game.voiceToken}
        voiceUrl={game.voiceUrl}
        voiceError={game.voiceError}
        theme={theme}
      />
    );
  }

  return null;
}
