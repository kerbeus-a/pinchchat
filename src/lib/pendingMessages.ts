import type { ChatMessage } from '../types';

const key = (member: string, session: string) => `kin-pending:${member}:${session}`;

export function readPendingMessages(member: string, session: string): ChatMessage[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(member, session)) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(m => m.role === 'user' && typeof m.content === 'string').map(m => ({
      ...m, sendStatus: 'error', sendError: m.sendError ?? 'Delivery was interrupted. Check the conversation before retrying.',
    }));
  } catch { return []; }
}

export function writePendingMessages(member: string, session: string, messages: ChatMessage[]): void {
  try {
    const pending = messages.filter(m => m.role === 'user' && (m.sendStatus === 'sending' || m.sendStatus === 'error'));
    if (pending.length) localStorage.setItem(key(member, session), JSON.stringify(pending));
    else localStorage.removeItem(key(member, session));
  } catch { /* A full browser store must not prevent sending. */ }
}
