import { Stack, usePathname, useRouter } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { Text } from 'panelui-native/primitives/text';
import { useCSSVariable } from 'uniwind';

import { DrawerLink } from '@/components/app-drawer';
import type { IconName } from '@/components/icon-button';
import { useDesktop } from '@/hooks/use-desktop';

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

function SettingsHeader({
  title,
  showMenu,
  showBack,
  onBack,
}: {
  title: string;
  showMenu: boolean;
  showBack: boolean;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const foreground = useCSSVariable('--color-foreground') as string | undefined;
  const surface = useCSSVariable('--color-surface') as string | undefined;
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: surface }}>
      <View className="h-11 flex-row items-center gap-1 px-2">
        {showMenu ? <DrawerToggleButton tintColor={foreground} /> : null}
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={onBack}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={22}
              tintColor={foreground}
            />
          </Pressable>
        ) : null}
        <Text className="min-w-0 flex-1 text-[17px] font-semibold leading-6" numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  );
}

export default function SettingsLayout() {
  const desktop = useDesktop();
  const pathname = usePathname();
  const router = useRouter();
  const surface = useCSSVariable('--color-surface') as string | undefined;
  const stack = (
    <Stack
      screenOptions={{
        header: ({ options, back, navigation }) => (
          <SettingsHeader
            title={options.title ?? ''}
            showMenu={!desktop && !back}
            showBack={!desktop && !!back && options.headerBackVisible !== false}
            onBack={() => navigation.goBack()}
          />
        ),
        headerShadowVisible: false,
        contentStyle: { backgroundColor: surface },
        // Desktop: sections are peers picked from the left column, not a drill-down.
        ...(desktop && { headerBackVisible: false, animation: 'none' }),
      }}>
      <Stack.Screen name="index" options={{ title: desktop ? 'General' : 'Settings' }} />
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
    <View className="flex-1 flex-row bg-surface">
      <View className="w-[220px] pt-16 px-2.5 gap-0.5 border-r border-border">
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
      <View className="flex-1 min-w-0">{stack}</View>
    </View>
  );
}
