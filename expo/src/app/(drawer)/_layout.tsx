import { Drawer } from 'expo-router/drawer';

import { FactoryDrawer } from '@/components/app-drawer';
import { useTheme } from '@/hooks/use-theme';

export default function DrawerLayout() {
  const theme = useTheme();

  return (
    <Drawer
      drawerContent={(props) => <FactoryDrawer {...props} />}
      screenOptions={{
        headerTintColor: theme.text,
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        drawerStyle: { backgroundColor: theme.sidebar, width: 280 },
        overlayColor: 'rgba(0,0,0,0.45)',
        sceneStyle: { backgroundColor: theme.background },
        drawerType: 'front',
        title: 'Chats',
      }}>
      <Drawer.Screen name="sessions" options={{ drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="settings" options={{ headerShown: false }} />
    </Drawer>
  );
}
