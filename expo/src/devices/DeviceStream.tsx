import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { readMjpegFrames, uint8ToBase64 } from '@/devices/mjpeg';
import { rawStreamUrl } from '@/devices/streamUrl';

export function DeviceStream({ uri }: { uri: string; name: string }) {
  const [frame, setFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const latest = useRef<Uint8Array | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    latest.current = null;
    setFrame(null);
    setError(null);
    const timeout = setTimeout(() => {
      if (!latest.current) setError('Waiting for frames from this machine.');
    }, 5000);
    void readMjpegFrames({
      url: rawStreamUrl(uri),
      signal: controller.signal,
      onFrame: (bytes) => {
        if (controller.signal.aborted) return;
        latest.current = bytes;
        if (raf.current != null) return;
        raf.current = requestAnimationFrame(() => {
          raf.current = null;
          const next = latest.current;
          if (!next) return;
          setFrame(`data:image/jpeg;base64,${uint8ToBase64(next)}`);
        });
      },
    }).catch((err: unknown) => {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Could not open this stream.');
    });
    return () => {
      controller.abort();
      clearTimeout(timeout);
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [uri]);

  return (
    <View
      style={styles.stream}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}>
      {frame && size.width > 0 ? (
        <Image
          source={{ uri: frame }}
          style={{ width: size.width, height: size.height }}
          resizeMode="stretch"
          fadeDuration={0}
        />
      ) : (
        <View style={styles.message}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.messageText}>
            {error ?? 'Connecting…'}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stream: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000',
  },
  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  messageText: {
    textAlign: 'center',
  },
});
