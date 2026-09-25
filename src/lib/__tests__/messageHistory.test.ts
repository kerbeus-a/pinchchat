import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../types';
import { isSameMessageHistory, mergeHistoryWithOptimistic } from '../messageHistory';

const message: ChatMessage = {
  id: 'm1',
  role: 'assistant',
  content: 'Done',
  timestamp: 100,
  blocks: [{ type: 'text', text: 'Done' }],
};

describe('isSameMessageHistory', () => {
  it('ignores client-only generation metadata during a background refresh', () => {
    expect(isSameMessageHistory(
      [{ ...message, generationTimeMs: 450, sendStatus: 'sent' }],
      [{ ...message }],
    )).toBe(true);
  });

  it('detects a server-backed message change', () => {
    expect(isSameMessageHistory(
      [{ ...message }],
      [{ ...message, content: 'Updated', blocks: [{ type: 'text', text: 'Updated' }] }],
    )).toBe(false);
  });
});

describe('mergeHistoryWithOptimistic', () => {
  const optimistic: ChatMessage = {
    id: 'user-local',
    role: 'user',
    content: 'Please check this invoice',
    timestamp: 1_700_000_000_000,
    blocks: [{ type: 'text', text: 'Please check this invoice' }],
    sendStatus: 'sent',
  };

  it('keeps a submitted message while the server history is catching up', () => {
    expect(mergeHistoryWithOptimistic([], [], 1_700_000_000_000)).toEqual([]);
    expect(mergeHistoryWithOptimistic([optimistic], [message], 1_700_000_001_000))
      .toEqual([message, optimistic]);
  });

  it('replaces the optimistic copy with the durable server message', () => {
    const durable = { ...optimistic, id: 'server-42', timestamp: 1_700_000_000_500, sendStatus: undefined };
    expect(mergeHistoryWithOptimistic([optimistic], [durable], 1_700_000_001_000)).toEqual([durable]);
  });

  it('does not preserve stale optimistic messages forever', () => {
    expect(mergeHistoryWithOptimistic(
      [optimistic],
      [message],
      optimistic.timestamp + 5 * 60 * 1000 + 1,
    )).toEqual([message]);
  });
});
