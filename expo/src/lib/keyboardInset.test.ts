import { expect, test } from "bun:test";
import { dockedBottomPad, visibleKeyboardInset } from "./keyboardInset";

test("android keyboard overlap includes the navigation bar RN subtracts", () => {
  expect(
    visibleKeyboardInset({
      keyboardHeight: 300,
      insetBottom: 48,
      platform: "android",
    }),
  ).toBe(348);
});

test("ios keyboard height is already the full overlap", () => {
  expect(
    visibleKeyboardInset({
      keyboardHeight: 336,
      insetBottom: 34,
      platform: "ios",
    }),
  ).toBe(336);
});

test("closed keyboard has no overlap", () => {
  expect(
    visibleKeyboardInset({
      keyboardHeight: 0,
      insetBottom: 48,
      platform: "android",
    }),
  ).toBe(0);
});

test("docked input sits on the keyboard when it is open", () => {
  expect(
    dockedBottomPad({
      keyboardHeight: 348,
      insetBottom: 48,
      platform: "android",
      gap: 8,
    }),
  ).toBe(356);
});

test("docked input sits on the system inset when the keyboard is closed", () => {
  expect(
    dockedBottomPad({
      keyboardHeight: 0,
      insetBottom: 48,
      platform: "android",
      gap: 8,
    }),
  ).toBe(56);
});

test("web docked input keeps a fixed pad", () => {
  expect(
    dockedBottomPad({
      keyboardHeight: 0,
      insetBottom: 0,
      platform: "web",
      gap: 8,
      webPad: 12,
    }),
  ).toBe(12);
});
