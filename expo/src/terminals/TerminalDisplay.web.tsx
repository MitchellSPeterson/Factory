import { useEffect, useRef, useState } from "react";
import html from "./renderer.generated.json";
import { receive, type TerminalDisplayProps } from "./protocol";

export function TerminalDisplay(props: TerminalDisplayProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    function message(event: MessageEvent) {
      if (
        event.source === frame.current?.contentWindow &&
        typeof event.data === "string"
      )
        receive(event.data, latest.current, () => setReady(true));
    }
    window.addEventListener("message", message);
    return () => window.removeEventListener("message", message);
  }, []);
  useEffect(() => {
    if (ready)
      frame.current?.contentWindow?.postMessage(
        JSON.stringify({
          output: props.output,
          outputEnd: props.outputEnd,
          enabled: props.enabled,
        }),
        "*",
      );
  }, [ready, props.output, props.outputEnd, props.enabled]);
  return (
    <iframe
      ref={frame}
      title="Interactive terminal"
      srcDoc={html}
      sandbox="allow-scripts"
      style={{
        border: 0,
        width: "100%",
        height: "100%",
        flex: 1,
        minHeight: 0,
        background: "#101113",
      }}
    />
  );
}
