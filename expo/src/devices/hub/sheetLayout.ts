/** Fill the sheet's measured height instead of growing with the scroll child's intrinsic height. */
export const sheetBodyLayout = { flexGrow: 1, height: 0 } as const;

/** Remaining space under the sheet header; minHeight 0 lets the child actually shrink to it. */
export const sheetFillLayout = { flex: 1, minHeight: 0 } as const;
