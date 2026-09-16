import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ConvexClientProvider } from '@/lib/convex';
import { ProjectScopeProvider } from '@/lib/project-scope-context';

SplashScreen.preventAutoHideAsync();

const factoryDark: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.accent,
    background: Colors.dark.background,
    card: Colors.dark.sidebar,
    text: Colors.dark.text,
    border: Colors.dark.line,
    notification: Colors.dark.accent,
  },
};

const factoryLight: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.accent,
    background: Colors.light.background,
    card: Colors.light.sidebar,
    text: Colors.light.text,
    border: Colors.light.line,
    notification: Colors.light.accent,
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexClientProvider>
        <ProjectScopeProvider>
          <ThemeProvider value={colorScheme === 'dark' ? factoryDark : factoryLight}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </ProjectScopeProvider>
      </ConvexClientProvider>
    </GestureHandlerRootView>
  );
}
