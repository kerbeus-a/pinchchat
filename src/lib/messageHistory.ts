import type { ChatMessage } from '../types';

const OPTIMISTIC_MESSAGE_TTL_MS = 5 * 60 * 1000;
const SERVER_MATCH_WINDOW_MS = 2 * 60 * 1000;

function timestampMs(message: ChatMessage): number {
  return message.timestamp < 10_000_000_000 ? message.timestamp * 1000 : message.timestamp;
}

/** Keep optimistic user messages visible until their durable history row arrives. */
export function mergeHistoryWithOptimistic(
  current: ChatMessage[],
  incoming: ChatMessage[],
  now = Date.now(),
): ChatMessage[] {
  const optimistic = current.filter((message) => (
    message.role === 'user'
    && message.sendStatus !== undefined
    && now - timestampMs(message) <= OPTIMISTIC_MESSAGE_TTL_MS
  ));
  if (optimistic.length === 0) return incoming;

  const claimed = new Set<number>();
  const unmatched = optimistic.filter((local) => {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    incoming.forEach((server, index) => {
      if (claimed.has(index) || server.role !== 'user' || server.content !== local.content) return;
      const distance = Math.abs(timestampMs(server) - timestampMs(local));
      if (distance <= SERVER_MATCH_WINDOW_MS && distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    });
    if (bestIndex < 0) return true;
    claimed.add(bestIndex);
    return false;
  });

  if (unmatched.length === 0) return incoming;
  return [...incoming, ...unmatched]
    .map((message, index) => ({ message, index }))
    .sort((a, b) => timestampMs(a.message) - timestampMs(b.message) || a.index - b.index)
    .map(({ message }) => message);
}

/** Compare server-backed message fields while ignoring local rendering metadata. */
export function isSameMessageHistory(current: ChatMessage[], incoming: ChatMessage[]): boolean {
  if (current.length !== incoming.length) return false;

  return current.every((message, index) => {
    const next = incoming[index];
    return message.id === next.id
      && message.role === next.role
      && message.content === next.content
      && message.timestamp === next.timestamp
      && message.isSystemEvent === next.isSystemEvent
      && message.isArchived === next.isArchived
      && message.isCompactionSeparator === next.isCompactionSeparator
      && JSON.stringify(message.blocks) === JSON.stringify(next.blocks)
      && JSON.stringify(message.metadata) === JSON.stringify(next.metadata);
  });
}
