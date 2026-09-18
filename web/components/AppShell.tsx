import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Row } from '../api';
import { groups, routes, type Route } from '../routes';
import { Icon } from './icons';
import { sentence } from './primitives';

/** Two letters is enough to tell 33 people apart, and it needs no photograph. */
const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?';

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
  const name = String(me.display_name);
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>

      <nav className="rail" aria-label="Sections">
        <div className="rail-head">
          <div className="brand">
            <span className="brand-mark"><Icon name="school" size={17} /></span>
            <span className="brand-text">
              <b>EDUNEXUS<span className="tag-dev">Dev</span></b>
              <span>Balili Elementary School</span>
            </span>
          </div>
          <button
            type="button"
            className="rail-menu"
            aria-expanded={open}
            aria-controls="rail-body"
            aria-label={open ? 'Hide sections' : 'Show sections'}
            onClick={() => setOpen(v => !v)}
          ><Icon name={open ? 'close' : 'menu'} /></button>
        </div>

        <div className="rail-body" id="rail-body" data-open={open}>
          <div className="nav-scroll">
          {groups.map(group => {
            const items = visible.filter(route => route.group === group);
            if (!items.length) return null;
            return (
              <div className="nav" key={group}>
                <h2>{group}</h2>
                {items.map(route => (
                  <button
                    key={route.id}
                    type="button"
                    className="nav-item"
                    aria-current={route.id === current.id ? 'page' : 'false'}
                    onClick={() => { onNavigate(route.id); setOpen(false); }}
                  >
                    <Icon name={route.icon} />
                    <span>{route.nav}</span>
                    {route.built ? null : <span className="soon">Soon</span>}
                  </button>
                ))}
              </div>
            );
          })}
          </div>

          <div className="rail-foot">
            <div className="who">
              <span className="avatar" aria-hidden="true">{initials(name)}</span>
              <span className="who-text">
                <b>{name}</b>
                <span>{sentence(String(me.role))}</span>
              </span>
            </div>
            <button type="button" className="btn ghost small" onClick={onSignOut}>
              <Icon name="signout" size={15} />Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="main">
        <main className="view" id="main">{children}</main>
      </div>
    </div>
  );
}

/**
 * Title, one line, and the DepEd form these records end up on. Everything else
 * a screen used to restate in its header — the table it writes to, who may open
 * it — is either developer detail or already answered by the navigation.
 */
export function PageHeader({ route, actions }: { route: Route; actions?: ReactNode }) {
  return (
    <div className="view-head">
      <div className="view-titles">
        <h1>{route.title}</h1>
        <p className="view-sub">{route.lede}</p>
        {route.feeds ? <span className="form-chip">Feeds<b>{route.feeds}</b></span> : null}
      </div>
      {actions ? <div className="view-actions">{actions}</div> : null}
    </div>
  );
}
