// Drawer Header only reserves ~52px for headerRight. Chat chrome is two 44px
// IconButtons, so a long title paints over them unless we cap maxWidth ourselves.
const ICON = 44;
const ICON_GAP = 4;
const EDGE = 16;
const LEADING = ICON + 8;
const TRAILING_ACTIONS = ICON * 2 + ICON_GAP + EDGE;

export function chatHeaderTitleMaxWidth(input: {
  readonly windowWidth: number;
  readonly insetStart: number;
  readonly insetEnd: number;
  readonly hasRightActions: boolean;
  readonly centered: boolean;
}): number {
  const trailing = input.hasRightActions ? TRAILING_ACTIONS : EDGE;
  const chrome = input.centered
    ? Math.max(LEADING, trailing) * 2
    : LEADING + trailing;
  return Math.max(96, input.windowWidth - input.insetStart - input.insetEnd - chrome);
}
