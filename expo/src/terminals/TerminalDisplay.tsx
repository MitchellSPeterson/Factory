import { useEffect, useRef, useState } from "react";
import { WebView } from "react-native-webview";
import html from "./renderer.generated.json";
import { receive, type TerminalDisplayProps } from "./protocol";

export function TerminalDisplay(props: TerminalDisplayProps) {
  const frame = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready)
      frame.current?.injectJavaScript(
        `window.factoryTerminal(${JSON.stringify({ output: props.output, outputEnd: props.outputEnd, enabled: props.enabled })});true;`,
      );
  }, [ready, props.output, props.outputEnd, props.enabled]);
  return (
    <WebView
      ref={frame}
      source={{ html }}
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={(request) => request.url === "about:blank"}
      onMessage={(event) =>
        receive(event.nativeEvent.data, props, () => setReady(true))
      }
      keyboardDisplayRequiresUserAction={false}
      scrollEnabled={false}
      style={{ flex: 1, backgroundColor: "#101113" }}
    />
  );
}
