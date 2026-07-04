/**
 * @vitest-environment jsdom
 *
 * Tests for the channel chip in the session sidebar.
 *
 * The chip shows where a session lives (DM / Group / Group topic 30 / Web)
 * without eating the title column. These tests target the rendering layer:
 *   - chip appears only when channel is set
 *   - it is rendered as plain text (React escapes HTML — no XSS)
 *   - overlong channel strings don't break layout (truncation / shrink-0)
 *   - empty / whitespace-only channel is treated as absent
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
  it('renders the chip when session.channel is set', () => {
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          { key: 'sess-1', label: 'hello kerbeus', channel: 'Group topic 30', updatedAt: Date.now() },
        ]}
      />,
    );
    expect(screen.getByLabelText('channel: Group topic 30')).toBeDefined();
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
    expect(screen.getByLabelText('channel: Group topic 30')).toBeDefined();
    expect(screen.getByText(/four \(no channel\)/)).toBeDefined();
    // Only 3 chips total — the 4th session has no chip.
    expect(screen.queryAllByLabelText(/^channel:/).length).toBe(3);
  });

  it('absurdly long channel string is rendered but the chip has shrink-0 to protect layout', () => {
    const huge = 'A'.repeat(500);
    render(
      <Sidebar
        {...baseProps()}
        sessions={[
          { key: 's1', label: 'big', channel: huge, updatedAt: Date.now() },
        ]}
      />,
    );
    // The chip element has shrink-0 — React renders the text but layout
    // protection is on the span class. This test guards against a regression
    // where someone removes the shrink-0 / class and the title gets pushed off.
    const chip = screen.getByLabelText(`channel: ${huge}`);
    expect(chip.className).toContain('shrink-0');
    expect(chip.className).toContain('text-[9px]');
  });
});
