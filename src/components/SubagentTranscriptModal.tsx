/**
 * Read-only modal that renders a subagent's full transcript.
 *
 * Admin-only on the server side; this component just trusts the
 * `loadMessages` callback to either return data or [] on auth refusal.
 * No write surface — clicking inside has no effect on agent state.
 *
 * Mounted at the app root so it overlays everything. Closes on:
 *   - Escape key
 *   - Click on backdrop
 *   - Click on the X button
 */

import { useEffect, useState } from 'react';
import { X, Loader2, Bot, User } from 'lucide-react';
import type { SubagentSummary } from '../types';

interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  timestamp: number;
}

interface Props {
  /** The subagent being viewed (carries description + agentType for header) */
  subagent: SubagentSummary;
  /** Async fetcher for the transcript. Returns [] on auth failure. */
  loadMessages: (sessionKey: string, subId: string) => Promise<TranscriptMessage[]>;
  /** Close the modal. Caller resets the visible-subagent state. */
  onClose: () => void;
}

export function SubagentTranscriptModal({ subagent, loadMessages, onClose }: Props) {
  const [messages, setMessages] = useState<TranscriptMessage[] | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  // Single-shot fetch on mount. Re-mount happens automatically when the
  // user opens a different subagent (caller swaps the key).
  // We track fetch-success vs fetch-failure separately from the empty case
  // so the UI doesn't lie about "auth refused" when the transcript was
  // legitimately empty. [Audit transcript-modal / L2]
  useEffect(() => {
    let cancelled = false;
    setFetchFailed(false);
    loadMessages(subagent.parentSessionKey, subagent.id)
      .then(list => {
        if (cancelled) return;
        setMessages(list);
      })
      .catch(() => {
        if (cancelled) return;
        setFetchFailed(true);
        setMessages([]);
      });
    return () => { cancelled = true; };
  }, [subagent.parentSessionKey, subagent.id, loadMessages]);

  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const headerTitle = subagent.description || subagent.id;
  const headerSub = [
    subagent.agentType,
    subagent.lastActive ? new Date(subagent.lastActive).toLocaleString() : null,
    `${subagent.messageCount} msg`,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-[90]"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        role="button"
        tabIndex={-1}
        aria-label="Close transcript"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Subagent transcript"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[min(900px,95vw)] h-[min(720px,90vh)] flex flex-col bg-[var(--pc-bg-base)] border border-pc-border-strong rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <header className="shrink-0 flex items-start gap-3 px-5 py-3 border-b border-pc-border bg-[var(--pc-bg-surface)]/40">
          <Bot size={16} className="shrink-0 mt-1 text-pc-accent-light/70" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-pc-text truncate">{headerTitle}</h2>
            <p className="text-[11px] text-pc-text-muted mt-0.5 truncate">{headerSub}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg hover:bg-[var(--pc-hover)] text-pc-text-secondary hover:text-pc-text transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages === null && (
            <div className="flex items-center justify-center gap-2 py-8 text-pc-text-muted text-sm">
              <Loader2 size={14} className="animate-spin" />
              <span>Loading transcript…</span>
            </div>
          )}
          {messages !== null && messages.length === 0 && (
            <div className="text-center py-8 text-pc-text-muted text-sm italic">
              {fetchFailed ? 'Failed to load transcript.' : 'Empty transcript.'}
            </div>
          )}
          {messages?.map(m => {
            const text = m.content.map(b => b.text).join('\n').trim();
            const isUser = m.role === 'user';
            return (
              <div key={m.id} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${
                  isUser ? 'bg-violet-500/15 text-violet-300' : 'bg-cyan-500/10 text-cyan-300'
                }`}>
                  {isUser ? <User size={12} /> : <Bot size={12} />}
                </div>
                <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
                  <pre className={`inline-block max-w-full whitespace-pre-wrap break-words text-[13px] leading-relaxed text-pc-text-secondary px-3 py-2 rounded-xl border ${
                    isUser
                      ? 'bg-violet-500/5 border-violet-500/20'
                      : 'bg-pc-elevated/40 border-pc-border'
                  } font-sans text-left`}>
                    {text || <span className="italic text-pc-text-muted">(no text)</span>}
                  </pre>
                  {m.timestamp > 0 && (
                    <p className="text-[10px] text-pc-text-faint mt-0.5 tabular-nums">
                      {new Date(m.timestamp).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <footer className="shrink-0 px-5 py-2 border-t border-pc-border bg-[var(--pc-bg-surface)]/40 text-[10px] text-pc-text-faint">
          Read-only · press Esc to close
        </footer>
      </div>
    </>
  );
}
