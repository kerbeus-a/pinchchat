/**
 * SessionPreview — lazy-loaded last-N-turns preview for a session row.
 *
 * Mounted inline under a sidebar row when the user expands it. Fetches via
 * the existing `chat.history` gateway op, caches per-session in the
 * component's own state, renders a compact role-tagged list capped at 10
 * turns.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useGateway } from '../hooks/useGateway';

interface PreviewMessage {
  role?: string;
  content?: string;
  text?: string;
  body?: string;
}

interface Props {
  sessionKey: string;
  /** Open/close flag from parent. Component unmounts on close. */
  open: boolean;
  /** How many turns to show. Default 10. */
  limit?: number;
}

const MAX_PREVIEW_CHARS = 200;

export function SessionPreview({ sessionKey, open, limit = 10 }: Props) {
  const gateway = useGateway();
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<PreviewMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages(null);
    gateway.send('chat.history', { sessionKey })
      .then((r) => {
        if (cancelled) return;
        const arr = (r as { messages?: PreviewMessage[] }).messages ?? [];
        // Tail of conversation. The API returns oldest-first usually; take last `limit`.
        setMessages(arr.slice(-limit));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'preview failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, sessionKey, gateway, limit]);

  if (!open) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-pc-text-muted">
        <Loader2 size={12} className="animate-spin" />
        <span>Loading preview…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-red-400">Preview failed: {error}</div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-pc-text-muted italic">No messages yet.</div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-l-2 border-pc-border ml-3 mb-2">
      {messages.map((m, i) => {
        const role = (m.role ?? 'msg').toLowerCase();
        const raw = m.content ?? m.text ?? m.body ?? '';
        const body = String(raw).slice(0, MAX_PREVIEW_CHARS);
        const truncated = String(raw).length > MAX_PREVIEW_CHARS;
        const isUser = role === 'user' || role === 'human';
        return (
          <div key={i} className="text-[11px] leading-snug">
            <span className={`font-semibold uppercase tracking-wide mr-1.5 ${isUser ? 'text-pc-accent-light' : 'text-pc-text-muted'}`}>
              {role}
            </span>
            <span className="text-pc-text-secondary">{body}{truncated ? '…' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
