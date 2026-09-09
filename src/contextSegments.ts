import { formatTokens } from "./formatTokens";

export type ContextSegment = {
  key: string;
  label: string;
  tokens: number;
};

export type ContextBreakdown = {
  estimated: boolean;
  segments: ContextSegment[];
};

export type UsageLike = {
  inputTokens: number;
  outputTokens: number;
};

/** Merge Factory estimates with provider input so leftover shows as other context. */
export function displayContextSegments(
  breakdown: ContextBreakdown | null | undefined,
  usage: UsageLike | null | undefined,
): ContextSegment[] {
  const base = breakdown?.segments.filter((s) => s.tokens > 0) ?? [];
  const estimated = base.reduce((sum, s) => sum + s.tokens, 0);
  const input = usage?.inputTokens ?? 0;
  const other = input > estimated ? input - estimated : 0;
  const segments = [...base];
  if (other > 0) {
    segments.push({
      key: "other",
      label: "Other context",
      tokens: other,
    });
  }
  if (usage && usage.outputTokens > 0) {
    segments.push({
      key: "output",
      label: "Output",
      tokens: usage.outputTokens,
    });
  }
  return segments;
}

export { formatTokens };
