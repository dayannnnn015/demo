import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Row } from '../api';
import { groups, routes, type Route } from '../routes';
import { Icon } from './icons';
import { sentence } from './primitives';

/** Two letters is enough to tell 33 people apart, and it needs no photograph. */
const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?';

/**
 * Interface preferences live in sessionStorage, alongside the session itself.
 * A staffroom machine is shared, so a collapsed rail should not outlive the tab
 * any more than the sign-in does. Every access is guarded: a private window
 * throws here rather than returning null.
 */
function remembered<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(`edunexus-ui-${key}`);
    return raw === null ? fallback : JSON.parse(raw) as T;
  } catch { return fallback; }
}
const remember = (key: string, value: unknown) => {
  try { sessionStorage.setItem(`edunexus-ui-${key}`, JSON.stringify(value)); } catch { /* not worth failing a render over */ }
};

/** Dismiss on outside click or Escape, handing focus back to the trigger. */
function useDismiss(open: boolean, close: () => void) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!wrap.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      wrap.current?.querySelector('button')?.focus();
    };
    addEventListener('mousedown', away);
    addEventListener('keydown', key);
    return () => { removeEventListener('mousedown', away); removeEventListener('keydown', key); };
  }, [open, close]);
  return wrap;
}

function ProfileMenu({ me, onSignOut }: { me: Row; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useDismiss(open, () => setOpen(false));
  const name = String(me.display_name);
  return (
    <div className="profile" ref={wrap}>
      <button type="button" className="profile-trigger" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(v => !v)}>
        <span className="avatar" aria-hidden="true">{initials(name)}</span>
        <span className="profile-text">
          <b>{name}</b>
          <span>{sentence(String(me.role))}</span>
        </span>
        <Icon name="chevron" size={15} />
      </button>
      {open ? (
        <div className="menu" role="menu">
          <div className="menu-head">
            <b>{name}</b>
            <span>{sentence(String(me.role))}</span>
          </div>
          <button type="button" className="menu-item" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }}>
            <Icon name="signout" size={16} />Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NavGroup({ group, items, current, collapsed, open, onToggle, onNavigate }: {
  group: string;
  items: Route[];
  current: Route;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate: (id: string) => void;
}) {
  const holdsCurrent = items.some(route => route.id === current.id);
  return (
    <div className="nav" data-open={open}>
      {collapsed ? <hr className="nav-rule" /> : (
        <button type="button" className="nav-group" aria-expanded={open} onClick={onToggle}>
          <Icon name="caret" size={13} />
          <span>{group}</span>
          {/* Collapsing the group that holds the current page is allowed; a dot
              says where you are, so the rail never loses your position. */}
          {!open && holdsCurrent ? <Icon name="dot" size={8} /> : null}
        </button>
      )}
      {open || collapsed ? (
        <div className="nav-items">
          {items.map(route => (
            <button
              key={route.id}
              type="button"
              className="nav-item"
              aria-current={route.id === current.id ? 'page' : 'false'}
              title={collapsed ? route.nav : undefined}
              aria-label={collapsed ? route.nav : undefined}
              onClick={() => onNavigate(route.id)}
            >
              <Icon name={route.icon} />
              <span className="nav-label">{route.nav}</span>
              {route.built ? null : <span className="soon">Soon</span>}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ me, school, current, context, onNavigate, onSignOut, children }: {
  me: Row;
  /** The school profile record. The rail states what it reads, never a literal:
   *  this is the same name printed on every official form, and it is editable. */
  school?: Row | null | undefined;
  current: Route;
  /** The active school year, or whatever else names the records on screen. */
  context?: string | undefined;
  onNavigate: (id: string) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(() => remembered('rail-collapsed', false));
  const [shut, setShut] = useState(() => remembered<string[]>('nav-shut', []));
  const manager = me.role !== 'teacher';
  const visible = routes.filter(route => !route.manager || manager);

  const setRail = (next: boolean) => { setCollapsed(next); remember('rail-collapsed', next); };
  const toggleGroup = (group: string) => setShut(open => {
    const next = open.includes(group) ? open.filter(g => g !== group) : [...open, group];
    remember('nav-shut', next);
    return next;
  });

  return (
    <div className="app" data-rail={collapsed ? 'collapsed' : 'full'} data-drawer={drawer}>
      <a className="skip" href="#main">Skip to content</a>

      {/* Tapping the dimmed page closes the mobile drawer. Everything it covers
          is reachable again once it is closed, so it is not itself a control. */}
      <div className="scrim" onClick={() => setDrawer(false)} aria-hidden="true" />

      <nav className="rail" aria-label="Sections">
        <div className="rail-head">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true"><Icon name="school" size={18} /></span>
            <span className="brand-text">
              <b>EDUNEXUS<span className="tag-dev">Dev</span></b>
              <span>Learner records system</span>
            </span>
          </span>
          <button type="button" className="rail-close" aria-label="Hide sections" onClick={() => setDrawer(false)}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="rail-school">
          <span className="rail-school-mark" aria-hidden="true"><Icon name="staff" size={16} /></span>
          <span className="rail-school-text">
            <b>{school ? String(school.name) : 'School profile'}</b>
            <span>{school?.school_code ? `School ID ${String(school.school_code)}` : 'Not set'}</span>
          </span>
        </div>

        <div className="nav-scroll">
          {groups.map(group => {
            const items = visible.filter(route => route.group === group);
            if (!items.length) return null;
            return (
              <NavGroup
                key={group}
                group={group}
                items={items}
                current={current}
                collapsed={collapsed}
                open={!shut.includes(group)}
                onToggle={() => toggleGroup(group)}
                onNavigate={id => { onNavigate(id); setDrawer(false); }}
              />
            );
          })}
        </div>

        <div className="rail-foot">
          <button
            type="button"
            className="rail-collapse"
            onClick={() => setRail(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : undefined}
          >
            <Icon name={collapsed ? 'expand' : 'collapse'} size={17} />
            <span className="nav-label">Collapse sidebar</span>
          </button>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <button type="button" className="rail-open" aria-label="Show sections" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <Icon name="menu" size={20} />
          </button>
          <div className="topbar-title">
            {context ? <span className="topbar-context">{context}</span> : null}
            <h1>{current.title}</h1>
          </div>
          <div className="topbar-right">
            <ProfileMenu me={me} onSignOut={onSignOut} />
          </div>
        </header>
        <main className="view" id="main">{children}</main>
      </div>
    </div>
  );
}

/**
 * The line under the title, and the DepEd form these records end up on. The
 * title itself now sits in the top bar, so this carries only what the top bar
 * cannot: the one clause explaining the screen, and any screen-level action.
 */
export function PageHeader({ route, actions }: { route: Route; actions?: ReactNode }) {
  return (
    <div className="view-head">
      <div className="view-titles">
        <p className="view-sub">{route.lede}</p>
        {route.feeds ? <span className="form-chip">Feeds<b>{route.feeds}</b></span> : null}
      </div>
      {actions ? <div className="view-actions">{actions}</div> : null}
    </div>
  );
}
