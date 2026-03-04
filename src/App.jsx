// App.jsx (modified BG to match image: blue sky to green, added subtle clouds or spikes if needed, but kept simple)
import { useGame } from './hooks/useGame';
import { Lobby, WaitingRoom } from './components/layout/PreGame';
import GameArena from './components/layout/GameArena';

const BG = () => (
  <>
    <div className="absolute inset-0 bg-gradient-to-b from-blue-400 to-green-500 z-0 pointer-events-none" /> {/* Updated to blue-green gradient */}
    <div className="absolute inset-0 bg-[radial-gradient(#ffffff22_1px,_transparent_1px)] bg-[size:30px_30px] opacity-10 z-0 pointer-events-none" />
  </>
);

export default function App() {
  const game   = useGame();
  const status = game.gameState?.status;

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
      />
    );
  }

  return null;
}
