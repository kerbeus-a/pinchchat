import type { ChatMessage } from '../types';

/** Keep the foreground stream at the tail, where delta/tool handlers update it. */
export function appendBackgroundOutcome(messages: ChatMessage[], payload: Record<string, unknown>): ChatMessage[] {
  if (typeof payload.id !== 'string' || !/^\d+$/.test(payload.id)
    || typeof payload.content !== 'string' || !payload.content.trim()
    || messages.some(m => m.id === payload.id)) return messages;
  const message: ChatMessage = { id: payload.id, role: 'assistant', content: payload.content,
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
    blocks: [{ type: 'text', text: payload.content }] };
  const streaming = messages.findIndex(m => m.isStreaming);
  const index = streaming < 0 ? messages.length : streaming;
  return [...messages.slice(0, index), message, ...messages.slice(index)];
}
