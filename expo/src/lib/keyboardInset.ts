// RN Android reports IME minus system bars (ReactRootView.checkForKeyboardEvents).
export function visibleKeyboardInset(input: {
  readonly keyboardHeight: number;
  readonly insetBottom: number;
  readonly platform: string;
}): number {
  if (input.keyboardHeight <= 0) return 0;
  if (input.platform === "android") {
    return input.keyboardHeight + input.insetBottom;
  }
  return input.keyboardHeight;
}

export function dockedBottomPad(input: {
  readonly keyboardHeight: number;
  readonly insetBottom: number;
  readonly platform: string;
  readonly gap: number;
  readonly webPad?: number;
}): number {
  if (input.platform === "web") return input.webPad ?? 0;
  return (
    (input.keyboardHeight > 0 ? input.keyboardHeight : input.insetBottom) +
    input.gap
  );
}
