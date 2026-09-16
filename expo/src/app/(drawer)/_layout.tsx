import { Drawer } from 'expo-router/drawer';

import { VasaDrawer } from '@/components/app-drawer';
import { useTheme } from '@/hooks/use-theme';

export default function DrawerLayout() {
  const theme = useTheme();

  return (
    <Drawer
      drawerContent={(props) => <VasaDrawer {...props} />}
      screenOptions={{
        headerTintColor: theme.text,
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        drawerStyle: { backgroundColor: theme.sidebar, width: 280 },
        overlayColor: 'rgba(0,0,0,0.45)',
        sceneStyle: { backgroundColor: theme.background },
        drawerType: 'front',
        title: 'Devices',
      }}
    />
  );
}
