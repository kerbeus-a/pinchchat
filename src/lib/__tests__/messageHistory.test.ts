import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../types';
import { isSameMessageHistory } from '../messageHistory';

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
