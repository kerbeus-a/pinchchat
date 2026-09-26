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
        actionAvailable={true}
        onToggleEvidence={vi.fn()}
        onRequestActionAccess={vi.fn()}
        onUpdateScope={update}
        onCreateWorkspace={vi.fn()}
        onUpdateWorkspace={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'action' }));
    expect(update).toHaveBeenCalledWith({ mode: 'action' });
  });

  it('requires confirmation before changing workspace', () => {
    const update = vi.fn().mockResolvedValue(undefined);
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
        actionAvailable={true}
        onToggleEvidence={vi.fn()}
        onRequestActionAccess={vi.fn()}
        onUpdateScope={update}
        onCreateWorkspace={vi.fn()}
        onUpdateWorkspace={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Workspace' }), { target: { value: 'home' } });
    expect(screen.getByRole('dialog', { name: 'Move conversation' })).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel move' }));
    expect(screen.queryByRole('dialog', { name: 'Move conversation' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Workspace' }), { target: { value: 'home' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move conversation' }));
    expect(update).toHaveBeenCalledWith({ workspaceId: 'home' });
  });

  it('requests authentication instead of changing to Action mode when locked', () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const requestAccess = vi.fn();
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
        actionAvailable={false}
        onToggleEvidence={vi.fn()}
        onRequestActionAccess={requestAccess}
        onUpdateScope={update}
        onCreateWorkspace={vi.fn()}
        onUpdateWorkspace={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /action/i }));
    expect(requestAccess).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
  });
});
