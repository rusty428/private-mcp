import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

const STORAGE_KEY = 'privatemcp-demo-mode';

interface DemoContextValue {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
}

const DemoContext = createContext<DemoContextValue>({ isDemoMode: false, toggleDemoMode: () => {} });

export function DemoProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((prev) => {
      const next = !prev;
      if (next) {
        localStorage.setItem(STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
      return next;
    });
  }, []);

  return <DemoContext.Provider value={{ isDemoMode, toggleDemoMode }}>{children}</DemoContext.Provider>;
}

export function useDemoMode() {
  return useContext(DemoContext);
}
