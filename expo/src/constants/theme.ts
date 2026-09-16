import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#17171a',
    background: '#f7f7f8',
    backgroundElement: '#ffffff',
    backgroundSelected: 'rgba(104, 82, 219, 0.12)',
    textSecondary: '#6f6f78',
    sidebar: '#f0f0f2',
    line: '#dedee3',
    lineStrong: '#c8c8cf',
    accent: '#8b7cf6',
    danger: '#f85149',
    success: '#3fb950',
    subtleHover: 'rgba(23, 23, 26, 0.05)',
  },
  dark: {
    text: '#ffffff',
    background: '#181818',
    backgroundElement: '#1c1c1c',
    backgroundSelected: 'rgba(139, 124, 246, 0.16)',
    textSecondary: '#8e8e8e',
    sidebar: '#121212',
    line: '#2a2a2a',
    lineStrong: '#3a3a3a',
    accent: '#8b7cf6',
    danger: '#f85149',
    success: '#3fb950',
    subtleHover: 'rgba(255, 255, 255, 0.04)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
