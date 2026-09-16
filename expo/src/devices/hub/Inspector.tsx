import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, View } from 'react-native';
import { ActionButton } from '@/components/action-button';
import { useTheme } from '@/hooks/use-theme';
import type { DeviceSettingKey, DeviceStreamEncoderSettings } from '../../../vendor/expo-hub-client/src/types';
import { Choice, Field, Group, Label, Row, Sheet, Toggle, options } from './controls';
import { items, numeric, record, text, type ClientCommand, type HubMessage, type StreamSelection } from './protocol';
import { chooseCameraPng } from './files';

type Props = { visible: boolean; onClose: () => void; state: Record<string, unknown>; send: (message: HubMessage) => void; mode: StreamSelection['streamMode']; setMode: (mode: StreamSelection['streamMode']) => void; onError: (error: string) => void };
type Tab = 'Stream' | 'Device' | 'App' | 'Location' | 'Camera' | 'Accessibility' | 'Logs' | 'Events';
export function Inspector({ visible, onClose, state, send, mode, setMode, onError }: Props) {
  const [tab, setTab] = useState<Tab>('Stream');
  const t = useTheme();
  const caps = record(state.capabilities);
  const command = (command: ClientCommand) => send({ type: 'command', command });
  const tabs: Tab[] = ['Stream', 'Device', 'App'];
  if (caps.location) tabs.push('Location');
  if (caps.camera) tabs.push('Camera');
  if (caps.accessibility) tabs.push('Accessibility');
  tabs.push('Logs');
  if (caps.events) tabs.push('Events');
  useEffect(() => {
    send({ type: 'command', command: { method: 'setStreamStatsEnabled', args: [visible && tab === 'Stream'] } });
    if (visible && tab === 'App' && caps.permissions) send({ type: 'command', command: { method: 'refreshPermissions', args: [] } });
    return () => send({ type: 'command', command: { method: 'setStreamStatsEnabled', args: [false] } });
  }, [visible, tab, send, caps.permissions]);
  const body = tab === 'Stream' ? <StreamOptions state={state} command={command} mode={mode} setMode={setMode} />
    : tab === 'Device' ? <DeviceOptions state={state} command={command} />
    : tab === 'App' ? <AppOptions state={state} command={command} />
    : tab === 'Location' ? <LocationOptions state={state} command={command} />
    : tab === 'Camera' ? <Group title="Camera input"><Label muted>Choose a PNG for the emulator camera. The camera feed must be wired when the emulator starts.</Label>{['front', 'back'].map(facing => <View key={facing} style={{ gap: 8 }}><Label>{facing === 'front' ? 'Front camera' : 'Back camera'}</Label><View style={{ flexDirection: 'row', gap: 8 }}><ActionButton label="Choose PNG" onPress={() => { void chooseCameraPng().then(data => { if (data && (facing === 'front' || facing === 'back')) send({ type: 'camera', facing, data }); }).catch(error => onError(String(error))); }} /><ActionButton label="Reset" variant="ghost" onPress={() => { if (facing === 'front' || facing === 'back') command({ method: 'clearCameraImage', args: [facing] }); }} /></View></View>)}<Details data={record(state.camera)} />{state.cameraError ? <Label>{text(state.cameraError)}</Label> : null}</Group>
    : tab === 'Accessibility' ? <Group title="Accessibility tree"><ActionButton label={state.accessibilityPending ? 'Reading…' : 'Refresh screen'} disabled={state.accessibilityPending === true} onPress={() => command({ method: 'refreshAccessibility', args: [] })} />{state.accessibilityError ? <Label>{text(state.accessibilityError)}</Label> : null}{items(record(state.accessibility).nodes).map((raw, index) => { const node = record(raw); return <View key={text(node.id, String(index))} style={{ gap: 4 }}><Label>{text(node.label)}</Label><Label muted>{text(node.role)} · {node.enabled ? 'Enabled' : 'Disabled'}</Label></View>; })}</Group>
    : null;
  return <Sheet title="Settings" visible={visible} onClose={onClose} scroll={false}>
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>{tabs.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: tab === item ? t.backgroundSelected : t.backgroundElement }}><Label>{item}</Label></Pressable>)}</ScrollView></View>
    {tab === 'Logs' || tab === 'Events' ? <Output kind={tab} state={state} command={command} /> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>{body}</ScrollView>}
  </Sheet>;
}
function Details({ data }: { data: Record<string, unknown> }) {
  return <>{Object.entries(data).filter(([key, value]) => key !== 'iconDataUrl' && value !== null && ['string', 'number', 'boolean'].includes(typeof value)).map(([key, value]) => <Row key={key} label={key.replace(/([A-Z])/g, ' $1')}><View style={{ flex: 1, alignItems: 'flex-end' }}><Label muted>{typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value)}</Label></View></Row>)}</>;
}
function Metric({ label, samples, field, suffix = '' }: { label: string; samples: unknown[]; field: string; suffix?: string }) {
  const t = useTheme();
  const values = samples.slice(-40).map(s => numeric(record(s)[field]));
  const max = Math.max(1, ...values);
  return <View style={{ gap: 8 }}><Row label={label}><Label>{Math.round((values.at(-1) ?? 0) * 10) / 10}{suffix}</Label></Row><View accessible accessibilityLabel={`${label} history`} style={{ height: 44, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>{values.map((value, index) => <View key={index} style={{ flex: 1, minHeight: 1, height: 44 * value / max, backgroundColor: t.accent, borderRadius: 2 }} />)}</View></View>;
}
function StreamOptions({ state, command, mode, setMode }: { state: Record<string, unknown>; command: (c: ClientCommand) => void; mode: StreamSelection['streamMode']; setMode: Props['setMode'] }) {
  const availability = record(record(state.streamCapabilities).modeAvailability);
  const transports = ['webrtc', 'h264', 'mjpeg'].filter(key => availability[key] !== false);
  const source = record(state.streamSource);
  const stats = record(state.streamStats);
  return <>
    <Group title="Stream"><Choice label="Transport" value={mode} options={options(transports)} onChange={value => { if (value === 'webrtc' || value === 'h264' || value === 'mjpeg') setMode(value); }} />
      {mode === 'webrtc' && <Choice label="Codec" value={text(state.webRtcCodec, 'h264')} options={options(items(record(state.streamCapabilities).webRtcCodecs).map(v => text(v)))} onChange={value => { if (value === 'h264' || value === 'vp8' || value === 'vp9') command({ method: 'setWebRtcCodec', args: [value] }); }} />}
      <Row label="Connection"><Label muted>{text(state.status, 'Connecting')}</Label></Row><Row label="Frame rate"><Label>{Math.round(numeric(state.fps))} FPS</Label></Row>
      <Row label="Dimensions"><Label muted>{numeric(record(state.screen).width)} × {numeric(record(state.screen).height)}</Label></Row>
      {state.error ? <Label>{text(state.error)}</Label> : null}
    </Group>
    <EncoderSettings state={state} command={command} />
    {state.streamSource ? <Group title="Android capture">
      <Choice label="Source" value={text(source.mode)} options={options(items(source.availableModes).map(v => text(v)))} disabled={state.streamSourcePending === true} onChange={v => { if (v === 'scrcpy' || v === 'grpc-screenshot') command({ method: 'setStreamSource', args: [v] }); }} />
      {source.mode === 'grpc-screenshot' && <><Choice label="Frame delivery" value={text(source.grpcImageMode)} options={options(['rgb888', 'png', 'mmap'])} onChange={v => { if (v === 'rgb888' || v === 'png' || v === 'mmap') command({ method: 'setGrpcImageMode', args: [v] }); }} /><Choice label="Encoder" value={text(source.encoder)} options={options(items(source.availableEncoders).map(v => text(v)))} onChange={v => { if (v === 'hardware' || v === 'software') command({ method: 'setGrpcEncoder', args: [v] }); }} /><Choice label="Input" value={text(source.inputSource)} options={options(items(source.availableInputSources).map(v => text(v)))} onChange={v => { if (v === 'scrcpy' || v === 'grpc') command({ method: 'setGrpcInputSource', args: [v] }); }} /></>}
      {state.streamSourceError ? <Label>{text(state.streamSourceError)}</Label> : null}
    </Group> : null}
    {mode === 'webrtc' && <Group title="Stream statistics"><Metric label="Displayed" samples={items(stats.samples)} field="clientFps" suffix=" FPS" /><Metric label="Captured" samples={items(stats.samples)} field="serverFps" suffix=" FPS" /><Details data={record(items(stats.samples).at(-1))} /><Details data={record(stats.encoder)} /><Details data={record(stats.capture)} />{stats.stale ? <Label muted>Waiting for fresh statistics.</Label> : null}</Group>}
  </>;
}
const encoderFields = [
  { key: 'maxDimension', label: 'Maximum dimension', min: 0, max: 4096 },
  { key: 'h264Fps', label: 'Video FPS', min: 1, max: 120 },
  { key: 'h264Bitrate', label: 'Video bitrate · bits/second', min: 100000, max: 50000000 },
  { key: 'mjpegFps', label: 'MJPEG FPS', min: 1, max: 120 },
  { key: 'mjpegQuality', label: 'JPEG quality · 0.05–1', min: .05, max: 1 },
] as const;
function EncoderSettings({ state, command }: { state: Record<string, unknown>; command: (c: ClientCommand) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const settings = record(state.streamSettings);
  const capabilities = record(record(state.capabilities).streamSettings);
  if (!state.streamSettings) return null;
  function apply() {
    const patch: Partial<DeviceStreamEncoderSettings> = {};
    for (const field of encoderFields) {
      if (!capabilities[field.key] || draft[field.key] === undefined) continue;
      const value = Number(draft[field.key]);
      if (!draft[field.key]?.trim() || !Number.isFinite(value) || value < field.min || value > field.max || (field.key !== 'mjpegQuality' && !Number.isInteger(value))) { setError(`${field.label} must be between ${field.min} and ${field.max}.`); return; }
      patch[field.key] = value;
    }
    setError(''); command({ method: 'updateStreamSettings', args: [patch] }); setDraft({});
  }
  return <Group title="Quality">{encoderFields.filter(field => capabilities[field.key]).map(field => <Field key={field.key} label={field.label} numeric value={draft[field.key] ?? String(numeric(settings[field.key]))} onChange={value => setDraft(current => ({ ...current, [field.key]: value }))} />)}<Label muted>Maximum dimension 0 uses native resolution. Higher quality and frame rates use more bandwidth.</Label>{error ? <Label>{error}</Label> : null}<ActionButton label={state.streamSettingsPending ? 'Applying…' : 'Apply quality'} disabled={state.streamSettingsPending === true || !Object.keys(draft).length} onPress={apply} /></Group>;
}
const deviceChoices: { key: DeviceSettingKey; label: string; values: readonly string[] }[] = [
  { key: 'appearance', label: 'Appearance', values: ['light', 'dark'] },
  { key: 'liquid-glass', label: 'Liquid glass', values: ['clear', 'tinted'] },
  { key: 'color-filter', label: 'Color filter', values: ['none', 'grayscale', 'red-green', 'green-red', 'blue-yellow'] },
  { key: 'text-size', label: 'Text size', values: ['extra-small', 'small', 'medium', 'large', 'extra-large', 'extra-extra-large', 'extra-extra-extra-large'] },
  { key: 'display-size', label: 'Display size', values: ['small', 'medium', 'large', 'extra-large'] },
];
const deviceToggles: { key: DeviceSettingKey; label: string }[] = [
  { key: 'network', label: 'Network' }, { key: 'reduce-motion', label: 'Reduce motion' },
  { key: 'bold-text', label: 'Bold text' }, { key: 'increase-contrast', label: 'Increase contrast' },
  { key: 'onscreen-keyboard', label: 'Force on-screen keyboard' }, { key: 'show-borders', label: 'Show borders' },
  { key: 'reduce-transparency', label: 'Reduce transparency' }, { key: 'voiceover', label: 'VoiceOver' },
];
function DeviceOptions({ state, command }: { state: Record<string, unknown>; command: (c: ClientCommand) => void }) {
  const settings = record(state.deviceSettings);
  const pending = items(state.deviceSettingsPending);
  const visible = (key: string) => typeof settings[key] === 'string' && settings[key] !== 'unsupported';
  const change = (key: DeviceSettingKey, value: string) => command({ method: 'setDeviceSetting', args: [key, value] });
  return <><Group title="Device options">
    {deviceChoices.filter(c => visible(c.key)).map(choice => <Choice key={choice.key} label={choice.label} value={text(settings[choice.key])} options={options(choice.key === 'text-size' && state.platform === 'android' ? ['small', 'medium', 'large', 'extra-large'] : choice.values)} disabled={pending.includes(choice.key)} onChange={value => change(choice.key, value)} />)}
    {deviceToggles.filter(c => visible(c.key)).map(c => <Toggle key={c.key} label={c.label} value={settings[c.key] === 'on'} disabled={pending.includes(c.key)} onChange={value => change(c.key, value ? 'on' : 'off')} />)}
    {!Object.keys(settings).length && <Label muted>Device settings will appear after connecting.</Label>}
  </Group><Group title="Keyboard">
    {typeof state.hardwareKeyboardConnected === 'boolean' && <Toggle label="Hardware keyboard" value={state.hardwareKeyboardConnected} onChange={value => command({ method: 'setHardwareKeyboardConnected', args: [value] })} />}
    {state.platform === 'ios' ? <ActionButton label="Toggle software keyboard" variant="ghost" onPress={() => command({ method: 'toggleSoftwareKeyboard', args: [] })} /> : <ActionButton label="Dismiss keyboard" variant="ghost" onPress={() => command({ method: 'pressButton', args: ['hideKeyboard'] })} />}
  </Group></>;
}
function AppOptions({ state, command }: { state: Record<string, unknown>; command: (c: ClientCommand) => void }) {
  const app = record(state.foregroundApp);
  const activity = record(state.activity);
  return <><Group title="Current app">{app.iconDataUrl ? <Image source={{ uri: text(app.iconDataUrl) }} style={{ width: 48, height: 48, borderRadius: 12 }} /> : null}<Details data={app} />{!app.id && <Label muted>No foreground app information available.</Label>}<ActionButton label="Reload app" onPress={() => command({ method: 'reload', args: [] })} /></Group>
    {record(state.capabilities).activity ? <Group title="Activity"><Metric label="CPU" samples={items(activity.samples)} field="cpuPct" suffix="%" /><Metric label="Memory" samples={items(activity.samples).map(raw => ({ memMB: numeric(record(raw).memBytes) / 1048576 }))} field="memMB" suffix=" MB" /><Metric label="Network in" samples={items(activity.samples).map(raw => ({ kb: numeric(record(raw).netInBytesPerSec) / 1024 }))} field="kb" suffix=" KB/s" /><Metric label="Network out" samples={items(activity.samples).map(raw => ({ kb: numeric(record(raw).netOutBytesPerSec) / 1024 }))} field="kb" suffix=" KB/s" />{activity.stale ? <Label muted>Activity is paused.</Label> : null}</Group> : null}
    {record(state.capabilities).permissions ? <Group title="App permissions">{items(state.permissions).map(raw => { const p = record(raw); return <Toggle key={text(p.id)} label={`${text(p.label)} · ${text(p.state)}`} value={p.state === 'granted'} disabled={items(state.permissionsPending).includes(p.id)} onChange={value => command({ method: 'setPermission', args: [text(p.id), value ? 'grant' : 'revoke'] })} />; })}{state.permissionsError ? <Label>{text(state.permissionsError)}</Label> : null}<ActionButton label="Reset permissions" variant="ghost" onPress={() => command({ method: 'resetPermissions', args: [] })} /></Group> : null}
  </>;
}
function LocationOptions({ state, command }: { state: Record<string, unknown>; command: (c: ClientCommand) => void }) {
  const [latitude, setLatitude] = useState(text(record(state.location).latitude, ''));
  const [longitude, setLongitude] = useState(text(record(state.location).longitude, ''));
  const [error, setError] = useState('');
  function apply() {
    const lat = Number(latitude), lng = Number(longitude);
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError('Enter latitude from −90 to 90 and longitude from −180 to 180.'); return; }
    setError(''); command({ method: 'setLocation', args: [{ latitude: lat, longitude: lng }] });
  }
  return <Group title="Simulated location"><Field label="Latitude" numeric value={latitude} onChange={setLatitude} /><Field label="Longitude" numeric value={longitude} onChange={setLongitude} />{error || state.locationError ? <Label>{error || text(state.locationError)}</Label> : null}<ActionButton label="Set location" disabled={state.locationPending === true} onPress={apply} />{record(record(state.capabilities).location).clear === true && <ActionButton label="Clear location" variant="ghost" disabled={state.locationPending === true} onPress={() => command({ method: 'clearLocation', args: [] })} />}<Details data={record(state.location)} /></Group>;
}
function Output({ kind, state, command }: { kind: 'Logs' | 'Events'; state: Record<string, unknown>; command: (c: ClientCommand) => void }) {
  const [search, setSearch] = useState('');
  const logs = kind === 'Logs';
  const enabled = logs ? state.logsEnabled : state.eventsEnabled;
  const rows = items(logs ? state.logs : state.events).map(record).filter(row => `${text(row.message)} ${text(row.source)}`.toLowerCase().includes(search.toLowerCase()));
  return <View style={{ flex: 1, padding: 16, gap: 12 }}><Toggle label={`Collect ${kind.toLowerCase()}`} value={enabled === true} onChange={value => command({ method: logs ? value ? 'attachLogs' : 'detachLogs' : value ? 'attachEvents' : 'detachEvents', args: [] })} /><Field label="Filter" value={search} onChange={setSearch} /><ActionButton label="Clear" variant="ghost" onPress={() => command({ method: logs ? 'clearLogs' : 'clearEvents', args: [] })} /><FlatList data={rows} keyExtractor={(row, index) => text(row.id, String(index))} ListEmptyComponent={<Label muted>{enabled ? 'Waiting for output…' : 'Collection is paused.'}</Label>} renderItem={({ item }) => <View style={{ paddingVertical: 8, gap: 4 }}><Label muted>{text(item.timestamp)} {text(item.source)}</Label><Label>{text(item.message)}</Label></View>} /></View>;
}
