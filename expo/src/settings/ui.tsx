import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { ThemeColor } from '@/constants/theme';
import { useAppearance } from '@/lib/appearance-context';
import type { AppearancePreference } from '@/lib/appearance';

export const SettingsIcons = {
  machine: { ios: 'desktopcomputer', android: 'computer', web: 'computer' },
  folder: { ios: 'folder', android: 'folder', web: 'folder' },
  chart: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  project: { ios: 'square.stack.3d.up', android: 'layers', web: 'layers' },
  clone: { ios: 'arrow.down.circle', android: 'download', web: 'download' },
  plan: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  tokens: { ios: 'number', android: 'tag', web: 'tag' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
} as const;

export type SettingsIcon = (typeof SettingsIcons)[keyof typeof SettingsIcons];

export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.wrap}>
      <ThemedText accessibilityRole="header" themeColor="textSecondary" style={styles.title}>
        {title}
      </ThemedText>
      <View style={[styles.group, { backgroundColor: theme.backgroundElement }]}>
        {rows.map((child, index) => (
          <View key={index}>
            {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.line }]} /> : null}
            {child}
          </View>
        ))}
      </View>
      {footer ? (
        <ThemedText themeColor="textSecondary" style={styles.footer}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function SettingsRow({
  icon,
  label,
  value,
  detail,
  valueTone = 'textSecondary',
  valueMode = 'tail',
  accessory,
  children,
}: {
  icon?: SettingsIcon;
  label: string;
  value?: string;
  detail?: string;
  valueTone?: ThemeColor;
  valueMode?: 'head' | 'middle' | 'tail';
  accessory?: ReactNode;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        {icon ? (
          <SymbolView name={icon} size={22} tintColor={theme.text} />
        ) : null}
        <View style={styles.labelWrap}>
          <ThemedText numberOfLines={1} style={styles.label}>
            {label}
          </ThemedText>
        </View>
        {accessory ? (
          <View style={styles.accessory}>{accessory}</View>
        ) : value ? (
          <View style={styles.valueWrap}>
            <ThemedText
              selectable
              themeColor={valueTone}
              numberOfLines={1}
              ellipsizeMode={valueMode}
              style={styles.value}>
              {value}
            </ThemedText>
          </View>
        ) : null}
      </View>
      {children}
      {detail ? (
        <ThemedText themeColor="textSecondary" style={styles.detail}>
          {detail}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function SettingsMessage({ children }: { children: string }) {
  return (
    <View style={styles.message}>
      <ThemedText themeColor="textSecondary" style={styles.messageText}>
        {children}
      </ThemedText>
    </View>
  );
}

const APPEARANCE_OPTIONS: { value: AppearancePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function AppearanceSwitcher() {
  const theme = useTheme();
  const { preference, setPreference } = useAppearance();
  return (
    <SettingsGroup
      title="Appearance"
      footer="System follows this device's light or dark setting.">
      <View
        accessibilityRole="radiogroup"
        style={[styles.segmentTrack, { backgroundColor: theme.sidebar }]}>
        {APPEARANCE_OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => setPreference(option.value)}
              style={({ pressed }) => [
                styles.segment,
                selected
                  ? { backgroundColor: theme.backgroundElement }
                  : pressed
                    ? { backgroundColor: theme.subtleHover }
                    : null,
              ]}>
              <ThemedText
                themeColor={selected ? 'text' : 'textSecondary'}
                style={styles.segmentLabel}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </SettingsGroup>
  );
}

export function StatusValue({ online }: { online: boolean }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={online ? 'Online' : 'Offline'}
      style={styles.status}>
      <View
        style={[
          styles.dot,
          { backgroundColor: online ? theme.success : theme.textSecondary },
        ]}
      />
      <ThemedText themeColor={online ? 'success' : 'textSecondary'} style={styles.statusLabel}>
        {online ? 'Online' : 'Offline'}
      </ThemedText>
    </View>
  );
}

export function UsageTrack({
  label,
  percent,
  fill,
}: {
  label: string;
  percent: number;
  fill: string;
}) {
  const theme = useTheme();
  const width = Math.max(0, Math.min(100, percent));
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${Math.round(percent)} percent used`}
      style={[styles.track, { backgroundColor: theme.line }]}>
      <View style={[styles.fill, { width: `${width}%`, backgroundColor: fill }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  title: {
    paddingHorizontal: 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
  },
  group: {
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
  },
  footer: {
    paddingHorizontal: 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 400,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    minHeight: 52,
    justifyContent: 'center',
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 28,
    minWidth: 0,
  },
  labelWrap: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  label: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 400,
  },
  valueWrap: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
  value: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 400,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  accessory: {
    flexShrink: 0,
  },
  detail: {
    marginLeft: 34,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 400,
  },
  message: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 400,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
  },
  statusLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 400,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginLeft: 34,
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
  segmentTrack: {
    margin: 8,
    padding: 3,
    borderRadius: 10,
    borderCurve: 'continuous',
    flexDirection: 'row',
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: 600,
  },
});
