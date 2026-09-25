import { Drawer } from 'expo-router/drawer';
import { View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// The worker runs the device hub on this Mac (worker/deviceHubService.cjs, port 3400).
// Browsers can't call its API cross-origin, so web embeds the hub's own client, which
// streams over WebRTC and collapses to just the device and its toolbar when narrow.
const hubUrl =
  process.env.EXPO_PUBLIC_DEVICE_HUB_URL ??
  (typeof location === 'undefined' ? '' : `http://${location.hostname}:3400/`);

export default function DevicesPage() {
  return (
    <>
      <Drawer.Screen options={{ title: 'Devices' }} />
      <DevicesView />
    </>
  );
}

/** Also shown in a chat's side panel (`embedded`). */
export function DevicesView(_: { embedded?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: theme.background }}>
      <iframe
        title="Devices"
        src={hubUrl}
        allow="autoplay; clipboard-read; clipboard-write; fullscreen"
        style={{ border: 0, flex: 1, width: '100%', height: '100%' }}
      />
    </View>
  );
}
