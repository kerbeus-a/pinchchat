/**
 * SessionRecall — natural-language session finder for the sidebar.
 *
 * User types a question ("what did I talk about with Beatrice on Tuesday");
 * component calls the gateway's `sessions.searchNL` op which routes through
 * the kin backend, picks the best matches via local Qwen (with keyword
 * fallback), and renders a compact ranked list.
 *
 * Mount this anywhere the Sidebar has space; clicking a result calls
 * `onPick(sessionKey)` so the caller can do whatever switch-to-session flow
 * the rest of the UI expects.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { useGateway } from '../hooks/useGateway';

interface RankedSession {
  key: string;
  sessionKey: string;
  label: string;
  lastMessagePreview?: string;
}

interface Props {
  /** Called when the user picks a result. Caller switches to that session. */
  onPick: (sessionKey: string) => void;
  /** Optional className to slot into the host layout. */
  className?: string;
}

export function SessionRecall({ onPick, className = '' }: Props) {
  const gateway = useGateway();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RankedSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so a slow in-flight query A can't overwrite the
  // results of a fresher query B that came back first. Guard checks on
  // every state update.
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Clear any pending debounce on unmount to avoid setState-after-unmount.
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  // Debounce a search so each keystroke doesn't fire an LLM call. 400ms is
  // a balance: long enough that typing "supplier" doesn't trigger 8 calls,
  // short enough that a deliberate pause feels responsive.
  const runSearch = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setResults([]);
      setError(null);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const r = await gateway.send('sessions.searchNL', { q: query }) as { sessions?: RankedSession[] };
      // Stale response: a newer query was issued; drop this result.
      if (myReq !== reqIdRef.current) return;
      setResults(r.sessions ?? []);
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : 'search failed');
      setResults([]);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [gateway]);

  const onQChange = useCallback((value: string) => {
    setQ(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { void runSearch(value); }, 400);
  }, [runSearch]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 px-3 py-2 text-xs text-pc-text-muted hover:text-pc-text hover:bg-[var(--pc-hover)] rounded-lg transition-colors ${className}`}
        aria-label="Recall a past session by description"
      >
        <Sparkles size={14} />
        <span>Recall by description</span>
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 p-2 border-b border-pc-border ${className}`}>
      <div className="flex items-center gap-1.5">
        <Sparkles size={14} className="text-pc-text-muted shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => onQChange(e.target.value)}
          placeholder="What did I discuss about..."
          aria-label="Natural-language session recall"
          className="flex-1 bg-transparent text-sm text-pc-text placeholder:text-pc-text-muted outline-none"
        />
        {loading && <Loader2 size={14} className="text-pc-text-muted animate-spin shrink-0" />}
        <button
          type="button"
          onClick={() => { setOpen(false); setQ(''); setResults([]); setError(null); }}
          className="p-1 rounded text-pc-text-muted hover:text-pc-text hover:bg-[var(--pc-hover)]"
          aria-label="Close recall"
        >
          <X size={14} />
        </button>
      </div>
      {error && (
        <div className="text-xs text-red-400 px-1">{error}</div>
      )}
      {!loading && q.trim().length >= 3 && results.length === 0 && !error && (
        <div className="text-xs text-pc-text-muted px-1">No matching sessions.</div>
      )}
      {results.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {results.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => { onPick(s.sessionKey); setOpen(false); setQ(''); }}
              className="text-left px-2 py-1 rounded hover:bg-[var(--pc-hover)] transition-colors"
            >
              <div className="text-xs text-pc-text truncate">{s.label}</div>
              {s.lastMessagePreview && (
                <div className="text-[10px] text-pc-text-muted truncate">{s.lastMessagePreview}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
