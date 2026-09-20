import { useMutation, useQuery } from '@/lib/factory';
import { useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/action-button';
import { EmptyState } from '@/components/empty-state';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { DeviceScreen, DeviceToolbar } from '@/devices/DeviceScreen';
import { preferredDevice, type SimDevice } from '@/devices/preferredDevice';
import { api } from '@/lib/api';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function DevicesPage() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const live = useQuery(api.servers.local);
  const setWanted = useMutation(api.servers.setSimHubWanted);
  const enqueue = useMutation(api.servers.enqueueDeviceCommand);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const hub = live?.simHub;
  const devices = hub?.devices ?? [];
  const online = !!(live && now - live.lastSeen < 45_000);
  const wanted = live?.simHubWanted === true;
  const current = devices.find((device) => device.udid === selected) ?? preferredDevice(devices);

  useEffect(() => {
    if (current && current.udid !== selected) setSelected(current.udid);
  }, [current, selected]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: current?.name ?? 'Devices',
      headerRight: () => (
        <View style={styles.headerRight}>
          <IconButton
            icon="devices"
            accessibilityLabel="Simulators"
            onPress={() => setListOpen(true)}
          />
        </View>
      ),
    });
  }, [navigation, current?.name]);

  async function run(label: string, work: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this Device.');
    } finally {
      setBusy('');
    }
  }

  function togglePreview() {
    void run(wanted ? 'stop' : 'start', () => setWanted({ wanted: !wanted }));
  }

  const preview = {
    wanted,
    busy: busy !== '',
    onToggle: togglePreview,
  };

  const listModal = (
    <DeviceListModal
      visible={listOpen}
      wide={width >= 760}
      devices={devices}
      currentId={current?.udid}
      busy={busy}
      onClose={() => setListOpen(false)}
      onSelect={(udid) => {
        setSelected(udid);
        setListOpen(false);
      }}
      onToggle={(device) =>
        void run(device.udid, () =>
          enqueue({
            command: device.state === 'booted' ? { kind: 'shutdown', udid: device.udid } : { kind: 'boot', udid: device.udid },
          }),
        )
      }
    />
  );

  if (live === undefined) {
    return (
      <View style={[styles.shell, { backgroundColor: theme.background }]}>
        <EmptyState title="Devices" body="Checking this machine…" />
        {listModal}
      </View>
    );
  }

  if (live === null || !online) {
    return (
      <View style={[styles.shell, { backgroundColor: theme.background }]}>
        <EmptyState title="Devices" body="This machine is offline. Start the worker, then return here." />
        {listModal}
      </View>
    );
  }

  if (hub && !hub.supported) {
    return (
      <View style={[styles.shell, { backgroundColor: theme.background }]}>
        <EmptyState title="Devices" body={hub.message ?? 'iOS Simulator preview needs macOS with Xcode.'} />
        {listModal}
      </View>
    );
  }

  return (
    <View style={[styles.shell, { backgroundColor: theme.background }]}>
      {current?.streamUrl ? (
        <DeviceScreen
          name={current.name}
          streamUrl={current.streamUrl}
          wsUrl={current.wsUrl}
          preview={preview}
          onHome={() =>
            void run('home', () =>
              enqueue({ command: { kind: 'button', udid: current.udid, name: 'home' } }),
            )
          }
        />
      ) : (
        <View style={styles.empty}>
          <EmptyState
            title={current?.name ?? 'No Device selected'}
            body={
              current?.state === 'booted'
                ? wanted
                  ? 'Waiting for serve-sim to publish this stream.'
                  : 'Start preview to watch and interact with this simulator.'
                : 'Boot a simulator, then start preview.'
            }
          />
          <DeviceToolbar
            wanted={wanted}
            busy={busy !== ''}
            homeDisabled
            onPreview={togglePreview}
            onHome={() => {}}
          />
        </View>
      )}
      {error ? (
        <ThemedText type="small" style={[styles.error, { color: theme.danger }]} accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
      {listModal}
    </View>
  );
}

function DeviceListModal({
  visible,
  wide,
  devices,
  currentId,
  busy,
  onClose,
  onSelect,
  onToggle,
}: {
  visible: boolean;
  wide: boolean;
  devices: SimDevice[];
  currentId?: string;
  busy: string;
  onClose: () => void;
  onSelect: (udid: string) => void;
  onToggle: (device: SimDevice) => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss simulators"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.sheet,
            wide ? styles.sheetWide : styles.sheetNarrow,
            { backgroundColor: theme.backgroundElement, borderColor: theme.line },
          ]}>
          <SafeAreaView edges={wide ? [] : ['bottom']}>
            <View style={[styles.sheetHead, { borderBottomColor: theme.line }]}>
              <ThemedText type="section">Simulators</ThemedText>
              <IconButton icon="close" accessibilityLabel="Close" onPress={onClose} />
            </View>
            <ScrollView contentContainerStyle={styles.listContent} accessibilityLabel="Simulators">
              {devices.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No simulators yet. Add one in Xcode → Settings → Platforms.
                </ThemedText>
              ) : (
                devices.map((device) => (
                  <DeviceRow
                    key={device.udid}
                    device={device}
                    active={currentId === device.udid}
                    busy={busy === device.udid}
                    disabled={busy !== ''}
                    onSelect={() => onSelect(device.udid)}
                    onToggle={() => onToggle(device)}
                  />
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

function DeviceRow({
  device,
  active,
  busy,
  disabled,
  onSelect,
  onToggle,
}: {
  device: SimDevice;
  active: boolean;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const detail = device.runtime ? `${device.runtime} · ${device.state}` : device.state;

  return (
    <View style={[styles.row, active && { backgroundColor: theme.backgroundSelected }]}>
      <Pressable
        accessibilityRole="button"
        onPress={onSelect}
        style={({ pressed }) => [styles.rowMain, pressed && { backgroundColor: theme.subtleHover }]}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {device.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.rowDetail}>
          {detail}
        </ThemedText>
      </Pressable>
      <ActionButton
        variant="ghost"
        disabled={disabled}
        label={busy ? '…' : device.state === 'booted' ? 'Shut down' : 'Boot'}
        onPress={onToggle}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  empty: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 16,
  },
  headerRight: {
    marginRight: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    maxHeight: '80%',
    overflow: 'hidden',
    borderWidth: 1,
    borderCurve: 'continuous',
  },
  sheetWide: {
    width: 420,
    maxWidth: '100%',
    alignSelf: 'center',
    borderRadius: 16,
  },
  sheetNarrow: {
    marginTop: 'auto',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  listContent: {
    gap: 6,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingLeft: 2,
    paddingRight: 4,
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderCurve: 'continuous',
    gap: 2,
  },
  rowDetail: {
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    paddingHorizontal: 28,
    paddingTop: 10,
    paddingBottom: 16,
  },
});
