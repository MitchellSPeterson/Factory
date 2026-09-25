import { Stack, usePathname, useRouter } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import { StyleSheet, View } from 'react-native';

import { DrawerLink } from '@/components/app-drawer';
import type { IconName } from '@/components/icon-button';
import { useDesktop } from '@/hooks/use-desktop';
import { useTheme } from '@/hooks/use-theme';

// Deep links and reloads keep the Settings root underneath, so Back always works.
export const unstable_settings = { initialRouteName: 'index' };

const sections: { href: string; label: string; icon: IconName }[] = [
  { href: '/settings', label: 'General', icon: 'settings' },
  { href: '/settings/machine', label: 'This Mac', icon: 'computer' },
  { href: '/settings/providers', label: 'Providers', icon: 'cpu' },
  { href: '/settings/usage', label: 'Usage', icon: 'chart' },
  { href: '/settings/projects', label: 'Projects', icon: 'layers' },
  { href: '/settings/pairing', label: 'Pair a Phone', icon: 'devices' },
];

export default function SettingsLayout() {
  const theme = useTheme();
  const desktop = useDesktop();
  const pathname = usePathname();
  const router = useRouter();
  const stack = (
    <Stack
      screenOptions={{
        headerTintColor: theme.text,
        headerStyle: { backgroundColor: theme.sidebar },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: theme.sidebar },
        // Desktop: sections are peers picked from the left column, not a drill-down.
        ...(desktop && { headerBackVisible: false, animation: 'none' }),
      }}>
      <Stack.Screen
        name="index"
        options={{
          title: desktop ? 'General' : 'Settings',
          headerLeft: desktop ? () => null : () => <DrawerToggleButton tintColor={theme.text} />,
        }}
      />
      <Stack.Screen name="providers/index" options={{ title: 'Providers' }} />
      <Stack.Screen name="providers/[provider]" options={{ title: 'Provider', headerBackVisible: true }} />
      <Stack.Screen name="usage" options={{ title: 'Usage' }} />
      <Stack.Screen name="machine" options={{ title: 'This Mac' }} />
      <Stack.Screen name="projects" options={{ title: 'Projects' }} />
      <Stack.Screen name="pairing" options={{ title: 'Pair a Phone' }} />
    </Stack>
  );
  if (!desktop) return stack;
  return (
    <View style={[styles.split, { backgroundColor: theme.sidebar }]}>
      <View style={[styles.nav, { borderColor: theme.line }]}>
        {sections.map((section) => (
          <DrawerLink
            key={section.href}
            icon={section.icon}
            label={section.label}
            focused={
              section.href === '/settings'
                ? pathname === '/settings'
                : pathname.startsWith(section.href)
            }
            onPress={() => router.replace(section.href as never)}
          />
        ))}
      </View>
      <View style={styles.content}>{stack}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  nav: { width: 220, paddingTop: 64, paddingHorizontal: 10, gap: 2, borderRightWidth: 1 },
  content: { flex: 1, minWidth: 0 },
});
