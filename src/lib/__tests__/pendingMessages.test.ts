// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readPendingMessages, writePendingMessages } from '../pendingMessages';
import { mergeHistoryWithOptimistic } from '../messageHistory';
import type { ChatMessage } from '../../types';

describe('unsent message recovery', () => {
  beforeEach(() => localStorage.clear());
  const message: ChatMessage = { id: 'user-1', role: 'user', content: 'test', timestamp: 1000, blocks: [{ type: 'text', text: 'test' }], sendStatus: 'sending' };
  it('recovers interrupted sends only in their own member and session', () => {
    writePendingMessages('yuri', 'one', [message]);
    expect(readPendingMessages('yuri', 'one')[0].sendStatus).toBe('error');
    expect(readPendingMessages('artem', 'one')).toEqual([]);
    expect(readPendingMessages('yuri', 'two')).toEqual([]);
    expect(mergeHistoryWithOptimistic(readPendingMessages('yuri', 'one'), [], Date.now())).toHaveLength(1);
  });
  it('removes a pending draft when durable history confirms delivery', () => {
    writePendingMessages('yuri', 'one', [message]);
    const recovered = readPendingMessages('yuri', 'one');
    const history = [{ ...message, id: 'server-1', sendStatus: undefined }];
    const merged = mergeHistoryWithOptimistic(recovered, history);
    writePendingMessages('yuri', 'one', merged);
    expect(merged).toEqual(history);
    expect(readPendingMessages('yuri', 'one')).toEqual([]);
  });
});
