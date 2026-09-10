import { useEffect, useId, useRef, useState } from "react";
import {
  contextFill,
  displayContextSegments,
  formatTokens,
  type ContextBreakdown,
  type UsageLike,
} from "./contextSegments";

const SEGMENT_COLORS = [
  "var(--accent)",
  "#7dd3a7",
  "#e6c07b",
  "#d19a66",
  "#c678dd",
  "#56b6c2",
  "#e06c75",
  "#98c379",
];

function colorFor(index: number) {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length] ?? "var(--accent)";
}

function fillStroke(ratio: number) {
  if (ratio >= 0.95) return "var(--danger)";
  if (ratio >= 0.8) return "var(--attention)";
  return "var(--accent)";
}

export function ContextMeter({
  breakdown,
  usage,
  windowTokens,
}: {
  breakdown?: ContextBreakdown | null;
  usage?: UsageLike | null;
  windowTokens: number;
}) {
  const segments = displayContextSegments(breakdown, usage);
  const used = segments.reduce((sum, segment) => sum + segment.tokens, 0);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const labelId = useId();
  if (used <= 0) return null;

  const ratio = contextFill(used, windowTokens);
  const percent = Math.round(ratio * 100);
  const remaining = Math.max(0, windowTokens - used);
  const radius = 7.25;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * ratio;
  const stroke = fillStroke(ratio);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="context-meter" ref={root}>
      <button
        type="button"
        className="context-ring"
        aria-label="Show context usage"
        aria-expanded={open}
        aria-controls={labelId}
        title="Show context usage"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            stroke="var(--muted)"
            strokeWidth="2.5"
            opacity="0.45"
          />
          <circle
            cx="10"
            cy="10"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 10 10)"
          />
        </svg>
      </button>
      {open ? (
        <div className="context-popover" id={labelId} role="dialog" aria-label="Context usage">
          <div className="context-popover-head">
            <h3>Context</h3>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="context-popover-readout">
            <strong>{percent >= 100 ? "Full" : `${percent}% full`}</strong>
            <span>
              ~{formatTokens(used)} / {formatTokens(windowTokens)} tokens
            </span>
          </div>
          <div className="context-bar" aria-hidden="true">
            {segments.map((segment, index) => (
              <i
                key={segment.key}
                style={{ flexGrow: Math.max(segment.tokens, 1), background: colorFor(index) }}
                title={segment.label}
              />
            ))}
            {remaining > 0 ? <i className="context-bar-free" style={{ flexGrow: remaining }} /> : null}
          </div>
          <ul className="context-legend">
            {segments.map((segment, index) => (
              <li key={segment.key}>
                <i style={{ background: colorFor(index) }} />
                <span>{segment.label}</span>
                <strong>{formatTokens(segment.tokens)}</strong>
              </li>
            ))}
          </ul>
          <p className="muted context-viewer-note">
            {breakdown?.estimated
              ? "Factory prompt estimate (≈4 chars/token). Other context is tools, history, and model extras."
              : "Prompt composition for this Agent."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
