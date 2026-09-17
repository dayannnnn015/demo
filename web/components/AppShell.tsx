import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Row } from '../api';
import { groups, routes, type Route } from '../routes';
import { sentence } from './primitives';

export function AppShell({ me, current, onNavigate, onSignOut, children }: {
  me: Row;
  current: Route;
  onNavigate: (id: string) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const manager = me.role !== 'teacher';
  const visible = routes.filter(route => !route.manager || manager);
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <nav className="rail" aria-label="Sections">
        <div className="rail-top">
          <div className="wordmark">
            <strong>EDUNEXUS</strong>
            <span>Balili Elementary School</span>
          </div>
          <button type="button" className="rail-toggle" aria-expanded={open} aria-controls="rail-body" onClick={() => setOpen(v => !v)}>
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
        <div className="rail-body" id="rail-body" data-open={open}>
        {groups.map(group => {
          const items = visible.filter(route => route.group === group);
          if (!items.length) return null;
          return (
            <div className="nav-group" key={group}>
              <h2>{group}</h2>
              {items.map(route => (
                <button
                  key={route.id}
                  type="button"
                  className="nav-item"
                  aria-current={route.id === current.id ? 'page' : 'false'}
                  onClick={() => { onNavigate(route.id); setOpen(false); }}
                >
                  <span>{route.nav}</span>
                  {route.built ? null : <span className="soon">soon</span>}
                </button>
              ))}
            </div>
          );
        })}
        <div className="rail-foot">
          <p className="who"><strong>{String(me.display_name)}</strong>{sentence(String(me.role))}</p>
          <button type="button" className="btn secondary small" onClick={onSignOut}>Sign out</button>
        </div>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="school">
            Balili Elementary School
            <span>Tebteb, Balili, La Trinidad, Benguet</span>
          </div>
          <span className="badge attention">Development system</span>
        </header>
        <main className="page" id="main">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ route, scope }: { route: Route; scope?: string | undefined }) {
  return (
    <div className="page-head">
      <h1>{route.title}</h1>
      <p className="lede">{route.lede}</p>
      <div className="record-strip">
        <span><span className="key">record </span>{route.record}</span>
        {route.feeds ? <><span className="sep">·</span><span><span className="key">feeds </span>{route.feeds}</span></> : null}
        {scope ? <><span className="sep">·</span><span><span className="key">scope </span>{scope}</span></> : null}
        <span className="sep">·</span>
        <span><span className="key">access </span>{route.manager ? 'principal, administrative officer' : 'all staff, scoped'}</span>
      </div>
    </div>
  );
}
