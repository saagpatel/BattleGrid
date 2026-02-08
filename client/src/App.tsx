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

  // Show connection overlay on disconnect
  if (status === 'disconnected') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-white">
        <h1 className="mb-4 text-3xl font-bold">BattleGrid</h1>
        <p className="mb-4 text-slate-400">Unable to connect to server.</p>
        <button
          onClick={() => connect(WS_URL)}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // State-based routing
  if (!currentRoom) return <LobbyScreen />;
  if (currentRoom.status === 'waiting') return <WaitingRoom />;
  if (phase === 'deploying') return <DeploymentScreen />;
  return <GameScreen />;
}

export default App;
