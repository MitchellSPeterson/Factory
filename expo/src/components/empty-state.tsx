import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { IconNames, type IconName } from '@/components/icon-button';
import { useTheme } from '@/hooks/use-theme';

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
          <SymbolView name={IconNames[icon]} size={28} tintColor={theme.accent} />
        </View>
      ) : null}
      <ThemedText type="heading" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
        {body}
      </ThemedText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 32,
    maxWidth: 440,
    width: '100%',
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
});
