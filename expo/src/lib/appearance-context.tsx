import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform, useColorScheme as useSystemColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';

import { Colors } from '@/constants/theme';
import { resolveScheme, type AppearancePreference, type ColorScheme } from '@/lib/appearance';
import { readAppearance, writeAppearance } from '@/lib/appearance-store';

type AppearanceValue = {
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => void;
  scheme: ColorScheme;
};

const AppearanceContext = createContext<AppearanceValue | null>(null);

function applyWebDocument(scheme: ColorScheme) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const root = document.documentElement;
  const body = document.body;
  root.style.colorScheme = scheme;
  body.style.background = Colors[scheme].background;
  body.style.color = Colors[scheme].text;
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme();
  const [preference, setPreferenceState] = useState(readAppearance);
  const scheme = resolveScheme(preference, system);

  const setPreference = useCallback((next: AppearancePreference) => {
    setPreferenceState(next);
    writeAppearance(next);
  }, []);

  useEffect(() => {
    // Own resolved scheme in React state; still nudge native chrome when possible.
    try {
      Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    } catch {
      // react-native-web may not implement setColorScheme.
    }
  }, [preference]);

  useEffect(() => {
    applyWebDocument(scheme);
    void SystemUI.setBackgroundColorAsync(Colors[scheme].background).catch(() => {});
  }, [scheme]);

  const value = useMemo<AppearanceValue>(
    () => ({ preference, setPreference, scheme }),
    [preference, setPreference, scheme],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (value === null) {
    throw new Error('useAppearance must be used within AppearanceProvider');
  }
  return value;
}

export function useColorScheme(): ColorScheme {
  return useAppearance().scheme;
}
