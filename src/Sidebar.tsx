import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router-dom";
import type { Id } from "../convex/_generated/dataModel";
import type { ProjectScope } from "./projectScope";
import {
  PHONE_MEDIA,
  readSidebarCollapsed,
  shouldToggleSidebarShortcut,
  writeSidebarCollapsed,
} from "./sidebarState";

type SidebarProject = {
  _id: Id<"projects">;
  name: string;
};

type SidebarProps = {
  projects: SidebarProject[] | undefined;
  projectId: ProjectScope;
  onProjectIdChange: (projectId: ProjectScope) => void;
};

const NAV: { section: string; items: { to: string; label: string; icon: ReactNode }[] }[] = [
  {
    section: "Work",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: <IconDashboard /> },
      { to: "/jobs", label: "Jobs", icon: <IconJobs /> },
    ],
  },
  {
    section: "Build",
    items: [
      { to: "/workflows", label: "Workflows", icon: <IconWorkflows /> },
      { to: "/agents", label: "Agents", icon: <IconAgents /> },
      { to: "/skills", label: "Skills", icon: <IconSkills /> },
    ],
  },
];

export function Sidebar({ projects, projectId, onProjectIdChange }: SidebarProps) {
  const location = useLocation();
  const menuId = useId();
  const asideRef = useRef<HTMLElement>(null);
  const switcherRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_MEDIA).matches);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const railCollapsed = collapsed && !phone;
  const currentProject = projects?.find((project) => project._id === projectId);
  const scopeLabel = currentProject?.name ?? "View all";
  const shortcut = shortcutHint();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.sidebar = railCollapsed ? "collapsed" : "expanded";
    root.dataset.drawer = phone && drawerOpen ? "open" : "closed";
  }, [drawerOpen, phone, railCollapsed]);

  useEffect(() => {
    writeSidebarCollapsed(collapsed);
  }, [collapsed]);

  useEffect(() => {
    const media = window.matchMedia(PHONE_MEDIA);
    const onChange = () => {
      setPhone(media.matches);
      if (!media.matches) setDrawerOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!phone || !drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    asideRef.current?.querySelector<HTMLElement>(".sidebar-close")?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen, phone]);

  useEffect(() => {
    if (phone && !drawerOpen) restoreFocusRef.current?.focus();
  }, [drawerOpen, phone]);

  useEffect(() => {
    if (!menuOpen) return;
    const place = () => {
      const anchor = switcherRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = railCollapsed ? 240 : Math.max(rect.width, 196);
      const left = railCollapsed ? Math.min(rect.right + 8, window.innerWidth - width - 8) : rect.left;
      const top = Math.min(rect.bottom + 6, window.innerHeight - 24);
      setMenuPos({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen, railCollapsed]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (switcherRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (shouldToggleSidebarShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        repeat: event.repeat,
        defaultPrevented: event.defaultPrevented,
        targetTag: event.target instanceof HTMLElement ? event.target.tagName : undefined,
        contentEditable: event.target instanceof HTMLElement && event.target.isContentEditable,
      })) {
        event.preventDefault();
        if (phone) setDrawerOpen((open) => !open);
        else setCollapsed((value) => !value);
        return;
      }
      if (event.key !== "Escape") return;
      if (menuOpen) {
        setMenuOpen(false);
        switcherRef.current?.focus();
        return;
      }
      if (phone && drawerOpen) setDrawerOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen, menuOpen, phone]);

  useEffect(() => {
    if (!phone || !drawerOpen) return;
    const root = asideRef.current;
    if (!root) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [...root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [drawerOpen, phone]);

  function chooseProject(id: ProjectScope) {
    onProjectIdChange(id);
    setMenuOpen(false);
  }

  return (
    <>
      <header className="mobile-bar">
        <button
          type="button"
          className="chrome-btn"
          aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={drawerOpen}
          aria-controls="app-sidebar"
          onClick={() => setDrawerOpen((open) => !open)}
        >
          {drawerOpen ? <IconClose /> : <IconMenu />}
        </button>
        <NavLink to="/dashboard" className="mobile-bar-brand">
          <img className="mobile-bar-mark" src="/favicon.svg" alt="" />
          <span className="mobile-bar-copy">
            <strong>VASA</strong>
            <span>{scopeLabel}</span>
          </span>
        </NavLink>
      </header>
      <div className="sidebar-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      <aside
        ref={asideRef}
        id="app-sidebar"
        className="sidebar"
        aria-label="Factory"
        inert={phone && !drawerOpen}
      >
        <div className="sidebar-head">
          <NavLink to="/dashboard" className="brand" data-tip="VASA" title={railCollapsed ? "VASA" : undefined}>
            <img className="brand-mark" src="/vasa.svg" alt="VASA" />
            <img className="brand-compact" src="/favicon.svg" alt="VASA" />
            <span className="brand-tagline">Agentic Software Factory</span>
          </NavLink>
          {phone ? (
            <button type="button" className="chrome-btn sidebar-close" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}>
              <IconClose />
            </button>
          ) : null}
        </div>
        <div className="project-switcher">
          <span className="rail-label">Working on</span>
          <button
            ref={switcherRef}
            type="button"
            className="project-switcher-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={`Project scope, ${scopeLabel}`}
            data-tip={scopeLabel}
            title={railCollapsed ? scopeLabel : undefined}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <ProjectGlyph name={currentProject?.name ?? ""} />
            <span className="rail-label project-switcher-name">{scopeLabel}</span>
            <IconChevron className="project-switcher-caret rail-label" />
          </button>
        </div>
        <nav>
          {NAV.map((group) => (
            <div className="nav-group" key={group.section}>
              <div className="nav-label">{group.section}</div>
              {group.items.map((item) => (
                <NavLink to={item.to} key={item.to} data-tip={item.label} title={railCollapsed ? item.label : undefined}>
                  {item.icon}
                  <span className="rail-label">{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings" className="settings-link" data-tip="Settings" title={railCollapsed ? "Settings" : undefined}>
            <IconSettings />
            <span className="rail-label">Settings</span>
          </NavLink>
          {phone ? null : (
            <button
              type="button"
              className="chrome-btn rail-toggle"
              aria-pressed={collapsed}
              aria-keyshortcuts="Control+B Meta+B"
              data-tip={collapsed ? `Expand sidebar (${shortcut})` : `Collapse sidebar (${shortcut})`}
              title={railCollapsed ? `Expand sidebar (${shortcut})` : undefined}
              onClick={() => setCollapsed((value) => !value)}
            >
              <IconRail collapsed={collapsed} />
              <span className="rail-label">{collapsed ? "Expand" : "Collapse"}</span>
              <kbd className="rail-label">{shortcut}</kbd>
            </button>
          )}
        </div>
      </aside>
      {menuOpen && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="project-menu"
              role="menu"
              aria-label="Project scope"
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            >
              <button type="button" role="menuitemradio" aria-checked={projectId === ""} onClick={() => chooseProject("")}>
                <span>View all</span>
                {projectId === "" ? <IconCheck /> : null}
              </button>
              {projects?.map((project) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={projectId === project._id}
                  key={project._id}
                  onClick={() => chooseProject(project._id)}
                >
                  <span>{project.name}</span>
                  {projectId === project._id ? <IconCheck /> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ProjectGlyph({ name }: { name: string }) {
  if (name === "") return <IconLayers />;
  return (
    <span className="project-glyph" aria-hidden="true">
      {name[0]!.toUpperCase()}
    </span>
  );
}

function shortcutHint(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘B" : "Ctrl+B";
}

function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconJobs() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="4" width="11" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 4V3a3 3 0 0 1 6 0v1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconWorkflows() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="8" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="12" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.7 4.6 10.3 7.4M5.7 11.4 10.3 8.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconAgents() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.4" r="2.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.6 13.2c.5-2.4 2.2-3.7 4.4-3.7s3.9 1.3 4.4 3.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconSkills() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.5 9.2 6h3.6L10 8.3l1 3.5L8 9.8 4.9 11.8l1-3.5L3.2 6h3.6L8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2.1v1.4m0 9v1.4m5.9-6H12.5m-9 0H2.1m10.07-4.17-1 1m-6.14 6.14-1 1m8.14 0-1-1M4.93 4.83l-1-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4 4 8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconChevron({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4.5 6 3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3.5 8.2 3 3.3 6-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m8 2.5 5.5 3L8 8.5 2.5 5.5 8 2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m3.2 8.2 4.8 2.6 4.8-2.6M3.2 11.1 8 13.7l4.8-2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconRail({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 2.5v11" stroke="currentColor" strokeWidth="1.4" />
      {collapsed
        ? <path d="m8.2 6 2.3 2-2.3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="m10.8 6-2.3 2 2.3 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
