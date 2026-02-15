import { useEffect } from 'react';
import { useGameStore } from './stores/gameStore.js';
import { useLobbyStore } from './stores/lobbyStore.js';
import { useConnectionStore } from './stores/connectionStore.js';
import { initWasm } from './wasm/loader.js';
import { connect } from './network/client.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { WaitingRoom } from './screens/WaitingRoom.js';
import { DeploymentScreen } from './screens/DeploymentScreen.js';
import { GameScreen } from './screens/GameScreen.js';
import { GameOverScreen } from './screens/GameOverScreen.js';
import { ToastContainer } from './components/Toast.js';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

function App() {
  const phase = useGameStore((s) => s.phase);
  const currentRoom = useLobbyStore((s) => s.currentRoom);
  const status = useConnectionStore((s) => s.status);

  useEffect(() => {
    // Load WASM in background — non-blocking
    initWasm();

    // Connect to game server
    connect(WS_URL);
  }, []);

  // Show connection states
  if (status === 'connecting') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-indigo-500"></div>
          <h1 className="mb-2 text-3xl font-bold">BattleGrid</h1>
          <p className="text-slate-400">Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (status === 'disconnected') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <div className="mb-4 text-6xl">⚠️</div>
          <h1 className="mb-2 text-3xl font-bold">Connection Lost</h1>
          <p className="mb-6 text-slate-400">Unable to reach the game server.</p>
          <button
            onClick={() => connect(WS_URL)}
            className="rounded-md bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // State-based routing
  let screen;
  if (!currentRoom) screen = <LobbyScreen />;
  else if (currentRoom.status === 'waiting') screen = <WaitingRoom />;
  else if (phase === 'deploying') screen = <DeploymentScreen />;
  else if (phase === 'finished') screen = <GameOverScreen />;
  else screen = <GameScreen />;

  return (
    <>
      {screen}
      <ToastContainer />
    </>
  );
}

export default App;
