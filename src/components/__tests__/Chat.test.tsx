/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ChatMessage } from '../../types';
import { Chat } from '../Chat';

vi.mock('../ChatMessage', () => ({
  ChatMessageComponent: ({ message }: { message: ChatMessage }) => <div>{message.content}</div>,
}));
vi.mock('../ChatInput', () => ({ ChatInput: () => <div data-testid="chat-input" /> }));
vi.mock('../TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('../MessageSearch', () => ({ MessageSearch: () => null }));
vi.mock('../../hooks/useBookmarks', () => ({
  useBookmarks: () => ({ toggle: vi.fn(), isBookmarked: () => false, getForSession: () => [] }),
}));
vi.mock('../../hooks/useToolCollapse', () => ({
  useToolCollapse: () => ({ globalState: 'collapse-all', collapseAll: vi.fn(), expandAll: vi.fn() }),
}));
vi.mock('../../hooks/useLocale', () => ({
  useT: () => (key: string) => ({
    'chat.messages': 'Chat messages',
    'chat.scrollToBottom': 'New messages',
    'chat.scrollDown': 'Scroll to bottom',
  }[key] ?? key),
}));

const makeMessage = (id: string): ChatMessage => ({
  id,
  role: 'assistant',
  content: `Message ${id}`,
  timestamp: 100 + Number(id),
  blocks: [{ type: 'text', text: `Message ${id}` }],
});

describe('Chat scroll retention', () => {
  it('does not jump to the bottom when history refresh finishes while reading older messages', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    const props = {
      isGenerating: false,
      status: 'connected' as const,
      sessionKey: 'session-1',
      onSend: vi.fn(),
      onAbort: vi.fn(),
    };
    const initial = [makeMessage('1'), makeMessage('2')];
    const view = render(<Chat {...props} messages={initial} isLoadingHistory={false} />);
    scrollIntoView.mockClear();

    const log = screen.getByRole('log', { name: 'Chat messages' });
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 2_000 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, writable: true, value: 400 },
    });
    fireEvent.scroll(log);

    view.rerender(<Chat {...props} messages={initial} isLoadingHistory />);
    view.rerender(<Chat {...props} messages={[...initial, makeMessage('3')]} isLoadingHistory={false} />);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'New messages' })).toBeDefined();
  });
});
