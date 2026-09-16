import { router, usePathname } from 'expo-router';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconNames, type IconName } from '@/components/icon-button';
import { ProjectSwitcher } from '@/components/project-switcher';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function FactoryDrawer(props: DrawerContentComponentProps) {
  const theme = useTheme();
  const pathname = usePathname();

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.scroll}
      style={{ backgroundColor: theme.sidebar }}>
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        <View style={styles.brand}>
          <ThemedText type="heading" style={styles.mark}>
            Factory
          </ThemedText>
        </View>
        <ProjectSwitcher />
        <ThemedText type="eyebrow" themeColor="textSecondary" style={styles.navLabel}>
          Work
        </ThemedText>
        <DrawerLink
          icon="sessions"
          label="Chats"
          focused={pathname === '/chats'}
          onPress={() => {
            router.push('/chats');
            props.navigation.closeDrawer();
          }}
        />
        <DrawerLink
          icon="devices"
          label="Devices"
          focused={pathname === '/devices'}
          onPress={() => {
            router.push('/devices');
            props.navigation.closeDrawer();
          }}
        />
        <View style={styles.bottom}>
          <DrawerLink
            icon="settings"
            label="Settings"
            focused={pathname === '/settings'}
            onPress={() => {
              router.push('/settings');
              props.navigation.closeDrawer();
            }}
          />
        </View>
      </SafeAreaView>
    </DrawerContentScrollView>
  );
}

function DrawerLink({
  icon,
  label,
  focused,
  onPress,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        focused && { backgroundColor: theme.backgroundSelected },
        pressed && { opacity: 0.7 },
      ]}>
      <SymbolView
        name={IconNames[icon]}
        size={18}
        tintColor={focused ? theme.text : theme.textSecondary}
      />
      <ThemedText type="small" themeColor={focused ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: Spacing.three,
  },
  brand: {
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  mark: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: 600,
    letterSpacing: -0.4,
  },
  navLabel: {
    paddingHorizontal: 10,
  },
  item: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  bottom: {
    marginTop: 'auto',
  },
});
