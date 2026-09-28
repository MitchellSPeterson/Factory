import { useEffect, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { EmptyState } from 'panelui-native/components/empty-state';
import { Item } from 'panelui-native/components/item';
import { ActionButton } from '@/components/action-button';
import { type HubDevice, hubRequest } from './api';
import { items, record, text } from './protocol';
import { Choice, Field, Group, Label, Sheet, styles, options } from './controls';

export function DeviceList({ visible, onClose, devices, selected, onSelect, baseUrl, refresh }: {
  visible: boolean; onClose: () => void; devices: HubDevice[]; selected?: string;
  onSelect: (device: HubDevice) => void; baseUrl: string; refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  async function action(device: HubDevice, kind: 'boot' | 'shutdown' | 'remove') {
    setBusy(device.id); setError('');
    try { await hubRequest(baseUrl, `/api/devices/${kind}`, device); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(''); }
  }
  return <Sheet title="Devices" visible={visible} onClose={onClose} scroll={false}>
    <View className="gap-3 p-4"><ActionButton label="Add device" onPress={() => setCreating(true)} />{error ? <Label>{error}</Label> : null}</View>
    <FlatList style={styles.sheetFill} nestedScrollEnabled keyboardShouldPersistTaps="handled" data={devices} keyExtractor={d => `${d.platform}:${d.id}`} ListEmptyComponent={<EmptyState size="sm" className="px-4 py-8"><EmptyState.Title>No devices installed</EmptyState.Title><EmptyState.Description>Add a device to get started.</EmptyState.Description></EmptyState>} renderItem={({ item }) => <View className={`gap-2 border-b border-border p-2 ${selected === item.id ? 'bg-primary/15' : ''}`}>
      <Item accessibilityLabel={`Select ${item.name}`} disabled={!item.booted || !item.supported} onPress={() => { onSelect(item); onClose(); }} className="p-2">
        <Item.Content>
          <Item.Title>{item.name}</Item.Title>
          <Item.Description>{item.version} · {item.booted ? 'Running' : 'Shut down'}{!item.supported ? ' · Unsupported' : ''}</Item.Description>
        </Item.Content>
      </Item>
      <View className="flex-row gap-2"><ActionButton variant="ghost" label={busy === item.id ? 'Working…' : item.booted ? 'Shut down' : 'Boot'} disabled={!!busy || item.physical} onPress={() => void action(item, item.booted ? 'shutdown' : 'boot')} />
        {!item.physical && <ActionButton variant="ghost" label="Remove" disabled={!!busy} onPress={() => Alert.alert(`Remove ${item.name}?`, 'This deletes the device and its data.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void action(item, 'remove') }])} />}</View>
    </View>} />
    <CreateDevice visible={creating} baseUrl={baseUrl} onClose={() => setCreating(false)} onCreated={refresh} />
  </Sheet>;
}
function CreateDevice({ visible, baseUrl, onClose, onCreated }: { visible: boolean; baseUrl: string; onClose: () => void; onCreated: () => Promise<void> }) {
  const [catalog, setCatalog] = useState<Record<string, unknown>>({});
  const [platform, setPlatform] = useState('ios');
  const [runtime, setRuntime] = useState('');
  const [model, setModel] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    void hubRequest(baseUrl, '/api/new-device-options', undefined, controller.signal).then(setCatalog).catch(error => { if (!controller.signal.aborted) setError(String(error)); });
    return () => controller.abort();
  }, [visible, baseUrl]);
  const runtimes = items(record(catalog[platform]).runtimes).map(record);
  const activeRuntime = runtimes.find(r => r.value === runtime) ?? runtimes[0];
  const models = items(activeRuntime?.models).map(record).filter(m => m.supported !== false);
  const activeModel = models.find(m => m.value === model) ?? models[0];
  async function create() {
    if (!activeRuntime || !activeModel || !name.trim()) return;
    setBusy(true); setError('');
    try { await hubRequest(baseUrl, '/api/devices/create', { platform, name: name.trim(), runtime: activeRuntime.value, deviceType: activeModel.value }); await onCreated(); onClose(); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  }
  return <Sheet title="Add device" visible={visible} onClose={onClose}><Group title="New device">
    <Choice label="Platform" value={platform} options={options(['ios', 'android'])} onChange={value => { setPlatform(value); setRuntime(''); setModel(''); }} />
    <Choice label="Runtime" value={text(activeRuntime?.value)} options={runtimes.map(r => ({ value: text(r.value), label: text(r.label) }))} onChange={value => { setRuntime(value); setModel(''); }} />
    <Choice label="Model" value={text(activeModel?.value)} options={models.map(m => ({ value: text(m.value), label: text(m.label) }))} onChange={setModel} />
    <Field label="Name" value={name} onChange={setName} />
    {!activeRuntime && <Label muted>No installed runtimes for this platform. Install one in Xcode or Android Studio.</Label>}
    {error ? <Label>{error}</Label> : null}
    <ActionButton label={busy ? 'Creating…' : 'Create and boot'} disabled={busy || !activeModel || !name.trim()} onPress={() => void create()} />
  </Group></Sheet>;
}
