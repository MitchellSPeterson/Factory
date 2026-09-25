import { Drawer } from 'expo-router/drawer';

import { FactoryDrawer } from '@/components/app-drawer';
import { useDesktop } from '@/hooks/use-desktop';
import { useTheme } from '@/hooks/use-theme';

export default function DrawerLayout() {
  const theme = useTheme();
  const desktop = useDesktop();

  return (
    <Drawer
      drawerContent={(props) => <FactoryDrawer {...props} />}
      screenOptions={{
        headerTintColor: theme.text,
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        drawerStyle: {
          backgroundColor: theme.sidebar,
          width: 280,
          borderRightColor: theme.line,
        },
        overlayColor: 'rgba(0,0,0,0.45)',
        sceneStyle: { backgroundColor: theme.background },
        drawerType: desktop ? 'permanent' : 'front',
        ...(desktop && { headerLeft: () => null }),
        title: 'Chats',
      }}>
      <Drawer.Screen name="sessions" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="settings" options={{ headerShown: false }} />
    </Drawer>
  );
}
