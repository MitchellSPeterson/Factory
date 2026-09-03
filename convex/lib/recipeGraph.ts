import { recipeEffort, recipeModel } from "./agentModel";

export type StageLike = {
  key: string;
  order: number;
  halt?: boolean;
  model?: string;
  effort?: string;
};

export function sortStages<T extends { order: number }>(stages: T[]): T[] {
  return [...stages].sort((a, b) => a.order - b.order);
}

export function firstStage<T extends { order: number }>(stages: T[]): T | null {
  return sortStages(stages)[0] ?? null;
}

export function nextStage<T extends { key: string; order: number }>(
  stages: T[],
  currentKey: string,
): T | null {
  const ordered = sortStages(stages);
  const i = ordered.findIndex((s) => s.key === currentKey);
  if (i < 0) return null;
  return ordered[i + 1] ?? null;
}

export function stageHalt(stage: { key: string; halt?: boolean }): boolean {
  if (stage.halt !== undefined) return stage.halt;
  return stage.key === "plan" || stage.key === "verify";
}

export function isPlanStage(key: string): boolean {
  return key === "plan";
}

export function isPrStage(key: string): boolean {
  return key === "pr";
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "stage";
}

export function parseStageKey(raw: string): string {
  const key = slugify(raw);
  if (!/^[a-z][a-z0-9-]*$/.test(key)) {
    throw new Error("Stage key must start with a letter");
  }
  return key;
}

export function uniqueKey(existing: string[], raw: string): string {
  const base = parseStageKey(raw);
  if (!existing.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const next = `${base.slice(0, 36)}-${n}`;
    if (!existing.includes(next)) return next;
  }
  throw new Error("Could not mint a unique Stage key");
}

export function placeStage<T>(
  stages: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const next = [...stages];
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= next.length ||
    toIndex >= next.length ||
    fromIndex === toIndex
  ) {
    return next;
  }
  const [item] = next.splice(fromIndex, 1);
  if (item === undefined) return next;
  next.splice(toIndex, 0, item);
  return next;
}

export function stageAgent(
  stage: { model?: string; effort?: string },
  recipe: { model?: string; effort?: string },
) {
  return {
    model: recipeModel(stage.model ?? recipe.model),
    effort: recipeEffort(stage.effort ?? recipe.effort),
  };
}
