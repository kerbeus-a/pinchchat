import { createContext } from 'react';

export type ThemeName = 'dark' | 'light' | 'oled' | 'system';
export type AccentColor = 'cyan' | 'violet' | 'emerald' | 'amber' | 'rose' | 'blue';
export type UiFont = 'system' | 'inter' | 'segoe' | 'sf';
export type MonoFont = 'jetbrains' | 'fira' | 'cascadia' | 'system-mono';

export const uiFontStacks: Record<UiFont, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  inter: "'Inter', 'Segoe UI', system-ui, sans-serif",
  segoe: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
  sf: "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
};

export const monoFontStacks: Record<MonoFont, string> = {
  jetbrains: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fira: "'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  cascadia: "'Cascadia Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  'system-mono': "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

export interface ThemeContextValue {
  theme: ThemeName;
  accent: AccentColor;
  uiFont: UiFont;
  monoFont: MonoFont;
  uiFontSize: number;
  monoFontSize: number;
  /** Resolved concrete theme (never 'system'). */
  resolvedTheme: 'dark' | 'light' | 'oled';
  setTheme: (t: ThemeName) => void;
  setAccent: (a: AccentColor) => void;
  setUiFont: (f: UiFont) => void;
  setMonoFont: (f: MonoFont) => void;
  setUiFontSize: (size: number) => void;
  setMonoFontSize: (size: number) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  accent: 'cyan',
  uiFont: 'system',
  monoFont: 'jetbrains',
  uiFontSize: 15,
  monoFontSize: 14,
  resolvedTheme: 'dark',
  setTheme: () => {},
  setAccent: () => {},
  setUiFont: () => {},
  setMonoFont: () => {},
  setUiFontSize: () => {},
  setMonoFontSize: () => {},
});
