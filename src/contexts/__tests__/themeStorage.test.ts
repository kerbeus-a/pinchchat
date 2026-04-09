import { describe, it, expect, beforeEach } from 'vitest';
import { loadStored, STORAGE_KEY } from '../themeStorage';
import type { StoredTheme } from '../themeStorage';

const DEFAULTS: StoredTheme = {
  theme: 'dark',
  accent: 'cyan',
  uiFont: 'system',
  monoFont: 'jetbrains',
  uiFontSize: 15,
  monoFontSize: 14,
};

describe('themeStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadStored', () => {
    it('returns defaults when localStorage is empty', () => {
      expect(loadStored()).toEqual(DEFAULTS);
    });

    it('returns defaults when localStorage has invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json');
      expect(loadStored()).toEqual(DEFAULTS);
    });

    it('returns defaults when theme is invalid', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'neon', accent: 'cyan' }));
      expect(loadStored()).toEqual(DEFAULTS);
    });

    it('returns defaults when accent is invalid', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', accent: 'rainbow' }));
      expect(loadStored()).toEqual(DEFAULTS);
    });

    it('loads valid stored theme', () => {
      const stored = { theme: 'oled', accent: 'violet', uiFont: 'system', monoFont: 'jetbrains', uiFontSize: 16, monoFontSize: 13 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      expect(loadStored()).toEqual(stored);
    });

    it('loads all valid theme names', () => {
      for (const theme of ['dark', 'light', 'oled', 'system'] as const) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, accent: 'cyan' }));
        expect(loadStored().theme).toBe(theme);
      }
    });

    it('loads all valid accent colors', () => {
      for (const accent of ['cyan', 'violet', 'emerald', 'amber', 'rose', 'blue'] as const) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', accent }));
        expect(loadStored().accent).toBe(accent);
      }
    });

    it('clamps uiFontSize to [12, 20]', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', accent: 'cyan', uiFontSize: 5 }));
      expect(loadStored().uiFontSize).toBe(12);

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', accent: 'cyan', uiFontSize: 99 }));
      expect(loadStored().uiFontSize).toBe(20);
    });

    it('clamps monoFontSize to [12, 20]', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', accent: 'cyan', monoFontSize: 2 }));
      expect(loadStored().monoFontSize).toBe(12);

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', accent: 'cyan', monoFontSize: 50 }));
      expect(loadStored().monoFontSize).toBe(20);
    });

    it('defaults font sizes when not finite', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', accent: 'cyan', uiFontSize: 'big', monoFontSize: null }));
      const result = loadStored();
      expect(result.uiFontSize).toBe(15);
      expect(result.monoFontSize).toBe(14);
    });

    it('defaults unknown uiFont to system', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', accent: 'cyan', uiFont: 'comic-sans' }));
      expect(loadStored().uiFont).toBe('system');
    });

    it('defaults unknown monoFont to jetbrains', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', accent: 'cyan', monoFont: 'wingdings' }));
      expect(loadStored().monoFont).toBe('jetbrains');
    });

    it('handles localStorage.getItem throwing', () => {
      const orig = localStorage.getItem.bind(localStorage);
      localStorage.getItem = () => { throw new Error('denied'); };
      expect(loadStored()).toEqual(DEFAULTS);
      localStorage.getItem = orig;
    });
  });
});
