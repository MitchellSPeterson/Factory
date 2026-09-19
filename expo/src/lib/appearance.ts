export type AppearancePreference = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

export function parseAppearance(raw: string): AppearancePreference {
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

export function resolveScheme(
  preference: AppearancePreference,
  system: string | null | undefined,
): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'light' ? 'light' : 'dark';
}
