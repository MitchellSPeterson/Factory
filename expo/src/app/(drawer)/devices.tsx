import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { ActionButton } from '@/components/action-button';
import { IconButton } from '@/components/icon-button';
import { useTheme } from '@/hooks/use-theme';
import { connectDeviceHub, hubRequest, parseDevices, type HubDevice } from '@/devices/hub/api';
import { DeviceList } from '@/devices/hub/DeviceList';
import { Inspector } from '@/devices/hub/Inspector';
import { Label } from '@/devices/hub/controls';
import { shareScreenshot } from '@/devices/hub/files';
import { StreamView } from '@/devices/hub/StreamView';
import { numeric, text, type HubMessage, type StreamSelection } from '@/devices/hub/protocol';

export default function DevicesPage() {
  const theme = useTheme();
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
  const [deviceList, setDeviceList] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
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
    navigation.setOptions({
      title: selected?.name ?? 'Devices', headerShown: !fullscreen,
      headerRight: () => <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
        <IconButton icon="devices" accessibilityLabel="Devices" onPress={() => setDeviceList(true)} />
        <IconButton icon="settings" accessibilityLabel="Inspector" onPress={() => setInspector(true)} />
      </View>,
    });
  }, [navigation, selected?.name, fullscreen]);
  const selection = useMemo<StreamSelection | null>(() =>
    selected?.booted && selected.supported && !paused && focused && foreground
      ? { device: selected.id, platform: selected.platform, streamMode: mode } : null,
  [selected?.id, selected?.booted, selected?.supported, selected?.platform, paused, focused, foreground, mode]);
  useEffect(() => { setState({}); }, [selected?.id]);
  const onScreenshot = useCallback((data: string) => { void shareScreenshot(data).catch(error => { if (mounted.current) setError(String(error)); }); }, []);
  return <View style={{ flex: 1, backgroundColor: theme.sidebar }}>
    <View style={{ flex: 1 }}>
      {baseUrl && online ? <StreamView baseUrl={baseUrl} selection={selection} onState={setState} onError={setError} onScreenshot={onScreenshot} bind={bind} /> : <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}><Label>{connectionError ? 'Reconnecting to Devices…' : 'Preparing Devices…'}</Label><Label muted>{connectionError || 'Starting the device service and finding your simulators.'}</Label><ActionButton label="Reconnect" variant="ghost" onPress={() => { endpoint.current = null; setConnectionError(''); setRetry(value => value + 1); }} /></View>}
      {online && (!selected?.booted || paused) && <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: theme.sidebar, justifyContent: 'center', alignItems: 'center', gap: 16 }}><Label>{paused ? 'Preview paused' : 'Choose a running device'}</Label><ActionButton label={paused ? 'Resume preview' : 'Devices'} onPress={() => paused ? setPaused(false) : setDeviceList(true)} /></View>}
    </View>
    {error ? <View style={{ padding: 12 }}><Label>{error}</Label></View> : null}
    {!fullscreen && <View style={{ paddingHorizontal: 16, paddingTop: 8 }}><Label muted>{text(state.status, online ? 'Ready' : 'Connecting')} · {Math.round(numeric(state.fps))} FPS · {mode.toUpperCase()}</Label></View>}
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, paddingBottom: 20, gap: 8 }}>
      <IconButton icon={paused ? 'play' : 'stop'} accessibilityLabel={paused ? 'Resume preview' : 'Pause preview'} onPress={() => setPaused(value => !value)} />
      <IconButton icon="home" accessibilityLabel="Home" disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'pressButton', args: ['home'] } })} />
      <ActionButton label="Rotate" variant="ghost" disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'rotate', args: [] } })} />
      <ActionButton label="Screenshot" variant="ghost" disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'screenshot', args: [] } })} />
      <ActionButton label="Reload" variant="ghost" disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'reload', args: [] } })} />
      <ActionButton label={fullscreen ? 'Exit full screen' : 'Full screen'} variant="ghost" onPress={() => setFullscreen(value => !value)} />
      <ActionButton label="Inspector" variant="ghost" onPress={() => setInspector(true)} />
      <ActionButton label="Devices" variant="ghost" onPress={() => setDeviceList(true)} />
      {selected?.platform === 'android' && <><ActionButton label="Back" variant="ghost" disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'pressButton', args: ['back'] } })} /><ActionButton label="Recents" variant="ghost" disabled={!selection} onPress={() => send({ type: 'command', command: { method: 'pressButton', args: ['recents'] } })} /></>}
    </ScrollView></View>
    {baseUrl && <DeviceList visible={deviceList} onClose={() => setDeviceList(false)} devices={devices} selected={selected?.id} onSelect={device => { setSelectedId(device.id); setPaused(false); }} baseUrl={baseUrl} refresh={refresh} />}
    <Inspector key={selected?.id} visible={inspector} onClose={() => setInspector(false)} state={state} send={send} mode={mode} setMode={setMode} onError={setError} />
  </View>;
}
