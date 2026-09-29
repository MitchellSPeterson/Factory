import { Children, type ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { useCSSVariable } from 'uniwind';
import { Badge } from 'panelui-native/components/badge';
import { Item } from 'panelui-native/components/item';
import { Progress } from 'panelui-native/components/progress';
import { ThemeSelector } from 'panelui-native/components/theme-selector';
import { ChevronRightIcon } from 'panelui-native/icons';
import { Text } from 'panelui-native/primitives/text';

import { useDesktop } from '@/hooks/use-desktop';
import type { ThemeColor } from '@/constants/theme';
import { useAppearance } from '@/lib/appearance-context';

export const SettingsIcons = {
  machine: { ios: 'desktopcomputer', android: 'computer', web: 'computer' },
  folder: { ios: 'folder', android: 'folder', web: 'folder' },
  chart: { ios: 'chart.bar', android: 'bar_chart', web: 'bar_chart' },
  project: { ios: 'square.stack.3d.up', android: 'layers', web: 'layers' },
  clone: { ios: 'arrow.down.circle', android: 'download', web: 'download' },
  plan: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  tokens: { ios: 'number', android: 'tag', web: 'tag' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  providers: { ios: 'cpu', android: 'memory', web: 'memory' },
  phone: { ios: 'iphone', android: 'smartphone', web: 'smartphone' },
  link: { ios: 'link', android: 'link', web: 'link' },
  add: { ios: 'plus.circle', android: 'add_circle', web: 'add_circle' },
  wifi: { ios: 'wifi', android: 'wifi', web: 'wifi' },
  network: { ios: 'network', android: 'lan', web: 'lan' },
  key: { ios: 'key', android: 'key', web: 'key' },
} as const;

export type SettingsIcon = (typeof SettingsIcons)[keyof typeof SettingsIcons];

/** Scrollable settings page body, centred and width-capped on wide screens. */
export function SettingsScroll({ children }: { children: ReactNode }) {
  const wide = useWindowDimensions().width >= 768;
  const desktop = useDesktop();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerClassName="gap-6"
      contentContainerStyle={{
        paddingTop: 16,
        paddingBottom: 16 + insets.bottom,
        paddingHorizontal: wide ? 32 : 16,
        maxWidth: desktop ? 680 : wide ? 600 : undefined,
        alignSelf: desktop ? 'flex-start' : undefined,
        width: '100%',
      }}
      keyboardShouldPersistTaps="handled"
      // The screen header already clears the status bar. Automatic inset
      // adds that height again on iOS.
      contentInsetAdjustmentBehavior="never">
      {children}
    </ScrollView>
  );
}

export function SettingsGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      {title ? (
        <Text accessibilityRole="header" className="px-1 text-sm font-medium text-muted-foreground">
          {title}
        </Text>
      ) : null}
      <Item.Group className="overflow-hidden rounded-xl bg-card">
        {rows.map((child, index) => (
          <View key={index}>
            {index > 0 ? <Item.Separator /> : null}
            {child}
          </View>
        ))}
      </Item.Group>
      {footer ? <Text className="px-1 text-xs leading-4 text-muted-foreground">{footer}</Text> : null}
    </View>
  );
}

function valueClass(tone: ThemeColor): string {
  switch (tone) {
    case 'text':
      return 'text-foreground';
    case 'accent':
      return 'text-primary';
    case 'danger':
      return 'text-destructive';
    case 'success':
      return 'text-success';
    default:
      return 'text-muted-foreground';
  }
}

export function SettingsRow({
  icon,
  leading,
  label,
  value,
  detail,
  valueTone = 'textSecondary',
  valueMode = 'tail',
  accessory,
  onPress,
  children,
}: {
  onPress?: () => void;
  icon?: SettingsIcon;
  leading?: ReactNode;
  label: string;
  value?: string;
  detail?: string;
  valueTone?: ThemeColor;
  valueMode?: 'head' | 'middle' | 'tail';
  accessory?: ReactNode;
  children?: ReactNode;
}) {
  const foreground = useCSSVariable('--color-foreground') as string | undefined;
  return (
    <View>
      <Item onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} className="bg-transparent">
        {leading || icon ? (
          <Item.Media variant={leading ? 'default' : 'icon'}>
            {leading ?? <SymbolView name={icon!} size={20} tintColor={foreground} />}
          </Item.Media>
        ) : null}
        <Item.Content className="min-w-0">
          <Item.Title numberOfLines={1}>{label}</Item.Title>
          {detail ? <Item.Description selectable>{detail}</Item.Description> : null}
        </Item.Content>
        {accessory || value || onPress ? (
          // The cap has to be on this slot. It is a direct child of the full-width
          // row. A percentage on the text itself resolves against this shrink-wrapped
          // slot and clips the value to about half its own width.
          <Item.Actions className="min-w-0 max-w-[55%] shrink">
            {accessory ??
              (value ? (
                <Text
                  selectable
                  numberOfLines={1}
                  ellipsizeMode={valueMode}
                  className={`min-w-0 shrink text-sm leading-5 ${valueClass(valueTone)}`}>
                  {value}
                </Text>
              ) : null)}
            {onPress ? <ChevronRightIcon size={16} /> : null}
          </Item.Actions>
        ) : null}
      </Item>
      {children}
    </View>
  );
}

export function SettingsMessage({ children }: { children: string }) {
  return (
    <View className="px-3 py-4">
      <Text className="text-sm leading-5 text-muted-foreground">{children}</Text>
    </View>
  );
}

export function AppearanceSwitcher() {
  const { preference, setPreference } = useAppearance();
  return (
    <View className="gap-2">
      <ThemeSelector
        label="Appearance"
        size="sm"
        applyTheme={false}
        value={preference}
        onValueChange={setPreference}
      />
      <Text className="px-1 text-xs leading-4 text-muted-foreground">
        System follows this device&apos;s light or dark setting.
      </Text>
    </View>
  );
}

export function StatusValue({ online }: { online: boolean }) {
  return (
    <Badge
      variant={online ? 'success' : 'secondary'}
      accessibilityLabel={online ? 'Online' : 'Offline'}>
      {online ? 'Online' : 'Offline'}
    </Badge>
  );
}

export function UsageTrack({
  label,
  percent,
}: {
  label: string;
  percent: number;
  fill: string;
}) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <Progress
      label={label}
      value={width}
      accessibilityLabel={`${label} ${Math.round(percent)} percent used`}
    />
  );
}
