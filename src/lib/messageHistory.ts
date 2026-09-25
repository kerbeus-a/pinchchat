import type { ChatMessage } from '../types';

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
