export const SIDEBAR_STORAGE_KEY = "factory-sidebar:v1";
export const PHONE_MEDIA = "(max-width: 760px)";
export const COMPACT_RAIL_MEDIA = "(max-width: 1024px)";

export function sidebarModeFromStorage(value: string | null): "collapsed" | "expanded" | null {
  if (value === "collapsed" || value === "expanded") return value;
  return null;
}

export function readSidebarCollapsed(): boolean {
  try {
    const stored = sidebarModeFromStorage(localStorage.getItem(SIDEBAR_STORAGE_KEY));
    if (stored === "collapsed") return true;
    if (stored === "expanded") return false;
  } catch {
    // private browsing, disabled storage, or quota
  }
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(pointer: coarse)").matches) return false;
  return window.matchMedia(COMPACT_RAIL_MEDIA).matches && !window.matchMedia(PHONE_MEDIA).matches;
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // private browsing, disabled storage, or quota
  }
}

export function shouldToggleSidebarShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey?: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
  targetTag?: string;
  contentEditable?: boolean;
}): boolean {
  if (event.repeat || event.defaultPrevented) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  if (event.key.toLowerCase() !== "b") return false;
  if (event.contentEditable) return false;
  const tag = event.targetTag;
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}
