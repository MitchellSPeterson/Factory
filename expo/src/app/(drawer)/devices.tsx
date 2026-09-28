import { Button, Host, Icon } from '@expo/ui';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from 'panelui-native/components/alert';
import { ChevronDownIcon } from 'panelui-native/icons';
import { Text } from 'panelui-native/primitives/text';
import { ActionButton } from '@/components/action-button';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { connectDeviceHub, hubRequest, parseDevices, type HubDevice } from '@/devices/hub/api';
import { DeviceList } from '@/devices/hub/DeviceList';
import { Inspector } from '@/devices/hub/Inspector';
import { Label } from '@/devices/hub/controls';
import { shareScreenshot } from '@/devices/hub/files';
import { StreamView } from '@/devices/hub/StreamView';
import { type HubMessage, type StreamSelection } from '@/devices/hub/protocol';

function SettingsButton({ onPress }: { onPress: () => void }) {
  if (process.env.EXPO_OS !== 'ios') {
    return <IconButton icon="settings" accessibilityLabel="Settings" onPress={onPress} />;
  }
  return (
    <Host matchContents style={{ width: 44, height: 44, marginRight: 4 }}>
      <Button variant="text" onPress={onPress}>
        <Icon name="gearshape" size={22} />
      </Button>
    </Host>
  );
}

export default function DevicesPage() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const endpoint = useRef<string | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [retry, setRetry] = useState(0);
  const [devices, setDevices] = useState<HubDevice[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [state, setState] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [online, setOnline] = useState(false);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [settings, setSettings] = useState(false);
  const [deviceList, setDeviceList] = useState(false);
  const [mode, setMode] = useState<StreamSelection['streamMode']>('webrtc');
  const sender = useRef<((message: HubMessage) => void) | null>(null);
  const mounted = useRef(false);
  const selected = devices.find(d => d.id === selectedId) ?? devices.find(d => d.booted && d.supported) ?? devices[0];
  const bind = useCallback((value: ((message: HubMessage) => void) | null) => { sender.current = value; }, []);
  const send = useCallback((message: HubMessage) => { sender.current?.(message); }, []);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { mounted.current = false; subscription.remove(); };
  }, []);
  const refresh = useCallback(async () => {
    const current = endpoint.current;
    try {
      if (current) {
        const data = await hubRequest(current, '/api/devices');
        if (mounted.current) { setDevices(parseDevices(data)); setOnline(true); }
      } else {
        const connection = await connectDeviceHub();
        if (mounted.current) {
          endpoint.current = connection.baseUrl;
          setBaseUrl(connection.baseUrl);
          setDevices(connection.devices);
          setOnline(true);
        }
      }
    } catch (error) {
      endpoint.current = null;
      throw error;
    }
  }, []);
  useEffect(() => {
    if (!focused || !foreground) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refresh(); if (live) setConnectionError(''); }
      catch (error) { if (live) { setOnline(false); setConnectionError(error instanceof Error ? error.message : 'Reconnecting to your machine…'); } }
      if (live) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [refresh, focused, foreground, retry]);
  useLayoutEffect(() => {
    const title = selected?.name ?? 'Devices';
    navigation.setOptions({
      title,
      headerTitle: () => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}, choose device`}
          onPress={() => setDeviceList(true)}
          className="min-h-11 flex-row items-center gap-1">
          <Text className="text-[17px] font-semibold text-foreground">{title}</Text>
          <ChevronDownIcon size={12} className="text-muted-foreground" />
        </Pressable>
      ),
      headerRight: () => <SettingsButton onPress={() => setSettings(true)} />,
    });
  }, [navigation, selected?.name]);
  const selection = useMemo<StreamSelection | null>(() =>
    selected?.booted && selected.supported && !paused && focused && foreground
      ? { device: selected.id, platform: selected.platform, streamMode: mode } : null,
  [selected?.id, selected?.booted, selected?.supported, selected?.platform, paused, focused, foreground, mode]);
  useEffect(() => { setState({}); }, [selected?.id]);
  const onScreenshot = useCallback((data: string) => { void shareScreenshot(data).catch(error => { if (mounted.current) setError(String(error)); }); }, []);
  return <View className="flex-1 bg-surface">
    <View className="flex-1">
      {baseUrl && online ? (
        <StreamView baseUrl={baseUrl} selection={selection} onState={setState} onError={setError} onScreenshot={onScreenshot} bind={bind} />
      ) : (
        <EmptyState
          icon="devices"
          title={connectionError ? 'Reconnecting to Devices…' : 'Preparing Devices…'}
          body={connectionError || 'Starting the device service and finding your simulators.'}
          action={
            <ActionButton
              label="Reconnect"
              onPress={() => {
                endpoint.current = null;
                setConnectionError('');
                setRetry(value => value + 1);
              }}
            />
          }
        />
      )}
      {online && (!selected?.booted || paused) && (
        <View className="absolute inset-0 items-center justify-center gap-4 bg-surface p-6">
          <Label>{paused ? 'Preview paused' : 'Choose a running device'}</Label>
          <ActionButton
            label={paused ? 'Resume preview' : 'Devices'}
            onPress={() => (paused ? setPaused(false) : setDeviceList(true))}
          />
        </View>
      )}
    </View>
    {error ? (
      <Alert variant="destructive" className="m-3">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert>
    ) : null}
    <View className="px-3 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
      <View className="flex-row flex-wrap items-center justify-center gap-0.5 self-center rounded-[18px] border border-border bg-card p-1">
        <IconButton icon="screenshot" accessibilityLabel="Take screenshot" style={{ backgroundColor: 'transparent' }} disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'screenshot', args: [] } })} />
        <IconButton icon="appearance" accessibilityLabel="Toggle device light and dark mode" style={{ backgroundColor: 'transparent' }} disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'setAppearance', args: [state.appearance === 'dark' ? 'light' : 'dark'] } })} />
        <IconButton icon="home" accessibilityLabel="Home" style={{ backgroundColor: 'transparent' }} disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'pressButton', args: ['home'] } })} />
        <IconButton icon="reload" accessibilityLabel="Reload app" style={{ backgroundColor: 'transparent' }} disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'reload', args: [] } })} />
        <IconButton icon="menu" accessibilityLabel="Open Expo menu" style={{ backgroundColor: 'transparent' }} disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'openDevMenu', args: [] } })} />
        <IconButton icon="rotate" accessibilityLabel="Rotate device" style={{ backgroundColor: 'transparent' }} disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'rotate', args: [] } })} />
        <IconButton icon={paused ? 'play' : 'stop'} accessibilityLabel={paused ? 'Resume preview' : 'Pause preview'} style={{ backgroundColor: 'transparent' }} onPress={() => setPaused(value => !value)} />
        {selected?.platform === 'android' && <><IconButton icon="back" accessibilityLabel="Back" style={{ backgroundColor: 'transparent' }} disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'pressButton', args: ['back'] } })} /><IconButton icon="recents" accessibilityLabel="Recent apps" style={{ backgroundColor: 'transparent' }} disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'pressButton', args: ['recents'] } })} /></>}
      </View>
    </View>
    {baseUrl ? <DeviceList visible={deviceList} onClose={() => setDeviceList(false)} devices={devices} selected={selected?.id} onSelect={device => { setSelectedId(device.id); setPaused(false); }} baseUrl={baseUrl} refresh={refresh} /> : null}
    <Inspector key={selected?.id} visible={settings} onClose={() => setSettings(false)} state={state} send={send} mode={mode} setMode={setMode} onError={setError} />
  </View>;
}
