/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCommandCenter } from '../useCommandCenter';
import type { CommandCenterSend } from '../../lib/commandCenter';

describe('useCommandCenter', () => {
  it('loads public scope without requesting private sources for a LAN session', async () => {
    const send = vi.fn(async (method: string) => {
      if (method === 'workspaces.list') {
        return { workspaces: [{ id: 'tasterra', label: 'TasTerra', description: 'Operations', ownerOnly: false }] };
      }
      if (method === 'session.scope.get') {
        return { scope: { workspaceId: 'tasterra', mode: 'query', sourceIds: [], persisted: true } };
      }
      throw new Error(`Unexpected private request: ${method}`);
    }) as unknown as CommandCenterSend;

    const { result } = renderHook(() => useCommandCenter(send, 'session-1', true, false));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.scope).toMatchObject({ workspaceId: 'tasterra', mode: 'query' });
    expect(result.current.sources).toEqual([]);
    expect(send).not.toHaveBeenCalledWith('sources.list', expect.anything());
    expect(send).not.toHaveBeenCalledWith('evidence.list', expect.anything());
  });

  it('loads the session instructions and refreshes them when the mode changes', async () => {
    let mode = 'query';
    const send = vi.fn(async (method: string) => {
      if (method === 'workspaces.list') {
        return { workspaces: [{ id: 'tasterra', label: 'TasTerra', description: 'Operations', ownerOnly: false }] };
      }
      if (method === 'session.scope.get') {
        return { scope: { workspaceId: 'tasterra', mode, sourceIds: [], persisted: true } };
      }
      if (method === 'sources.list') return { sources: [] };
      if (method === 'evidence.list') return { evidence: [] };
      if (method === 'session.context.get') {
        return { context: { systemPrompt: `Instructions for ${mode}`, historyMode: 'runner-managed' } };
      }
      if (method === 'session.scope.set') {
        mode = 'action';
        return { scope: { workspaceId: 'tasterra', mode, sourceIds: [], persisted: true } };
      }
      throw new Error(`Unexpected request: ${method}`);
    }) as unknown as CommandCenterSend;

    const { result } = renderHook(() => useCommandCenter(send, 'session-1', true, true));
    await waitFor(() => expect(result.current.sessionContext?.systemPrompt).toBe('Instructions for query'));

    await act(async () => {
      await result.current.updateScope({ mode: 'action' });
    });

    expect(result.current.sessionContext?.systemPrompt).toBe('Instructions for action');
    expect(send).toHaveBeenCalledTimes(7);
  });

  it('keeps session context when private source requests are unavailable', async () => {
    const send = vi.fn(async (method: string) => {
      if (method === 'workspaces.list') {
        return { workspaces: [{ id: 'tasterra', label: 'TasTerra', description: 'Operations', ownerOnly: false }] };
      }
      if (method === 'session.scope.get') {
        return { scope: { workspaceId: 'tasterra', mode: 'query', sourceIds: [], persisted: true } };
      }
      if (method === 'sources.list' || method === 'evidence.list') {
        throw new Error('Private source token required');
      }
      if (method === 'session.context.get') {
        return { context: { systemPrompt: 'Live session instructions', historyMode: 'runner-managed' } };
      }
      throw new Error(`Unexpected request: ${method}`);
    }) as unknown as CommandCenterSend;

    const { result } = renderHook(() => useCommandCenter(send, 'session-1', true, true));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessionContext?.systemPrompt).toBe('Live session instructions');
    expect(result.current.sources).toEqual([]);
    expect(result.current.evidence).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
