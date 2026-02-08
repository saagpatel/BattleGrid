import { useState, useEffect, useRef } from 'react';

interface TimerProps {
  durationMs: number;
  onExpire?: () => void;
  className?: string;
}

export function Timer({ durationMs, onExpire, className = '' }: TimerProps) {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const startRef = useRef(Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    startRef.current = Date.now();
    expiredRef.current = false;
    setRemainingMs(durationMs);
  }, [durationMs]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const left = Math.max(0, durationMs - elapsed);
      setRemainingMs(left);

      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [durationMs, onExpire]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const isLow = totalSeconds <= 10;

  return (
    <div
      className={`font-mono text-2xl font-bold ${isLow ? 'text-red-400' : 'text-white'} ${className}`}
      role="timer"
      aria-label={`${totalSeconds} seconds remaining`}
    >
      {display}
    </div>
  );
}
