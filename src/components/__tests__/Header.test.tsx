/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../Header';

void React;

describe('Header session title priority', () => {
  it('renders the active session name as the primary readable title', () => {
    render(
      <Header
        status="connected"
        sessionKey="agent:yuri:web:long"
        onToggleSidebar={vi.fn()}
        activeSessionData={{
          key: 'agent:yuri:web:long',
          label: 'Long active customer planning session that must stay readable',
          agentId: 'yuri',
          updatedAt: Date.now(),
        }}
        messages={[]}
        agentName="Kerbeus"
        isAdmin
      />,
    );

    const title = screen.getByTestId('active-session-title');
    expect(title.textContent).toContain('Long active customer planning session');
    expect(title.className).toContain('font-semibold');
    expect(title.className).toContain('truncate');
  });
});
