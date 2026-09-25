/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandCenterBar } from '../CommandCenterBar';

void React;

const workspaces = [
  { id: 'tasterra' as const, label: 'TasTerra', description: 'Operations', ownerOnly: false },
  { id: 'home' as const, label: 'Home', description: 'Personal', ownerOnly: false },
];

describe('CommandCenterBar', () => {
  it('changes mode without changing workspace or source scope', () => {
    const update = vi.fn().mockResolvedValue(undefined);
    render(
      <CommandCenterBar
        workspaces={workspaces}
        scope={{ workspaceId: 'tasterra', mode: 'query', sourceIds: ['mail'], persisted: true }}
        sources={[]}
        health={{ label: 'No sources', status: 'unknown' }}
        loading={false}
        saving={false}
        error={null}
        evidenceOpen={false}
        onToggleEvidence={vi.fn()}
        onUpdateScope={update}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'action' }));
    expect(update).toHaveBeenCalledWith({ mode: 'action' });
  });

  it('requires confirmation before changing workspace', () => {
    const update = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <CommandCenterBar
        workspaces={workspaces}
        scope={{ workspaceId: 'tasterra', mode: 'query', sourceIds: [], persisted: true }}
        sources={[]}
        health={{ label: 'No sources', status: 'unknown' }}
        loading={false}
        saving={false}
        error={null}
        evidenceOpen={false}
        onToggleEvidence={vi.fn()}
        onUpdateScope={update}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Workspace' }), { target: { value: 'home' } });
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });
});
