import { expect, test } from "bun:test";
import { applyMove, dropTarget, groupPatch, type DropSection } from "./reorder";

// Two groups: Devices (a, b) at 0–100, Uncategorized (c, d) at 100–200. Rows are 40 tall.
const sections: DropSection[] = [
  { value: "Devices", top: 0, bottom: 100, rows: [{ id: "a", top: 20, height: 40 }, { id: "b", top: 60, height: 40 }] },
  { value: null, top: 100, bottom: 200, rows: [{ id: "c", top: 120, height: 40 }, { id: "d", top: 160, height: 40 }] },
];
const all = ["a", "b", "x", "c", "d"]; // x is hidden (collapsed done item) after b

test("reorders within a group", () => {
  expect(dropTarget(sections, "b", 25, all)).toEqual({ beforeItemId: "a", value: "Devices", changedGroup: false });
});

test("dropping in the same slot is a no-op", () => {
  expect(dropTarget(sections, "a", 40, all)).toBeNull();
});

test("moving into the no-category group keeps value null", () => {
  expect(dropTarget(sections, "a", 150, all)).toEqual({ beforeItemId: "d", value: null, changedGroup: true });
});

test("dropping after a group's last row goes after hidden rows' predecessor slot", () => {
  expect(dropTarget(sections, "c", 95, all)).toEqual({ beforeItemId: "x", value: "Devices", changedGroup: true });
});

test("dropping past the end lands at the end of the last group", () => {
  expect(dropTarget(sections, "a", 999, all)).toEqual({ beforeItemId: null, value: null, changedGroup: true });
});

test("groupPatch maps the group value to the right field", () => {
  expect(groupPatch("category", null)).toEqual({ category: null });
  expect(groupPatch("release", "v1")).toEqual({ release: "v1" });
  expect(groupPatch("status", "done")).toEqual({ status: "done" });
});

test("applyMove reorders and merges the group change", () => {
  const items = [{ _id: "a", s: 1 }, { _id: "b", s: 1 }, { _id: "c", s: 2 }];
  expect(applyMove(items, "a", "c", { s: 2 })).toEqual([{ _id: "b", s: 1 }, { _id: "a", s: 2 }, { _id: "c", s: 2 }]);
  expect(applyMove(items, "a", null).map((i) => i._id)).toEqual(["b", "c", "a"]);
});
