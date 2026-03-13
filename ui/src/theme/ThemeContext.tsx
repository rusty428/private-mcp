import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { Mode, applyMode } from '@cloudscape-design/global-styles';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  resolvedMode: Mode;
}

const STORAGE_KEY = 'theme-preference';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveMode(preference: ThemePreference, systemDark: boolean): Mode {
  if (preference === 'system') return systemDark ? Mode.Dark : Mode.Light;
  return preference === 'dark' ? Mode.Dark : Mode.Light;
}

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getSavedPreference(): ThemePreference {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getSavedPreference);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  const resolved = resolveMode(preference, systemDark);

  const setPreference = useCallback((pref: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, pref);
    setPreferenceState(pref);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    applyMode(resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ preference, setPreference, resolvedMode: resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
