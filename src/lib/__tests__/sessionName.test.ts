import { describe, it, expect } from 'vitest';
import { sessionDisplayName, extractAgentIdFromKey, formatAgentId } from '../sessionName';
import type { Session } from '../../types';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    key: 'agent:main:test',
    kind: 'main',
    channel: '',
    lastActivity: Date.now(),
    ...overrides,
  } as Session;
}

describe('sessionDisplayName', () => {
  it('prefers the authoritative Telegram topic name over the session label', () => {
    expect(sessionDisplayName(makeSession({
      topicName: 'TasTerra Sales',
      label: 'First quote request',
    }))).toBe('TasTerra Sales');
  });

  it('returns label when set', () => {
    expect(sessionDisplayName(makeSession({ label: 'My Task' }))).toBe('My Task');
  });

  it('returns "Main" for main sessions without channel', () => {
    expect(sessionDisplayName(makeSession({ kind: 'main', channel: '' }))).toBe('Main');
  });

  it('returns "Main · Discord" for main sessions with channel', () => {
    expect(sessionDisplayName(makeSession({ kind: 'main', channel: 'discord' }))).toBe('Main · Discord');
  });

  it('returns "Cron" for cron sessions without channel', () => {
    expect(sessionDisplayName(makeSession({ kind: 'cron', channel: '' }))).toBe('Cron');
  });

  it('returns "Cron · Telegram" for cron sessions with channel', () => {
    expect(sessionDisplayName(makeSession({ kind: 'cron', channel: 'telegram' }))).toBe('Cron · Telegram');
  });

  it('returns "Task · Discord" for isolated sessions', () => {
    expect(sessionDisplayName(makeSession({ kind: 'isolated', channel: 'discord' }))).toBe('Task · Discord');
  });

  it('returns capitalized channel as fallback', () => {
    expect(sessionDisplayName(makeSession({ kind: undefined as unknown as string, channel: 'slack' } as Partial<Session>))).toBe('Slack');
  });

  it('truncates UUID session keys', () => {
    const name = sessionDisplayName(makeSession({
      kind: undefined as unknown as string,
      channel: '',
      key: 'agent:main:a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    } as Partial<Session>));
    expect(name).toBe('a1b2c3d4…');
  });

  it('strips agent prefix from non-UUID keys', () => {
    const name = sessionDisplayName(makeSession({
      kind: undefined as unknown as string,
      channel: '',
      key: 'agent:bot:mycustomkey',
    } as Partial<Session>));
    expect(name).toBe('mycustomkey');
  });
});

describe('extractAgentIdFromKey', () => {
  it('extracts agent id from a standard key', () => {
    expect(extractAgentIdFromKey('agent:my-bot:abc123')).toBe('my-bot');
  });

  it('returns undefined for keys without agent prefix', () => {
    expect(extractAgentIdFromKey('some-random-key')).toBeUndefined();
  });

  it('handles UUIDs as agent ids', () => {
    expect(extractAgentIdFromKey('agent:a1b2c3d4-e5f6-7890-abcd-ef1234567890:session')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });
});

describe('formatAgentId', () => {
  it('formats a kebab-case id', () => {
    expect(formatAgentId('my-cool-bot')).toBe('My Cool Bot');
  });

  it('formats a snake_case id', () => {
    expect(formatAgentId('my_cool_bot')).toBe('My Cool Bot');
  });

  it('formats mixed separators', () => {
    expect(formatAgentId('my-cool_bot')).toBe('My Cool Bot');
  });

  it('returns undefined for UUIDs', () => {
    expect(formatAgentId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBeUndefined();
  });

  it('formats a single word', () => {
    expect(formatAgentId('main')).toBe('Main');
  });
});
