import { Platform, type TextProps as RNTextProps } from 'react-native';

import { Text } from 'panelui-native/primitives/text';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = RNTextProps & {
  type?:
    | 'default'
    | 'title'
    | 'heading'
    | 'section'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'eyebrow'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

// Factory's bespoke type scale (not PanelUI's) — same pixel values as before,
// just expressed as Tailwind arbitrary-value classes. Color is handled
// separately below since `linkPrimary` always wins over `themeColor`.
const TYPE_CLASS: Record<NonNullable<ThemedTextProps['type']>, string> = {
  default: 'text-[16px] leading-[24px] font-medium',
  title: 'text-[48px] leading-[52px] font-semibold',
  heading: 'text-[28px] leading-[34px] font-semibold tracking-[-0.4px]',
  section: 'text-[20px] leading-[26px] font-semibold',
  small: 'text-[14px] leading-[20px] font-medium',
  smallBold: 'text-[14px] leading-[20px] font-bold',
  subtitle: 'text-[32px] leading-[44px] font-semibold',
  eyebrow: 'text-[11px] leading-[14px] font-semibold tracking-[0.8px] uppercase',
  link: 'text-[14px] leading-[30px]',
  linkPrimary: 'text-[14px] leading-[30px]',
  code: 'text-[12px]',
};

// Only the palette entries that map onto a PanelUI text token. Anything else
// (background, sidebar, line, subtleHover, …) falls back to an inline color
// below, same as before — those were never really meant as text colors, but
// `ThemeColor` allows them and callers may still pass them.
const THEME_COLOR_CLASS: Partial<Record<ThemeColor, string>> = {
  text: 'text-foreground',
  textSecondary: 'text-muted-foreground',
  accent: 'text-primary',
  danger: 'text-destructive',
  success: 'text-success',
};

export function ThemedText({
  style,
  type = 'default',
  themeColor,
  className,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  // `linkPrimary` always renders in the accent color, regardless of
  // `themeColor` — matches the previous StyleSheet behavior.
  const resolvedColorKey = type === 'linkPrimary' ? 'accent' : (themeColor ?? 'text');
  const colorClass = THEME_COLOR_CLASS[resolvedColorKey];

  return (
    <Text
      className={[TYPE_CLASS[type], colorClass, className].filter(Boolean).join(' ')}
      style={[
        colorClass ? undefined : { color: theme[resolvedColorKey] },
        type === 'code' && {
          fontFamily: Fonts.mono,
          fontWeight: Platform.select({ android: 700 }) ?? 500,
        },
        style,
      ]}
      {...rest}
    />
  );
}
