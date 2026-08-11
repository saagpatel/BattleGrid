import {
  ArrowRight,
  Check,
  ChevronDown,
  Crosshair,
  RotateCcw,
  Shield,
  Swords,
  Target,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { puzzleCatalog } from './puzzleCatalog.js';
import { ReplayPanel } from './ReplayPanel.js';
import { createPuzzleSession } from './sessionAdapter.js';
import { TacticalBoard } from './TacticalBoard.js';
import type {
  LegalPuzzleOrder,
  PuzzleCatalogEntry,
  PuzzleOrderKind,
  PuzzleReplayFrame,
  PuzzleSessionApi,
  PuzzleState,
} from './types.js';

type Screen = 'selector' | 'briefing' | 'planning' | 'result';

const ACTION_LABELS: Record<PuzzleOrderKind, string> = {
  move: 'Move',
  attack: 'Attack',
  defend: 'Defend',
  ability: 'Ability',
  hold: 'Hold',
};

function objectiveCoord(entry: PuzzleCatalogEntry) {
  if (entry.definition.puzzle_id === 'open-the-shot') return { q: 1, r: 0 };
  return { q: 0, r: 0 };
}

function orderPath(order: LegalPuzzleOrder | undefined) {
  return order?.path ?? [];
}

function successExplanation(puzzleId: string) {
  switch (puzzleId) {
    case 'collision-course':
      return 'Why it worked: both moves targeted the same hex in one simultaneous resolution, triggering the collision rule.';
    case 'hold-the-line':
      return 'Why it worked: Forest supplied +1 defense and Defend supplied +2 before the Knight’s attack.';
    case 'open-the-shot':
      return 'Why it worked: the Siege ability changed Forest to Plains before the Archer’s combat step checked line of sight.';
    default:
      return '';
  }
}

function failureExplanation(puzzleId: string, frame: PuzzleReplayFrame) {
  switch (puzzleId) {
    case 'collision-course':
      return 'Why it failed: the two moves did not contest the objective hex (0, 0) in the same resolution.';
    case 'hold-the-line':
      return 'Why it failed: Scout 1 was destroyed during the fixed Knight assault.';
    case 'open-the-shot': {
      const terrainCleared = frame.event_explanations.some((event) =>
        event.includes('Terrain at (1, 0) changed from Forest to Plains'),
      );
      return terrainCleared
        ? 'Why it failed: the forest was cleared, but the resolving combat orders did not destroy Scout 3.'
        : 'Why it failed: Forest remained at (1, 0), so the Archer’s combat step never gained the required open shot.';
    }
    default:
      return `Why it failed: ${frame.result.reason}`;
  }
}

function saveProgress(puzzleId: string) {
  try {
    const key = 'battlegrid:solo-progress:v1';
    const current = JSON.parse(window.localStorage.getItem(key) ?? '{"completed":[]}') as {
      completed?: string[];
    };
    const completed = new Set(current.completed ?? []);
    completed.add(puzzleId);
    window.localStorage.setItem(key, JSON.stringify({ version: 1, completed: [...completed] }));
  } catch {
    // Progress is optional. The puzzle remains fully playable without storage.
  }
}

export function SoloApp() {
  const [screen, setScreen] = useState<Screen>('selector');
  const [activeIndex, setActiveIndex] = useState(0);
  const [session, setSession] = useState<PuzzleSessionApi | null>(null);
  const [initialState, setInitialState] = useState<PuzzleState | null>(null);
  const [currentState, setCurrentState] = useState<PuzzleState | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [legalOrders, setLegalOrders] = useState<LegalPuzzleOrder[]>([]);
  const [selectedKind, setSelectedKind] = useState<PuzzleOrderKind | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<LegalPuzzleOrder | undefined>();
  const [queuedSelections, setQueuedSelections] = useState<Record<number, LegalPuzzleOrder>>({});
  const [frame, setFrame] = useState<PuzzleReplayFrame | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const queueHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const entry = puzzleCatalog[activeIndex] ?? puzzleCatalog[0];
  const definition = entry.definition;
  const displayedState = replayIndex === 0 ? initialState : frame?.state ?? currentState;
  const friendlyUnits =
    currentState?.units.filter((unit) => unit.owner === definition.player_side) ?? [];
  const orderKinds = useMemo(
    () => [...new Set(legalOrders.map((order) => order.order_kind))],
    [legalOrders],
  );
  const orderChoices = selectedKind
    ? legalOrders.filter((order) => order.order_kind === selectedKind)
    : [];

  useEffect(() => {
    if (screen === 'result') {
      resultHeadingRef.current?.focus();
    } else {
      headingRef.current?.focus();
    }
  }, [screen, activeIndex]);

  useEffect(
    () => () => {
      session?.free();
    },
    [session],
  );

  function clearInteractionState() {
    setSelectedUnitId(null);
    setLegalOrders([]);
    setSelectedKind(null);
    setSelectedOrder(undefined);
    setQueuedSelections({});
    setFrame(null);
    setReplayIndex(0);
    setError('');
    setShowHint(false);
  }

  function goToSelector() {
    setSession(null);
    clearInteractionState();
    setScreen('selector');
  }

  function choosePuzzle(index: number) {
    setSession(null);
    clearInteractionState();
    setActiveIndex(index);
    setScreen('briefing');
  }

  async function beginPlanning() {
    setBusy(true);
    setError('');
    try {
      const nextSession = await createPuzzleSession(entry.raw);
      const state = nextSession.current_state();
      setSession(nextSession);
      setInitialState(state);
      setCurrentState(state);
      clearInteractionState();
      setScreen('planning');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The puzzle engine could not start.');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  function selectUnit(unitId: number) {
    if (!session) return;
    setSelectedUnitId(unitId);
    setLegalOrders(session.legal_orders(unitId));
    setSelectedKind(null);
    setSelectedOrder(undefined);
    setError('');
  }

  function chooseAction(kind: PuzzleOrderKind) {
    setSelectedKind(kind);
    setSelectedOrder(undefined);
  }

  function queueSelectedOrder(order: LegalPuzzleOrder) {
    if (!session) return;
    const response = session.queue_order(order);
    if (!response.valid) {
      setError(response.error?.message ?? 'That order is not valid.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setQueuedSelections((current) => ({ ...current, [order.unit_id]: order }));
    setSelectedOrder(order);
    setSelectedKind(null);
    setError('');
    queueHeadingRef.current?.focus();
  }

  function removeQueuedOrder(unitId: number) {
    session?.remove_order(unitId);
    setQueuedSelections((current) => {
      const next = { ...current };
      delete next[unitId];
      return next;
    });
  }

  function commitOrders() {
    if (!session) return;
    const validation = session.validate_commit();
    if (!validation.valid) {
      setError(validation.error?.message ?? 'The order queue is incomplete.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const response = session.commit();
    if (!response.ok || !response.frame) {
      setError(response.error?.message ?? 'The engine rejected this commit.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setFrame(response.frame);
    setCurrentState(response.frame.state);
    setReplayIndex(1);
    if (response.frame.result.outcome === 'success') {
      saveProgress(definition.puzzle_id);
    }
    setScreen('result');
  }

  function retryPuzzle() {
    if (!session) return;
    session.reset();
    const resetState = session.current_state();
    clearInteractionState();
    setInitialState(resetState);
    setCurrentState(resetState);
    setScreen('planning');
  }

  function nextPuzzle() {
    if (activeIndex < puzzleCatalog.length - 1) {
      choosePuzzle(activeIndex + 1);
    } else {
      goToSelector();
    }
  }

  if (screen === 'selector') {
    return (
      <main className="solo-shell selector-shell">
        <header className="brand-bar">
          <div className="brand-lockup">
            <span className="brand-name">BattleGrid</span>
            <span className="brand-mode">Solo tactics</span>
          </div>
          <a className="mode-link" href="?mode=multiplayer">Multiplayer client</a>
        </header>
        <section className="selector-hero" aria-labelledby="selector-title">
          <p className="section-label">Three deterministic field exercises</p>
          <h1 id="selector-title" ref={headingRef} tabIndex={-1}>
            Plan once. Resolve together.
          </h1>
          <p>
            Learn BattleGrid’s simultaneous tactics in three curated, server-free puzzles.
            Every result is resolved and replayed by the Rust engine in your browser.
          </p>
        </section>
        <section className="puzzle-list" aria-label="Prototype puzzles">
          {puzzleCatalog.map((puzzle, index) => (
            <article className="puzzle-row" key={puzzle.definition.puzzle_id}>
              <div className="puzzle-number" aria-hidden="true">0{index + 1}</div>
              <div>
                <p className="difficulty">{puzzle.definition.metadata.difficulty}</p>
                <h2>{puzzle.definition.metadata.title}</h2>
                <p>{puzzle.definition.metadata.learning_goal}</p>
              </div>
              <button type="button" className="primary-button" onClick={() => choosePuzzle(index)}>
                Open briefing <ArrowRight aria-hidden="true" />
              </button>
            </article>
          ))}
        </section>
      </main>
    );
  }

  if (screen === 'briefing') {
    return (
      <main className="solo-shell briefing-shell">
        <header className="brand-bar">
          <button type="button" className="text-button" onClick={goToSelector}>
            Puzzle selector
          </button>
          <div className="puzzle-step">Puzzle {activeIndex + 1} of 3</div>
        </header>
        <section className="briefing-card" aria-labelledby="briefing-title">
          <p className="section-label">{definition.metadata.difficulty} field exercise</p>
          <h1 id="briefing-title" ref={headingRef} tabIndex={-1}>
            {definition.metadata.title}
          </h1>
          <p className="briefing-copy">{definition.metadata.briefing}</p>
          <dl className="briefing-facts">
            <div>
              <dt><Target aria-hidden="true" /> Objective</dt>
              <dd>{definition.metadata.learning_goal}</dd>
            </div>
            <div>
              <dt><Swords aria-hidden="true" /> Fixed enemy intent</dt>
              <dd>{definition.metadata.enemy_intent}</dd>
            </div>
            <div>
              <dt><Shield aria-hidden="true" /> Constraint</dt>
              <dd>
                Queue exactly {definition.constraints.required_order_count} legal order
                {definition.constraints.required_order_count === 1 ? '' : 's'}, then commit once.
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="hint-toggle"
            aria-expanded={showHint}
            onClick={() => setShowHint((visible) => !visible)}
          >
            Optional hint <ChevronDown aria-hidden="true" />
          </button>
          {showHint && <p className="hint-copy">{definition.metadata.hints[0]}</p>}
          <div ref={errorRef} className="error-banner" role="alert" tabIndex={-1}>
            {error}
          </div>
          <button
            type="button"
            className="commit-button"
            disabled={busy}
            onClick={() => void beginPlanning()}
          >
            {busy ? 'Loading engine…' : 'Start planning'} <ArrowRight aria-hidden="true" />
          </button>
        </section>
      </main>
    );
  }

  if (!displayedState) {
    return (
      <main className="app-loading">
        <h1>BattleGrid</h1>
        <p>Preparing puzzle state…</p>
      </main>
    );
  }

  const activeQueuedOrder = selectedUnitId ? queuedSelections[selectedUnitId] : undefined;
  const path = orderPath(selectedOrder ?? activeQueuedOrder);
  const result = frame?.result;
  const resultCode = frame
    ? `${definition.puzzle_id.toUpperCase()}-${result?.outcome === 'success' ? 'S' : 'F'}-${frame.frame_digest.slice(0, 8).toUpperCase()}`
    : '';

  return (
    <main className="solo-shell game-shell">
      <header className="brand-bar game-header">
        <div className="brand-lockup">
          <span className="brand-name">BattleGrid</span>
          <span className="brand-mode">Solo tactics</span>
        </div>
        <nav aria-label="Puzzle actions">
          <button type="button" className="text-button" onClick={goToSelector}>Puzzle selector</button>
          <button type="button" className="text-button" onClick={retryPuzzle}>
            <RotateCcw aria-hidden="true" /> Retry
          </button>
        </nav>
      </header>

      <section className="objective-strip" aria-labelledby="puzzle-title">
        <div>
          <p className="section-label">Puzzle {activeIndex + 1} of 3</p>
          <h1 id="puzzle-title" ref={headingRef} tabIndex={-1}>{definition.metadata.title}</h1>
        </div>
        <div className="objective-copy">
          <p><Target aria-hidden="true" /> {definition.metadata.learning_goal}</p>
          <p className="enemy-intent"><Swords aria-hidden="true" /> {definition.metadata.enemy_intent}</p>
        </div>
      </section>

      <div className="game-layout">
        <div className="board-column">
          <TacticalBoard
            state={displayedState}
            playerSide={definition.player_side}
            selectedUnitId={selectedUnitId}
            selectedPath={path}
            objectiveCoord={objectiveCoord(entry)}
            onSelectUnit={screen === 'planning' ? selectUnit : undefined}
          />
          {frame && (
            <ReplayPanel
              frame={frame}
              replayIndex={replayIndex}
              onReplayIndexChange={setReplayIndex}
            />
          )}
        </div>

        <aside className="planning-rail" aria-label={screen === 'planning' ? 'Planning controls' : 'Puzzle result'}>
          {screen === 'planning' ? (
            <>
              <section aria-labelledby="units-heading">
                <p className="section-label">Step 1</p>
                <h2 id="units-heading">Select a friendly unit</h2>
                <div className="unit-control-list">
                  {friendlyUnits.map((unit) => (
                    <button
                      type="button"
                      key={unit.id}
                      aria-pressed={selectedUnitId === unit.id}
                      className="unit-control"
                      onClick={() => selectUnit(unit.id)}
                    >
                      <span className="unit-marker" aria-hidden="true">▲</span>
                      <span>
                        <strong>{unit.unit_type} {unit.id}</strong>
                        <small>{unit.hp}/{unit.max_hp} HP · ({unit.coord.q}, {unit.coord.r})</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section aria-labelledby="actions-heading">
                <p className="section-label">Step 2</p>
                <h2 id="actions-heading">Choose an action</h2>
                {selectedUnitId === null ? (
                  <p className="empty-guidance">Select a friendly unit to ask the engine for legal actions.</p>
                ) : (
                  <div className="action-grid">
                    {orderKinds.map((kind) => (
                      <button
                        type="button"
                        key={kind}
                        className="action-button"
                        aria-pressed={selectedKind === kind}
                        onClick={() => chooseAction(kind)}
                      >
                        {kind === 'defend' ? <Shield aria-hidden="true" /> : <Crosshair aria-hidden="true" />}
                        {ACTION_LABELS[kind]}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {selectedKind && (
                <section aria-labelledby="targets-heading">
                  <p className="section-label">Step 3</p>
                  <h2 id="targets-heading">
                    {selectedKind === 'move' ? 'Legal destinations' : 'Legal targets'}
                  </h2>
                  <div className="target-list">
                    {orderChoices.map((order) => {
                      const key = `${order.unit_id}:${order.order_kind}:${order.target?.q ?? ''}:${order.target?.r ?? ''}:${order.target_unit_id ?? ''}`;
                      const chosen = selectedOrder === order;
                      const objective = objectiveCoord(entry);
                      const isObjectiveTarget =
                        order.target?.q === objective.q && order.target?.r === objective.r;
                      return (
                        <button
                          type="button"
                          key={key}
                          className="target-button"
                          aria-pressed={chosen}
                          onClick={() => {
                            setSelectedOrder(order);
                            queueSelectedOrder(order);
                          }}
                        >
                          <span>
                            {order.label}
                            {isObjectiveTarget ? ' · Objective hex' : ''}
                          </span>
                          {order.path && (
                            <small>
                              Full path: {order.path.map((coord) => `(${coord.q}, ${coord.r})`).join(' → ')}
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="order-queue" aria-labelledby="queue-heading">
                <p className="section-label">Order queue</p>
                <h2 id="queue-heading" ref={queueHeadingRef} tabIndex={-1}>
                  {Object.keys(queuedSelections).length} / {definition.constraints.required_order_count} ready
                </h2>
                {Object.values(queuedSelections).length === 0 ? (
                  <p className="empty-guidance">No orders queued yet.</p>
                ) : (
                  <ol>
                    {Object.values(queuedSelections)
                      .sort((a, b) => a.unit_id - b.unit_id)
                      .map((order) => (
                        <li key={order.unit_id}>
                          <span>
                            <strong>Unit {order.unit_id}</strong> · {order.label}
                          </span>
                          <button
                            type="button"
                            className="remove-button"
                            onClick={() => removeQueuedOrder(order.unit_id)}
                          >
                            Remove order for unit {order.unit_id}
                          </button>
                        </li>
                      ))}
                  </ol>
                )}
              </section>

              <div ref={errorRef} className="error-banner" role="alert" tabIndex={-1}>
                {error}
              </div>
              <button type="button" className="commit-button" onClick={commitOrders}>
                Commit orders <ArrowRight aria-hidden="true" />
              </button>
            </>
          ) : (
            <section className={`result-panel result-${result?.outcome}`} aria-labelledby="result-title">
              <div className="result-icon" aria-hidden="true">
                {result?.outcome === 'success' ? <Check /> : <Target />}
              </div>
              <p className="section-label">Resolution complete</p>
              <h2 id="result-title" ref={resultHeadingRef} tabIndex={-1}>
                {result?.outcome === 'success' ? 'Objective achieved' : 'Objective failed'}
              </h2>
              <p className="result-reason">{result?.reason}</p>
              {result && frame && (
                <p className={`result-learning result-learning-${result.outcome}`}>
                  {result.outcome === 'success'
                    ? successExplanation(definition.puzzle_id)
                    : failureExplanation(definition.puzzle_id, frame)}
                </p>
              )}
              <p className="result-help">
                Scrub frame 0 and frame 1 to compare the immutable plan state with the actual resolved state and causal log.
              </p>
              <div className="result-code">
                <span>Compact result code</span>
                <code>{resultCode}</code>
              </div>
              <div className="result-actions">
                <button type="button" className="secondary-button" onClick={retryPuzzle}>
                  <RotateCcw aria-hidden="true" /> Retry
                </button>
                <button type="button" className="primary-button" onClick={nextPuzzle}>
                  {activeIndex < 2 ? 'Next puzzle' : 'Puzzle selector'} <ArrowRight aria-hidden="true" />
                </button>
              </div>
            </section>
          )}
        </aside>
      </div>
      <div className="sr-only" aria-live="polite">
        {result ? result.reason : `${Object.keys(queuedSelections).length} orders queued.`}
      </div>
    </main>
  );
}
