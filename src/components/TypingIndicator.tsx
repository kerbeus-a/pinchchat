import { useState, useEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { useT } from '../hooks/useLocale';

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function TypingIndicator() {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div role="status" aria-label={t('chat.thinking')} className="animate-fade-in flex items-start gap-3 px-4 py-3">
      <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-2xl border border-pc-border-strong bg-pc-input/60">
        <Bot className="h-4 w-4 text-pc-accent-light" />
      </div>
      <div className="rounded-3xl border border-pc-border-strong bg-pc-input/55 px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="bounce-dot h-2 w-2 rounded-full bg-gradient-to-r from-cyan-300/80 to-violet-400/80" />
          <span className="bounce-dot h-2 w-2 rounded-full bg-gradient-to-r from-cyan-300/80 to-violet-400/80" />
          <span className="bounce-dot h-2 w-2 rounded-full bg-gradient-to-r from-cyan-300/80 to-violet-400/80" />
          <span className="ml-2 text-xs text-pc-text-secondary">{t('chat.thinking')}</span>
          {elapsed >= 2 && (
            <span className="text-[10px] text-pc-text-muted tabular-nums ml-1">{formatElapsed(elapsed)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
