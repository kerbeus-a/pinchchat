/**
 * @vitest-environment jsdom
 *
 * Tests for the channel chip in the session sidebar.
 *
 * The title gets the complete first row. Context and controls sit below it,
 * so a Telegram topic name is the strongest label in the list. These tests:
 *   - chip appears only when channel is set
 *   - it is rendered as plain text (React escapes HTML — no XSS)
 *   - overlong channel strings don't break layout (truncation / shrink-0)
 *   - empty / whitespace-only channel is treated as absent
 */
import React from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// matchMedia polyfill — Sidebar module reads it at module scope (PWA install hook).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// i18n stub: react-i18next isn't running in test mode, so t() returns the key.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const { Sidebar } = await import('../Sidebar');

function baseProps() {
  return {
    activeSession: '',
    onSwitch: vi.fn(),
    onDelete: vi.fn(),
    onSplit: vi.fn(),
    splitSession: null,
    open: true,
    onClose: vi.fn(),
    onRename: vi.fn(),
    onNewSession: vi.fn().mockResolvedValue(undefined),
    onNewSessionForAgent: vi.fn().mockResolvedValue(undefined),
    onToast: vi.fn(),
    isAdmin: false,
    agents: [],
  };
}

describe('Sidebar channel chip', () => {
  beforeEach(() => {
    localStorage.removeItem('pinchchat-workspace-filter');
  });

  it('filters conversations by workspace without treating all workspaces as an assignment', () => {
    render(
      <Sidebar
        {...baseProps()}
        workspaces={[
          { id: 'tasterra', label: 'TasTerra', description: '', ownerOnly: false },
          { id: 'home', label: 'Home', description: '', ownerOnly: false },
        ]}
        sessions={[
          { key: 'work', label: 'Work conversation', workspaceId: 'tasterra' },
          { key: 'house', label: 'Home conversation', workspaceId: 'home' },
        ]}
      />,
    );
    const filter = screen.getByRole('combobox', { name: 'Workspace filter' });
    expect(screen.getByRole('option', { name: 'All workspaces' })).toBeDefined();
    fireEvent.change(filter, { target: { value: 'home' } });
    expect(screen.getByText('Home conversation')).toBeDefined();
    expect(screen.queryByText('Work conversation')).toBeNull();
  });

  it('does not render a numbered channel chip for a Telegram topic', () => {
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          { key: 'sess-1', label: 'hello kerbeus', channel: 'Group topic 30', updatedAt: Date.now() },
        ]}
      />,
    );
    expect(screen.queryByLabelText('channel: Group topic 30')).toBeNull();
    expect(screen.getByText(/hello kerbeus/)).toBeDefined();
  });

  it('does NOT render any chip when channel is absent', () => {
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          { key: 'sess-1', label: 'no channel here', updatedAt: Date.now() },
        ]}
      />,
    );
    expect(screen.queryByLabelText(/^channel:/)).toBeNull();
    expect(screen.getByText('no channel here')).toBeDefined();
  });

  it('does NOT render a chip when channel is an empty string', () => {
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          { key: 'sess-1', label: 'empty channel', channel: '', updatedAt: Date.now() },
        ]}
      />,
    );
    expect(screen.queryByLabelText(/^channel:/)).toBeNull();
  });

  it('escapes HTML / XSS payloads in the channel field (React text node)', () => {
    const evilChannel = '<img src=x onerror=alert(1)>';
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          { key: 'sess-1', label: 'safe', channel: evilChannel, updatedAt: Date.now() },
        ]}
      />,
    );
    // React renders the channel as a text node — never as parsed HTML. We
    // verify by reading the chip's textContent and confirming the chip span
    // has zero element children (only the literal text).
    const chip = screen.getByLabelText(`channel: ${evilChannel}`);
    expect(chip.textContent).toBe(evilChannel);
    expect(chip.children.length).toBe(0);
    // Inner HTML inside the chip MUST be the escaped form, not a real img.
    expect(chip.innerHTML).toContain('&lt;img');
    expect(chip.innerHTML).not.toContain('<img');
  });

  it('renders multiple sessions with distinct channels independently', () => {
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          { key: 's1', label: 'one', channel: 'DM',                   updatedAt: Date.now() },
          { key: 's2', label: 'two', channel: 'Group',                updatedAt: Date.now() - 1000 },
          { key: 's3', label: 'three', channel: 'Group topic 30',     updatedAt: Date.now() - 2000 },
          { key: 's4', label: 'four (no channel)',                    updatedAt: Date.now() - 3000 },
        ]}
      />,
    );
    expect(screen.getByLabelText('channel: DM')).toBeDefined();
    expect(screen.getByLabelText('channel: Group')).toBeDefined();
    expect(screen.queryByLabelText('channel: Group topic 30')).toBeNull();
    expect(screen.getByText(/four \(no channel\)/)).toBeDefined();
    // Topic numbers and sessions without channels do not consume metadata space.
    expect(screen.queryAllByLabelText(/^channel:/).length).toBe(2);
  });

  it('absurdly long channel string is constrained below the title', () => {
    const huge = 'A'.repeat(500);
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          { key: 's1', label: 'big', channel: huge, updatedAt: Date.now() },
        ]}
      />,
    );
    // The metadata chip has its own width cap and cannot consume the title row.
    const chip = screen.getByLabelText(`channel: ${huge}`);
    expect(chip.className).toContain('shrink-0');
    expect(chip.className).toContain('max-w-[96px]');
    expect(chip.className).toContain('text-[9px]');
  });

  it('shows context usage only when a real token count is available', () => {
    const { rerender } = render(
      <Sidebar
        {...baseProps()}
        sessions={[{
          key: 'no-usage',
          label: 'No usage data',
          contextTokens: 100_000,
          updatedAt: Date.now(),
        }]}
      />,
    );

    expect(screen.queryByText('0%')).toBeNull();

    rerender(
      <Sidebar
        {...baseProps()}
        sessions={[{
          key: 'tiny-usage',
          label: 'Tiny usage value',
          totalTokens: 500,
          contextTokens: 100_000,
          updatedAt: Date.now(),
        }]}
      />,
    );

    expect(screen.queryByText('1%')).toBeNull();

    rerender(
      <Sidebar
        {...baseProps()}
        sessions={[{
          key: 'real-usage',
          label: 'Real usage data',
          totalTokens: 25_000,
          contextTokens: 100_000,
          updatedAt: Date.now(),
        }]}
      />,
    );

    expect(screen.getByText('25%')).toBeDefined();
  });

  it('keeps the session title separate from row action tools', () => {
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          {
            key: 's1',
            label: 'Long customer planning thread that must remain readable',
            channel: 'Web',
            messageCount: 42,
            updatedAt: Date.now(),
          },
        ]}
      />,
    );

    const title = screen.getByTestId('session-title-s1');
    const titleRow = screen.getByTestId('session-title-row-s1');
    const metaRow = screen.getByTestId('session-meta-row-s1');
    const actions = screen.getByTestId('session-actions-s1');

    expect(title.textContent).toContain('Long customer planning thread');
    expect(title.className).toContain('font-medium');
    expect(titleRow.contains(screen.getByLabelText('channel: Web'))).toBe(false);
    expect(metaRow.contains(screen.getByLabelText('channel: Web'))).toBe(true);
    expect(titleRow.contains(actions)).toBe(false);
    expect(metaRow.contains(actions)).toBe(true);
    expect(actions.className).toContain('ml-auto');
    expect(actions.className).toContain('justify-end');
  });

  it('keeps a Telegram topic name authoritative and removes local rename controls', () => {
    render(
      <Sidebar
        {...baseProps()}
        sessions={[{
          key: 'topic-session',
          label: 'First message preview',
          topicName: 'TasTerra Sales',
          channel: 'Group topic 27',
          updatedAt: Date.now(),
        }]}
      />,
    );

    expect(screen.getByTestId('session-title-topic-session').textContent).toBe('TasTerra Sales');
    expect(screen.queryByLabelText('channel: Group topic 27')).toBeNull();
    expect(screen.queryByLabelText('sidebar.rename')).toBeNull();
  });

  it('keeps older topic sessions out of the main list and available in Archive', () => {
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          {
            key: 'current-topic-session',
            label: 'TasTerra Sales',
            topicName: 'TasTerra Sales',
            channel: 'Group topic 27',
            updatedAt: Date.now(),
          },
          {
            key: 'old-topic-session',
            label: 'TasTerra Sales',
            topicName: 'TasTerra Sales',
            channel: 'Group topic 27',
            archived: true,
            updatedAt: Date.now() - 1000,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('session-title-current-topic-session')).toBeDefined();
    expect(screen.queryByTestId('session-title-old-topic-session')).toBeNull();
    expect(screen.getByRole('button', { name: 'Current' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(screen.queryByTestId('session-title-current-topic-session')).toBeNull();
    expect(screen.getByTestId('session-title-old-topic-session').textContent).toBe('TasTerra Sales');
    expect(screen.getByRole('button', { name: 'Archive' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Active' })).toBeNull();
  });
});
