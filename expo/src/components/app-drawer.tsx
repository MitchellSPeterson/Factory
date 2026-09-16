import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconNames, type IconName } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function VasaDrawer(props: DrawerContentComponentProps) {
  const theme = useTheme();
  const pathname = usePathname();

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.scroll}
      style={{ backgroundColor: theme.sidebar }}>
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        <View style={styles.brand}>
          <Image source={require('@/assets/images/vasa.svg')} style={styles.mark} contentFit="contain" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
            Agentic Software Factory
          </ThemedText>
        </View>
        <ThemedText type="eyebrow" themeColor="textSecondary" style={styles.navLabel}>
          Work
        </ThemedText>
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
    width: 108,
    height: 32,
  },
  tagline: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: 500,
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
