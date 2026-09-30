import { useMemo, useRef } from "react";
import { isolatedArtifactHtml, type ArtifactPreviewProps } from "./artifacts";

export function ArtifactPreview({
  html,
  title,
  pinning,
  pins = [],
  onPin,
  onSelectPin,
}: ArtifactPreviewProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const source = useMemo(() => isolatedArtifactHtml(html), [html]);
  return (
    <div
      ref={wrapper}
      style={{
        position: "relative",
        width: "100%",
        height: 520,
        background: "#fff",
        overflow: "hidden",
        borderRadius: 10,
      }}
    >
      <iframe
        title={title}
        srcDoc={source}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{ width: "100%", height: "100%", border: 0 }}
      />
      {pinning && (
        <button
          aria-label="Choose a location for your comment"
          onClick={(event) => {
            const rect = wrapper.current?.getBoundingClientRect();
            if (!rect) return;
            onPin?.({
              x: Math.max(
                0,
                Math.min(1, (event.clientX - rect.left) / rect.width),
              ),
              y: Math.max(
                0,
                Math.min(1, (event.clientY - rect.top) / rect.height),
              ),
              viewportWidth: rect.width,
              viewportHeight: rect.height,
            });
          }}
          style={{
            position: "absolute",
            inset: 0,
            border: 0,
            cursor: "crosshair",
            background: "rgba(99,102,241,.07)",
          }}
        />
      )}
      {pins.map((pin, index) => (
        <button
          key={pin.id}
          aria-label={`${pin.resolved ? "Resolved" : "Unresolved"} comment ${index + 1}: ${pin.label}`}
          onClick={() => onSelectPin?.(pin.id)}
          style={{
            position: "absolute",
            left: `${pin.anchor.x * 100}%`,
            top: `${pin.anchor.y * 100}%`,
            transform: "translate(-50%,-50%)",
            width: 28,
            height: 28,
            borderRadius: 14,
            background: pin.resolved ? "#52525b" : "#6366f1",
            color: "white",
            fontWeight: 600,
            border: "2px solid white",
            cursor: "pointer",
            boxShadow: "0 2px 8px #0004",
          }}
        >
          {index + 1}
        </button>
      ))}
    </div>
  );
}
