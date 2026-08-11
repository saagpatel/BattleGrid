import { lazy, Suspense, useEffect } from 'react';
import { SoloApp } from './solo/SoloApp.js';
import { initWasm } from './wasm/loader.js';

const MultiplayerApp = lazy(() => import('./MultiplayerApp.js'));

function App() {
  const multiplayerRequested =
    new URLSearchParams(window.location.search).get('mode') === 'multiplayer';

  if (multiplayerRequested) {
    return (
      <Suspense
        fallback={
          <main className="app-loading">
            <h1>BattleGrid</h1>
            <p>Loading multiplayer client…</p>
          </main>
        }
      >
        <MultiplayerApp />
      </Suspense>
    );
  }

  return <SoloEntry />;
}

function SoloEntry() {
  useEffect(() => {
    void initWasm();
  }, []);

  return <SoloApp />;
}

export default App;
