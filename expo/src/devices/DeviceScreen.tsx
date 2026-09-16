import Constants from 'expo-constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { DeviceStream } from '@/devices/DeviceStream';
import { lanHostFromManifest, rewriteLoopbackUrl } from '@/devices/streamUrl';
import { IconButton } from '@/components/icon-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import {
  configUrlForStream,
  encodeButton,
  encodeTouch,
  type TouchPhase,
} from '@/devices/touch';

type DeviceScreenProps = {
  name: string;
  streamUrl: string;
  wsUrl?: string;
  onHome?: () => void;
  preview: {
    wanted: boolean;
    busy: boolean;
    onToggle: () => void;
  };
};

export function DeviceToolbar({
  wanted,
  busy,
  homeDisabled,
  onPreview,
  onHome,
}: {
  wanted: boolean;
  busy: boolean;
  homeDisabled: boolean;
  onPreview: () => void;
  onHome: () => void;
}) {
  return (
    <View style={styles.controls}>
      <IconButton
        icon={wanted ? 'stop' : 'play'}
        variant={wanted ? 'plain' : 'filled'}
        accessibilityLabel={wanted ? 'Stop preview' : 'Start preview'}
        disabled={busy}
        onPress={onPreview}
      />
      <IconButton icon="home" accessibilityLabel="Home" disabled={homeDisabled} onPress={onHome} />
    </View>
  );
}

function deviceLanHost(): string | null {
  if (process.env.EXPO_OS === 'web') return null;
  return lanHostFromManifest([
    process.env.EXPO_PUBLIC_DEVICE_HOST,
    stringField(Constants.expoGoConfig, 'debuggerHost'),
    Constants.expoConfig?.hostUri,
    Constants.linkingUri,
  ]);
}

function stringField(value: object | null | undefined, key: string): string | undefined {
  if (!value || !(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
}

export function DeviceScreen({ name, streamUrl, wsUrl, onHome, preview }: DeviceScreenProps) {
  const theme = useTheme();
  const socketRef = useRef<WebSocket | null>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const [connected, setConnected] = useState(false);
  const [ratio, setRatio] = useState({ width: 9, height: 19.5 });
  const [fit, setFit] = useState({ width: 160, height: 346 });
  const live = useMemo(() => {
    const lanHost = deviceLanHost();
    return {
      streamUrl: rewriteLoopbackUrl(streamUrl, lanHost),
      wsUrl: wsUrl ? rewriteLoopbackUrl(wsUrl, lanHost) : undefined,
    };
  }, [streamUrl, wsUrl]);

  useEffect(() => {
    const url = configUrlForStream(live.streamUrl);
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (!body || typeof body !== 'object') return;
        const width = numberField(body, 'width');
        const height = numberField(body, 'height');
        if (width && height) setRatio({ width, height });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [live.streamUrl]);

  useEffect(() => {
    const socketUrl = live.wsUrl;
    if (!socketUrl) {
      setConnected(false);
      return;
    }
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const socket = new WebSocket(socketUrl);
      socket.binaryType = 'arraybuffer';
      socketRef.current = socket;
      socket.onopen = () => {
        if (!closed) setConnected(true);
      };
      socket.onerror = () => {
        if (!closed) setConnected(false);
      };
      socket.onclose = () => {
        socketRef.current = null;
        if (!closed) {
          setConnected(false);
          retry = setTimeout(connect, 1500);
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [live.wsUrl]);

  const sendTouch = useCallback((phase: TouchPhase, x: number, y: number) => {
    const size = sizeRef.current;
    if (size.width <= 0 || size.height <= 0) return;
    const nx = x / size.width;
    const ny = y / size.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(encodeTouch({ type: phase, x: nx, y: ny }));
    }
  }, []);

  const gesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      'worklet';
      scheduleOnRN(sendTouch, 'begin', event.x, event.y);
    })
    .onUpdate((event) => {
      'worklet';
      scheduleOnRN(sendTouch, 'move', event.x, event.y);
    })
    .onFinalize((event) => {
      'worklet';
      scheduleOnRN(sendTouch, 'end', event.x, event.y);
    });

  function sendHome() {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(encodeButton('home'));
      return;
    }
    onHome?.();
  }

  const aspect = ratio.width / ratio.height;

  return (
    <View style={[styles.stage, { backgroundColor: theme.sidebar }]}>
      <View
        style={styles.fit}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          let nextWidth = width;
          let nextHeight = nextWidth / aspect;
          if (nextHeight > height) {
            nextHeight = height;
            nextWidth = nextHeight * aspect;
          }
          setFit({ width: Math.max(160, nextWidth), height: Math.max(160 / aspect, nextHeight) });
        }}>
        <View
          style={[
            styles.bezel,
            {
              width: fit.width,
              height: fit.height,
              borderColor: theme.lineStrong,
            },
          ]}>
          <View
            style={styles.screen}
            onLayout={(event) => {
              sizeRef.current = {
                width: event.nativeEvent.layout.width,
                height: event.nativeEvent.layout.height,
              };
            }}>
            <DeviceStream uri={live.streamUrl} name={name} />
            <GestureDetector gesture={gesture}>
              <View
                style={styles.hit}
                accessibilityLabel={`Interact with ${name}`}
                accessibilityRole="adjustable"
              />
            </GestureDetector>
          </View>
        </View>
      </View>
      {preview ? (
        <DeviceToolbar
          wanted={preview.wanted}
          busy={preview.busy}
          homeDisabled={!onHome && !connected}
          onPreview={preview.onToggle}
          onHome={sendHome}
        />
      ) : null}
      {live.wsUrl && !connected ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.connecting}>
          Connecting…
        </ThemedText>
      ) : null}
    </View>
  );
}

function numberField(value: object, key: string): number | undefined {
  if (!(key in value)) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'number' && Number.isFinite(field) && field > 0 ? field : undefined;
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  fit: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bezel: {
    padding: 12,
    overflow: 'hidden',
    backgroundColor: '#0b0b0b',
    borderWidth: 1,
    borderRadius: 36,
    borderCurve: 'continuous',
    boxShadow: '0 18px 48px rgba(0, 0, 0, 0.28)',
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: '#000',
  },
  hit: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  controls: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 12,
  },
  connecting: {
    paddingTop: 8,
  },
});
