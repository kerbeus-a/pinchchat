import { describe, it, expect, beforeEach } from 'vitest';
import {
  PINNED_KEY, WIDTH_KEY, ORDER_KEY, NAMES_KEY,
  MIN_WIDTH, MAX_WIDTH, DEFAULT_WIDTH,
  getCustomNames, saveCustomNames,
  sessionCategory, getAvailableCategories, categoryLabel,
  getSavedWidth, getPinnedSessions, savePinnedSessions,
  getSavedOrder, saveOrder,
} from '../sidebarStorage';
import type { Session } from '../../types';

function makeSession(key: string, channel?: string): Session {
  return { key, channel } as Session;
}

beforeEach(() => localStorage.clear());

describe('custom names', () => {
  it('returns empty object when nothing stored', () => {
    expect(getCustomNames()).toEqual({});
  });

  it('round-trips names', () => {
    const names = { 'sess-1': 'My Chat', 'sess-2': 'Work' };
    saveCustomNames(names);
    expect(getCustomNames()).toEqual(names);
  });

  it('returns empty object on corrupt JSON', () => {
    localStorage.setItem(NAMES_KEY, '{bad');
    expect(getCustomNames()).toEqual({});
  });
});

describe('sessionCategory', () => {
  it('detects cron sessions', () => {
    expect(sessionCategory(makeSession('abc:cron:123'))).toBe('cron');
  });

  it('detects spawn agent sessions', () => {
    expect(sessionCategory(makeSession('abc:spawn:456'))).toBe('agent');
  });

  it('detects sub agent sessions', () => {
    expect(sessionCategory(makeSession('abc:sub:789'))).toBe('agent');
  });

  it('uses channel name when not webchat', () => {
    expect(sessionCategory(makeSession('sess-1', 'Discord'))).toBe('discord');
    expect(sessionCategory(makeSession('sess-2', 'Telegram'))).toBe('telegram');
  });

  it('returns other for webchat channel', () => {
    expect(sessionCategory(makeSession('sess-1', 'webchat'))).toBe('other');
  });

  it('returns other when no channel', () => {
    expect(sessionCategory(makeSession('sess-1'))).toBe('other');
  });
});

describe('getAvailableCategories', () => {
  it('returns sorted unique categories', () => {
    const sessions = [
      makeSession('a:cron:1'),
      makeSession('b', 'Discord'),
      makeSession('c:spawn:2'),
      makeSession('d', 'webchat'),
      makeSession('e:cron:3'),
    ];
    expect(getAvailableCategories(sessions)).toEqual(['agent', 'cron', 'discord', 'other']);
  });

  it('returns empty for no sessions', () => {
    expect(getAvailableCategories([])).toEqual([]);
  });
});

describe('categoryLabel', () => {
  it('returns known labels', () => {
    expect(categoryLabel('cron')).toBe('Cron');
    expect(categoryLabel('agent')).toBe('Agents');
    expect(categoryLabel('other')).toBe('Chat');
  });

  it('capitalizes unknown categories', () => {
    expect(categoryLabel('discord')).toBe('Discord');
    expect(categoryLabel('telegram')).toBe('Telegram');
  });
});

describe('sidebar width', () => {
  it('returns default when nothing stored', () => {
    expect(getSavedWidth()).toBe(DEFAULT_WIDTH);
  });

  it('returns stored value within bounds', () => {
    localStorage.setItem(WIDTH_KEY, '350');
    expect(getSavedWidth()).toBe(350);
  });

  it('returns default for out-of-range value (too small)', () => {
    localStorage.setItem(WIDTH_KEY, '100');
    expect(getSavedWidth()).toBe(DEFAULT_WIDTH);
  });

  it('returns default for out-of-range value (too large)', () => {
    localStorage.setItem(WIDTH_KEY, '999');
    expect(getSavedWidth()).toBe(DEFAULT_WIDTH);
  });

  it('accepts boundary values', () => {
    localStorage.setItem(WIDTH_KEY, String(MIN_WIDTH));
    expect(getSavedWidth()).toBe(MIN_WIDTH);
    localStorage.setItem(WIDTH_KEY, String(MAX_WIDTH));
    expect(getSavedWidth()).toBe(MAX_WIDTH);
  });
});

describe('pinned sessions', () => {
  it('returns empty set when nothing stored', () => {
    expect(getPinnedSessions()).toEqual(new Set());
  });

  it('round-trips pinned sessions', () => {
    const pinned = new Set(['sess-1', 'sess-2']);
    savePinnedSessions(pinned);
    expect(getPinnedSessions()).toEqual(pinned);
  });

  it('returns empty set on corrupt JSON', () => {
    localStorage.setItem(PINNED_KEY, 'nope');
    expect(getPinnedSessions()).toEqual(new Set());
  });
});

describe('session order', () => {
  it('returns empty array when nothing stored', () => {
    expect(getSavedOrder()).toEqual([]);
  });

  it('round-trips order', () => {
    const order = ['sess-3', 'sess-1', 'sess-2'];
    saveOrder(order);
    expect(getSavedOrder()).toEqual(order);
  });

  it('returns empty array on corrupt JSON', () => {
    localStorage.setItem(ORDER_KEY, '!!!');
    expect(getSavedOrder()).toEqual([]);
  });
});
