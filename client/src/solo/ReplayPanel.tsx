import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PuzzleReplayFrame } from './types.js';

interface ReplayPanelProps {
  frame: PuzzleReplayFrame;
  replayIndex: number;
  onReplayIndexChange: (index: number) => void;
}

export function ReplayPanel({
  frame,
  replayIndex,
  onReplayIndexChange,
}: ReplayPanelProps) {
  return (
    <section className="replay-panel" aria-labelledby="replay-heading">
      <div className="section-heading">
        <div>
          <p className="section-label">Replay</p>
          <h2 id="replay-heading">Actual resolution</h2>
        </div>
        <p className="frame-readout">Frame {replayIndex} / 1</p>
      </div>
      <div className="replay-controls" role="group" aria-label="Replay frame controls">
        <button
          type="button"
          className="icon-button"
          aria-label="Show initial frame"
          disabled={replayIndex === 0}
          onClick={() => onReplayIndexChange(0)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <input
          aria-label="Replay frame"
          type="range"
          min="0"
          max="1"
          step="1"
          value={replayIndex}
          onChange={(event) => onReplayIndexChange(Number(event.target.value))}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="Show resolved frame"
          disabled={replayIndex === 1}
          onClick={() => onReplayIndexChange(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="event-log">
        <h3>Ordered event log</h3>
        {replayIndex === 0 ? (
          <p>Orders are queued. No resolution events have occurred.</p>
        ) : (
          <ol>
            {frame.event_explanations.map((event, index) => (
              <li key={`${index}:${event}`}>{event}</li>
            ))}
          </ol>
        )}
      </div>
      <p className="digest-line">
        Frame proof: <code>{replayIndex === 0 ? 'immutable initial state' : frame.frame_digest.slice(0, 16)}</code>
      </p>
    </section>
  );
}
