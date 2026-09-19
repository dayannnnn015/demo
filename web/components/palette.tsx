import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '../routes';
import { Icon } from './icons';
import { useTrap } from './overlay';

/**
 * The keyboard route to every screen.
 *
 * Seventeen screens behind six collapsible groups is a lot of pointing for
 * someone who opens the same three every morning, and the people using this
 * are advisers taking attendance twice a day on a shared staffroom machine.
 *
 * It searches the route table and nothing else. That is a privacy property,
 * not a limitation: every list under `/learners` and `/enrollments` writes a
 * `record_access_events` row naming the exact records it returned, so a
 * palette that searched learners would write a row for every keystroke and
 * bury the audit it exists to serve. Finding a learner is the registry's job,
 * behind a deliberate search.
 */

/** Match on everything a person might type: the label, the title, the group,
 *  and the one clause explaining the screen. */
const haystack = (route: Route) => `${route.nav} ${route.title} ${route.group} ${route.lede}`.toLowerCase();

export function CommandPalette({ routes, current, onNavigate, onClose }: {
  routes: Route[];
  current: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const box = useTrap(onClose);
  const list = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);

  const found = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (!needle) return routes;
    return routes
      .map(route => ({ route, at: haystack(route).indexOf(needle) }))
      .filter(hit => hit.at >= 0)
      // An earlier match is a better one: typing "att" should offer Daily
      // attendance before the screens that merely mention attendance.
      .sort((a, b) => a.at - b.at)
      .map(hit => hit.route);
  }, [routes, text]);

  useEffect(() => { setActive(0); }, [text]);
  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, found]);

  const choose = (id: string) => { onClose(); onNavigate(id); };

  // Groups are kept in the rail's order so the palette and the rail agree, and
  // only the groups holding a result are drawn.
  const ordered: { group: string; items: Route[] }[] = [];
  for (const route of found) {
    const last = ordered.find(entry => entry.group === route.group);
    if (last) last.items.push(route); else ordered.push({ group: route.group, items: [route] });
  }
  let index = -1;

  return (
    <div className="cmdk" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="cmdk-box" role="dialog" aria-modal="true" aria-label="Go to a screen" tabIndex={-1} ref={box}>
        <div className="cmdk-search">
          <Icon name="search" size={17} />
          <input
            className="cmdk-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-autocomplete="list"
            placeholder="Go to a screen…"
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive(n => Math.min(n + 1, found.length - 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActive(n => Math.max(n - 1, 0)); }
              if (event.key === 'Enter') {
                event.preventDefault();
                const picked = found[active];
                if (picked) choose(picked.id);
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div className="cmdk-list" id="cmdk-list" role="listbox" aria-label="Screens" ref={list}>
          {found.length ? ordered.map(entry => (
            <div key={entry.group}>
              <div className="cmdk-group">{entry.group}</div>
              {entry.items.map(route => {
                index += 1;
                const here = index;
                return (
                  <button
                    key={route.id}
                    type="button"
                    role="option"
                    aria-selected={here === active}
                    data-active={here === active}
                    className="cmdk-item"
                    onMouseMove={() => setActive(here)}
                    onClick={() => choose(route.id)}
                  >
                    <Icon name={route.icon} size={16} />
                    <span><b>{route.nav}</b> · {route.lede}</span>
                    {route.id === current ? <span className="soon">Here</span> : route.built ? null : <span className="soon">Soon</span>}
                  </button>
                );
              })}
            </div>
          )) : (
            <p className="cmdk-empty">Nothing matches “{text.trim()}”. Screens are searched by name, section and description.</p>
          )}
        </div>

        <div className="cmdk-foot">
          <span><Icon name="updown" size={13} />Move</span>
          <span><Icon name="enter" size={13} />Open</span>
          <span>Searches screens, never learner records</span>
        </div>
      </div>
    </div>
  );
}
