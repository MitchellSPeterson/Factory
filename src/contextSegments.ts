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

const DEFAULT_CONTEXT_WINDOW = 256_000;

const MODEL_WINDOWS: Array<{ match: string; tokens: number }> = [
  { match: "claude", tokens: 200_000 },
  { match: "grok", tokens: 256_000 },
  { match: "composer", tokens: 256_000 },
  { match: "auto-smart", tokens: 256_000 },
  { match: "gpt", tokens: 256_000 },
];

/** Context window the model will accept. Unknown models use 256k. */
export function modelContextWindow(model: string | undefined) {
  if (!model) return DEFAULT_CONTEXT_WINDOW;
  const key = model.toLowerCase();
  const hit = MODEL_WINDOWS.find((row) => key.includes(row.match));
  return hit?.tokens ?? DEFAULT_CONTEXT_WINDOW;
}

export function latestAgentContext<T extends { contextBreakdown?: ContextBreakdown | null; usage?: UsageLike | null }>(
  runs: readonly T[],
) {
  for (let index = runs.length - 1; index >= 0; index--) {
    const run = runs[index];
    if (!run) continue;
    if (run.contextBreakdown || run.usage) return run;
  }
  return null;
}

export function contextFill(used: number, windowTokens: number) {
  if (windowTokens <= 0 || used <= 0) return 0;
  return Math.min(1, used / windowTokens);
}
