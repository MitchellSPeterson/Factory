import { Stack } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';

import { useTheme } from '@/hooks/use-theme';

// Deep links and reloads keep the Settings root underneath, so Back always works.
export const unstable_settings = { initialRouteName: 'index' };

export default function SettingsLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTintColor: theme.text,
        headerStyle: { backgroundColor: theme.sidebar },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: theme.sidebar },
      }}>
      <Stack.Screen
        name="index"
        options={{ title: 'Settings', headerLeft: () => <DrawerToggleButton tintColor={theme.text} /> }}
      />
      <Stack.Screen name="providers/index" options={{ title: 'Providers' }} />
      <Stack.Screen name="providers/[provider]" options={{ title: 'Provider' }} />
      <Stack.Screen name="usage" options={{ title: 'Usage' }} />
      <Stack.Screen name="machine" options={{ title: 'This Mac' }} />
      <Stack.Screen name="projects" options={{ title: 'Projects' }} />
      <Stack.Screen name="pairing" options={{ title: 'Pair a Phone' }} />
    </Stack>
  );
}
