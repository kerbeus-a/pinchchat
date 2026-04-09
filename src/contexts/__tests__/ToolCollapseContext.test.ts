/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { ToolCollapseProvider, ToolCollapseContext } from '../ToolCollapseContext';

function useToolCollapseTest() {
  return useContext(ToolCollapseContext);
}

function wrapper({ children }: { children: ReactNode }) {
  return ToolCollapseProvider({ children });
}

describe('ToolCollapseContext', () => {
  it('starts with globalState "none" and version 0', () => {
    const { result } = renderHook(() => useToolCollapseTest(), { wrapper });
    expect(result.current.globalState).toBe('none');
    expect(result.current.version).toBe(0);
  });

  it('collapseAll sets state to "collapse-all" and increments version', () => {
    const { result } = renderHook(() => useToolCollapseTest(), { wrapper });
    act(() => result.current.collapseAll());
    expect(result.current.globalState).toBe('collapse-all');
    expect(result.current.version).toBe(1);
  });

  it('expandAll sets state to "expand-all" and increments version', () => {
    const { result } = renderHook(() => useToolCollapseTest(), { wrapper });
    act(() => result.current.expandAll());
    expect(result.current.globalState).toBe('expand-all');
    expect(result.current.version).toBe(1);
  });

  it('version increments on each toggle', () => {
    const { result } = renderHook(() => useToolCollapseTest(), { wrapper });
    act(() => result.current.collapseAll());
    act(() => result.current.expandAll());
    act(() => result.current.collapseAll());
    expect(result.current.version).toBe(3);
  });

  it('default context (no provider) has no-op functions', () => {
    const { result } = renderHook(() => useToolCollapseTest());
    expect(result.current.globalState).toBe('none');
    expect(result.current.version).toBe(0);
    // Should not throw
    act(() => result.current.collapseAll());
    act(() => result.current.expandAll());
  });
});
