import { displayContextSegments, formatTokens, type ContextBreakdown, type UsageLike } from "./contextSegments";

const SEGMENT_COLORS = [
  "var(--accent, #6ea8fe)",
  "#7dd3a7",
  "#e6c07b",
  "#d19a66",
  "#c678dd",
  "#56b6c2",
  "#e06c75",
  "#98c379",
];

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const a = polar(cx, cy, r, end);
  const b = polar(cx, cy, r, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 0 ${b.x} ${b.y}`;
}

export function ContextViewer({
  breakdown,
  usage,
}: {
  breakdown?: ContextBreakdown | null;
  usage?: UsageLike | null;
}) {
  const segments = displayContextSegments(breakdown, usage);
  if (segments.length === 0) return null;

  const total = segments.reduce((sum, s) => sum + s.tokens, 0);
  if (total <= 0) return null;

  const cx = 42;
  const cy = 42;
  const r = 34;
  let angle = 0;
  const slices = segments.map((segment, index) => {
    const sweep = (segment.tokens / total) * 360;
    const start = angle;
    const end = angle + Math.max(sweep, total === segment.tokens ? 359.9 : 0.5);
    angle += sweep;
    return {
      ...segment,
      color: SEGMENT_COLORS[index % SEGMENT_COLORS.length]!,
      path: sweep >= 359.9
        ? undefined
        : arcPath(cx, cy, r, start, Math.min(end, start + 359.9)),
      full: sweep >= 359.9,
    };
  });

  return (
    <div className="context-viewer">
      <div className="context-viewer-chart">
        <svg viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">
          {slices.map((slice) =>
            slice.full ? (
              <circle
                key={slice.key}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth="12"
              />
            ) : (
              <path
                key={slice.key}
                d={slice.path}
                fill="none"
                stroke={slice.color}
                strokeWidth="12"
              />
            ),
          )}
          <circle cx={cx} cy={cy} r="24" fill="var(--bg)" />
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            className="context-viewer-total"
          >
            {formatTokens(total)}
          </text>
          <text
            x={cx}
            y={cy + 11}
            textAnchor="middle"
            className="context-viewer-caption"
          >
            tokens
          </text>
        </svg>
      </div>
      <ul className="context-viewer-legend">
        {slices.map((slice) => (
          <li key={slice.key}>
            <i style={{ background: slice.color }} />
            <span>{slice.label}</span>
            <strong>{formatTokens(slice.tokens)}</strong>
            <em>{Math.round((slice.tokens / total) * 100)}%</em>
          </li>
        ))}
      </ul>
      <p className="muted context-viewer-note">
        {breakdown?.estimated
          ? "Factory prompt estimate (≈4 chars/token). Other context is provider input beyond that launch prompt — rules, tools, history, and model extras."
          : "Prompt composition for this Run."}
      </p>
    </div>
  );
}
