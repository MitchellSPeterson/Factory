import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DeviceScreen, useActiveDeviceClient, type ActiveDeviceTarget } from '../vendor/expo-hub-client/src';
import { record, text, parseMessage } from '../src/devices/hub/protocol';

const commands = [
  'attachLogs', 'detachLogs', 'clearLogs', 'attachEvents', 'detachEvents', 'clearEvents',
  'setDeviceSetting', 'clearCameraImage', 'refreshAccessibility', 'setLocation', 'clearLocation',
  'setPermission', 'resetPermissions', 'refreshPermissions', 'updateStreamSettings',
  'setStreamSource', 'setGrpcImageMode', 'setGrpcEncoder', 'setGrpcInputSource',
  'setStreamStatsEnabled', 'setWebRtcCodec', 'pressButton', 'reload', 'rotate', 'screenshot',
  'setAppearance', 'setHardwareKeyboardConnected', 'toggleSoftwareKeyboard', 'sendKey',
] as const;
function isCommand(value: unknown): value is typeof commands[number] {
  return commands.some((name) => name === value);
}
function post(value: unknown) {
  const data = JSON.stringify(value, (_key, item) => item instanceof Set ? [...item] : item);
  const bridge: unknown = Reflect.get(window, 'ReactNativeWebView');
  if (bridge !== null && typeof bridge === 'object') {
    const postMessage: unknown = Reflect.get(bridge, 'postMessage');
    if (typeof postMessage === 'function') {
      Reflect.apply(postMessage, bridge, [data]);
      return;
    }
  }
  window.parent.postMessage(data, '*');
}
function Renderer() {
  const [target, setTarget] = useState<ActiveDeviceTarget | null>(null);
  const hubBase = new URL(document.baseURI).origin;
  const client = useActiveDeviceClient(target, hubBase);
  const latest = useRef(client);
  latest.current = client;
  useEffect(() => {
    let live = true;
    const receive = async (event: MessageEvent) => {
      const message = typeof event.data === 'string' ? parseMessage(event.data) : record(event.data);
      try {
        if (message.type === 'select') {
          if (message.target === null) { setTarget(null); return; }
          const selection = record(message.target);
          if ((selection.platform !== 'ios' && selection.platform !== 'android') ||
              typeof selection.device !== 'string' ||
              !['webrtc', 'h264', 'mjpeg'].includes(text(selection.streamMode))) return;
          const streamMode = selection.streamMode;
          if (streamMode !== 'webrtc' && streamMode !== 'h264' && streamMode !== 'mjpeg') return;
          setTarget({ platform: selection.platform, device: selection.device, streamMode });
        } else if (message.type === 'camera') {
          if (message.facing !== 'front' && message.facing !== 'back') return;
          const response = await fetch(text(message.data));
          latest.current.setCameraImage(message.facing, await response.blob());
        } else if (message.type === 'command') {
          const command = record(message.command);
          if (!isCommand(command.method) || !Array.isArray(command.args)) return;
          const result = await Reflect.apply(latest.current[command.method], latest.current, command.args);
          if (result instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => { if (live) post({ type: 'screenshot', data: reader.result }); };
            reader.readAsDataURL(result);
          }
        }
      } catch (error) {
        if (live) post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    };
    window.addEventListener('message', receive);
    document.addEventListener('message', receive);
    post({ type: 'ready' });
    let previous = '';
    const timer = setInterval(() => {
      const value = latest.current;
      const state = Object.fromEntries(Object.entries(value).filter(([, field]) => typeof field !== 'function'));
      const encoded = JSON.stringify(state, (_key, item) => item instanceof Set ? [...item] : item);
      if (encoded !== previous) { previous = encoded; post({ type: 'state', state, device: target?.device }); }
    }, 250);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('message', receive);
      document.removeEventListener('message', receive);
    };
  }, [target?.device]);
  const width = client.screen?.width ?? 9;
  const height = client.screen?.height ?? 19.5;
  const landscape = client.screen?.orientation?.startsWith('landscape');
  const ratio = landscape ? height / width : width / height;
  return <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000' }}>
    <div style={{ position: 'relative', aspectRatio: ratio, width: `min(100vw, ${ratio * 100}vh)`, maxHeight: '100%' }}>
      <DeviceScreen client={client} />
    </div>
  </div>;
}
const root = document.getElementById('root');
if (root) createRoot(root, {
  onUncaughtError: error => post({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
}).render(<Renderer />);
