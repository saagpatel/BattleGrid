import { X } from 'lucide-react';
import { Button } from './Button.js';

interface HelpOverlayProps {
  onClose: () => void;
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close help"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Shortcuts */}
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Gameplay
            </h3>
            <div className="space-y-2">
              <ShortcutRow keys={['ESC']} description="Deselect unit" />
              <ShortcutRow keys={['Enter']} description="Submit orders (when ready)" />
              <ShortcutRow keys={['Left Click']} description="Select unit / Issue move order" />
              <ShortcutRow keys={['Right Click']} description="Cancel selection" />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Game Rules
            </h3>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>• All players issue orders simultaneously during a 30-second timer</li>
              <li>• Orders resolve at the same instant — no turn advantage</li>
              <li>• Win by eliminating all enemy units or holding all 3 fortresses for 3 turns</li>
              <li>• Forest provides +1 defense and blocks line of sight</li>
              <li>• Mountains are impassable and always block line of sight</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Got it!</Button>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-900/50 px-4 py-2">
      <div className="flex gap-2">
        {keys.map((key) => (
          <kbd
            key={key}
            className="min-w-[2.5rem] rounded border border-slate-600 bg-slate-700 px-2 py-1 text-center text-xs font-semibold text-white shadow-sm"
          >
            {key}
          </kbd>
        ))}
      </div>
      <span className="text-sm text-slate-300">{description}</span>
    </div>
  );
}
