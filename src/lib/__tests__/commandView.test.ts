import { describe, expect, it } from 'vitest';
import { commandViewFromHash, shouldClearCommandHashForSessionSwitch, shouldReturnToChatOnSessionSwitch } from '../commandView';

describe('command view routing', () => {
  it('maps command hashes to command views', () => {
    expect(commandViewFromHash('#swarm')).toBe('swarm');
    expect(commandViewFromHash('#gm')).toBe('gm');
    expect(commandViewFromHash('')).toBe('chat');
    expect(commandViewFromHash('#anything-else')).toBe('chat');
  });

  it('clears command hashes when selecting a normal session', () => {
    expect(shouldClearCommandHashForSessionSwitch('#swarm')).toBe(true);
    expect(shouldClearCommandHashForSessionSwitch('#gm')).toBe(true);
    expect(shouldClearCommandHashForSessionSwitch('')).toBe(false);
    expect(shouldClearCommandHashForSessionSwitch('#session=abc')).toBe(false);
  });

  it('returns to chat from command views even after auto-connect strips the hash', () => {
    expect(shouldReturnToChatOnSessionSwitch('swarm', '')).toBe(true);
    expect(shouldReturnToChatOnSessionSwitch('gm', '')).toBe(true);
    expect(shouldReturnToChatOnSessionSwitch('chat', '')).toBe(false);
  });
});
