// Drawer Header only reserves ~52px for headerRight. Chat chrome is 44px
// IconButtons, so a long title paints over them unless we cap maxWidth ourselves.
const ICON = 44;
const ICON_GAP = 4;
const EDGE = 16;
const LEADING = ICON + 8;

export function chatHeaderTitleMaxWidth(input: {
  readonly windowWidth: number;
  readonly insetStart: number;
  readonly insetEnd: number;
  readonly trailingActionCount: number;
  readonly centered: boolean;
}): number {
  const trailing =
    input.trailingActionCount > 0
      ? ICON * input.trailingActionCount +
        ICON_GAP * Math.max(0, input.trailingActionCount - 1) +
        EDGE
      : EDGE;
  const chrome = input.centered
    ? Math.max(LEADING, trailing) * 2
    : LEADING + trailing;
  return Math.max(96, input.windowWidth - input.insetStart - input.insetEnd - chrome);
}
