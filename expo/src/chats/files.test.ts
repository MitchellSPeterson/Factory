import { expect, test } from "bun:test";
import { formatBytes, parentPath } from "./files";

test("parentPath walks up one folder", () => {
  expect(parentPath("src/app/index.tsx")).toBe("src/app");
  expect(parentPath("src")).toBe("");
});

test("formatBytes", () => {
  expect(formatBytes(20)).toBe("20 B");
  expect(formatBytes(2048)).toBe("2 KB");
  expect(formatBytes(3 * 1024 * 1024)).toBe("3 MB");
});
