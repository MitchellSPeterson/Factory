import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '@/hooks/use-theme';
import renderer from './renderer.generated.json';
import { record, parseMessage, type HubMessage, type StreamSelection } from './protocol';

export function StreamView({ baseUrl, selection, onState, onError, onScreenshot, bind }: {
  baseUrl: string; selection: StreamSelection | null;
  onState: (state: Record<string, unknown>) => void;
  onError: (message: string) => void;
  onScreenshot: (data: string) => void;
  bind: (send: ((message: HubMessage) => void) | null) => void;
}) {
  const theme = useTheme();
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const latest = useRef(selection);
  latest.current = selection;
  const source = useMemo(() => {
    const href = `${baseUrl}/`.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    return { html: renderer.replace('<head>', `<head><base href="${href}">`), baseUrl: `${baseUrl}/` };
  }, [baseUrl]);
  useEffect(() => {
    ready.current = false;
    const timeout = setTimeout(() => {
      if (!ready.current) onError('The stream renderer could not start. Reopen Devices to reconnect.');
    }, 15000);
    return () => clearTimeout(timeout);
  }, [source, onError]);
  useEffect(() => {
    bind((message) => web.current?.postMessage(JSON.stringify(message)));
    return () => bind(null);
  }, [bind]);
  useEffect(() => {
    if (ready.current) web.current?.postMessage(JSON.stringify({ type: 'select', target: selection }));
  }, [selection]);
  return <View style={{ flex: 1, backgroundColor: theme.sidebar }}><WebView
    ref={web} source={source} style={{ flex: 1, backgroundColor: 'transparent' }}
    originWhitelist={['http://*', 'https://*', 'about:blank']}
    allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false}
    scrollEnabled={false} bounces={false} setSupportMultipleWindows={false}
    onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url === `${baseUrl}/`}
    onLoadStart={() => { ready.current = false; }}
    onError={(event) => onError(event.nativeEvent.description)}
    onContentProcessDidTerminate={() => { ready.current = false; web.current?.reload(); }}
    onMessage={(event) => {
      const message = parseMessage(event.nativeEvent.data);
      if (message.type === 'ready') {
        ready.current = true;
        onError('');
        web.current?.postMessage(JSON.stringify({ type: 'select', target: latest.current }));
      } else if (message.type === 'state' && message.device === latest.current?.device && message.state && typeof message.state === 'object' && !Array.isArray(message.state)) {
        onState(record(message.state));
      } else if (message.type === 'error' && typeof message.message === 'string') onError(message.message);
      else if (message.type === 'screenshot' && typeof message.data === 'string') onScreenshot(message.data);
    }}
  /></View>;
}
