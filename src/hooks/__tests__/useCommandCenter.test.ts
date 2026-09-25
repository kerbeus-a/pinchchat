/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
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
});
