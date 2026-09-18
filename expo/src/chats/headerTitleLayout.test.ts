import { expect, test } from "bun:test";
import { chatHeaderTitleMaxWidth } from "./headerTitleLayout";

test("Android leaves room for two header icon buttons", () => {
  const maxWidth = chatHeaderTitleMaxWidth({
    windowWidth: 360,
    insetStart: 0,
    insetEnd: 0,
    trailingActionCount: 2,
    centered: false,
  });
  expect(maxWidth).toBe(360 - 52 - 108);
  expect(maxWidth).toBeLessThan(360 - 52 - 52);
});

test("a selected chat reserves a third header button", () => {
  expect(
    chatHeaderTitleMaxWidth({
      windowWidth: 360,
      insetStart: 0,
      insetEnd: 0,
      trailingActionCount: 3,
      centered: false,
    }),
  ).toBe(360 - 52 - 156);
});

test("iOS centered title uses the wider chrome on both sides", () => {
  const maxWidth = chatHeaderTitleMaxWidth({
    windowWidth: 390,
    insetStart: 0,
    insetEnd: 0,
    trailingActionCount: 2,
    centered: true,
  });
  expect(maxWidth).toBe(390 - 108 * 2);
});

test("list title without actions still has a floor", () => {
  expect(
    chatHeaderTitleMaxWidth({
      windowWidth: 200,
      insetStart: 20,
      insetEnd: 20,
      trailingActionCount: 0,
      centered: false,
    }),
  ).toBe(96);
});
