import { describe, it, expect, beforeEach } from 'vitest';
import { loadStored, STORAGE_KEY } from '../themeStorage';


describe('ThemeContext loadStoredForTest', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns defaults when storage is empty', () => {
    expect(loadStored()).toEqual({
      theme: 'dark',
      accent: 'cyan',
      uiFont: 'system',
      monoFont: 'jetbrains',
      uiFontSize: 15,
      monoFontSize: 14,
    });
  });

  it('reads valid stored values and clamps sizes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: 'light',
      accent: 'rose',
      uiFont: 'inter',
      monoFont: 'fira',
      uiFontSize: 25,          // should clamp to 20
      monoFontSize: 10,        // should clamp to 12
    }));

    expect(loadStored()).toEqual({
      theme: 'light',
      accent: 'rose',
      uiFont: 'inter',
      monoFont: 'fira',
      uiFontSize: 20,
      monoFontSize: 12,
    });
  });

  it('falls back to defaults on invalid font keys', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      theme: 'dark',
      accent: 'cyan',
      uiFont: 'nonexistent',
      monoFont: 'nope',
      uiFontSize: 16,
      monoFontSize: 16,
    }));

    expect(loadStored().uiFont).toBe('system');
    expect(loadStored().monoFont).toBe('jetbrains');
  });
});
