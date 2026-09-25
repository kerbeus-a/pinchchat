import { describe, expect, it } from 'vitest';
import { appendBackgroundOutcome } from '../backgroundOutcome';
import type { ChatMessage } from '../../types';

describe('background result during foreground generation', () => {
  const streaming: ChatMessage = { id: 'live', role: 'assistant', content: 'Still checking', timestamp: 1,
    blocks: [{ type: 'text', text: 'Still checking' }], isStreaming: true, runId: 'foreground' };
  it('inserts the result without replacing or moving the active streaming tail', () => {
    const result = appendBackgroundOutcome([streaming], { id: '42', content: 'The full report is ready.', timestamp: 2 });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: '42', content: 'The full report is ready.' });
    expect(result[0]?.isStreaming).toBeUndefined();
    expect(result.at(-1)).toBe(streaming);
    expect(appendBackgroundOutcome(result, { id: '42', content: 'The full report is ready.', timestamp: 2 })).toBe(result);
  });
  it('refuses malformed content without losing foreground work', () => {
    const messages = [streaming];
    expect(appendBackgroundOutcome(messages, { id: '../x', content: '', timestamp: 2 })).toBe(messages);
    expect(messages[0]?.isStreaming).toBe(true);
  });
});
