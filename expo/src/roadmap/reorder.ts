// Pure drop math for Roadmap drag-to-reorder. No React, no gesture code — see DragRow.tsx.
import type { RoadmapItemPatch } from "../../../shared/roadmap";

export type GroupBy = "category" | "status" | "release";

/** A rendered group and its visible rows, measured in list-content coordinates. */
export type DropSection = {
  value: string | null; // what groupPatch() needs to move an item into this group
  top: number;
  bottom: number;
  rows: { id: string; top: number; height: number }[];
};

/**
 * Where a dragged row lands. dropY is the row's centre after the drag. globalIds is the whole
 * Roadmap in order (including hidden rows) so a drop after a group's last row keeps hidden items in place.
 * Returns null when nothing moves.
 */
export function dropTarget(
  sections: DropSection[],
  draggedId: string,
  dropY: number,
  globalIds: string[],
): { beforeItemId: string | null; value: string | null; changedGroup: boolean } | null {
  const from = sections.find((section) => section.rows.some((row) => row.id === draggedId));
  if (!from || sections.length === 0) return null;
  const to =
    sections.find((section) => dropY >= section.top && dropY < section.bottom) ??
    (dropY < sections[0]!.top ? sections[0]! : sections[sections.length - 1]!);
  const rows = to.rows.filter((row) => row.id !== draggedId);
  const changedGroup = to !== from;
  const next = rows.find((row) => dropY < row.top + row.height / 2);
  let beforeItemId: string | null;
  if (next) beforeItemId = next.id;
  else if (rows.length > 0) {
    const others = globalIds.filter((id) => id !== draggedId);
    beforeItemId = others[others.indexOf(rows[rows.length - 1]!.id) + 1] ?? null;
  } else return changedGroup ? { beforeItemId: null, value: to.value, changedGroup } : null;
  // Same slot it already had: nothing to do.
  const current = globalIds[globalIds.indexOf(draggedId) + 1] ?? null;
  if (!changedGroup && beforeItemId === current) return null;
  return { beforeItemId, value: to.value, changedGroup };
}

/** Translates a drop into the field(s) `roadmap.moveItem` should patch to move the item into that group. */
export function groupPatch(groupBy: GroupBy, value: string | null): RoadmapItemPatch {
  if (groupBy === "status") return { status: (value as RoadmapItemPatch["status"]) ?? "idea" };
  if (groupBy === "category") return { category: value };
  return { release: value };
}

/** Optimistic local copy of a move: item placed before beforeItemId (null = end) with `change` merged in. */
export function applyMove<T extends { _id: string }>(
  items: T[],
  itemId: string,
  beforeItemId: string | null,
  change: Partial<T> = {},
): T[] {
  const moving = items.find((item) => item._id === itemId);
  if (!moving) return items;
  const rest = items.filter((item) => item._id !== itemId);
  const at = beforeItemId === null ? rest.length : rest.findIndex((item) => item._id === beforeItemId);
  const index = at === -1 ? rest.length : at;
  return [...rest.slice(0, index), { ...moving, ...change }, ...rest.slice(index)];
}
