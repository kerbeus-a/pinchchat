/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { LoginScreen } from '../LoginScreen';

void React;

describe('LoginScreen LAN no-auth startup', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/kinchat');
  });

  it('auto-connects same-origin /kinchat without requiring a token', async () => {
    const onConnect = vi.fn();

    render(<LoginScreen onConnect={onConnect} isConnecting={false} />);

    await waitFor(() => {
      expect(onConnect).toHaveBeenCalledWith(`${window.location.origin}/kinchat/v1`, undefined);
    });
  });

  it('does not auto-connect a hash-supplied bridge without a token', async () => {
    window.history.replaceState({}, '', '/kinchat#bridge=http%3A%2F%2F192.168.1.99%3A3142%2Fkinchat%2Fv1');
    const onConnect = vi.fn();

    render(<LoginScreen onConnect={onConnect} isConnecting={false} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onConnect).not.toHaveBeenCalled();
  });

  it.each(['processing', 'system', 'gm'])('preserves the %s view during LAN login', async (view) => {
    window.history.replaceState({}, '', `/kinchat#${view}`);
    const onConnect = vi.fn();
    render(<LoginScreen onConnect={onConnect} isConnecting={false} />);
    await waitFor(() => expect(onConnect).toHaveBeenCalled());
    expect(window.location.hash).toBe(`#${view}`);
  });

  it('still removes a token from the URL after connecting', async () => {
    window.history.replaceState({}, '', '/kinchat#token=synthetic-only');
    const onConnect = vi.fn();
    render(<LoginScreen onConnect={onConnect} isConnecting={false} />);
    await waitFor(() => expect(onConnect).toHaveBeenCalledWith(`${window.location.origin}/kinchat/v1`, 'synthetic-only'));
    expect(window.location.hash).toBe('');
  });
});
