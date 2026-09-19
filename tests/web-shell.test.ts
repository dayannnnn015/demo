import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AppShell } from '../web/components/AppShell';
import { Donut, Timeline } from '../web/components/figures';
import { CommandPalette } from '../web/components/palette';
import { Unrecorded } from '../web/components/primitives';
import { routes, groups, type Route } from '../web/routes';

/**
 * The shell, and the two content-policy traps that have caught this project
 * before. The workspace policy is `default-src 'none'`, so an inline `style`
 * attribute and an image of any kind are both dropped silently in production
 * while working perfectly under the Vite dev server. A rendered-HTML assertion
 * is the only cheap way to catch either one.
 */
describe('workspace shell', () => {
  const me = (role: string) => ({ user_id: 'u1', display_name: 'Synthetic Staff', role });
  /** Nav labels reach the markup HTML-escaped, so `Subjects & offerings` is not a literal. */
  const label = (text: string) => `>${text.replaceAll('&', '&amp;')}<`;
  const shell = (role: string) => renderToString(createElement(AppShell, {
    me: me(role),
    school: { name: 'Synthetic Elementary School', school_code: '135617' },
    current: routes[0]!,
    context: '2026–2027 school year',
    contextTone: 'active' as const,
    onNavigate: () => {},
    onSignOut: () => {},
    children: createElement('p', null, 'body'),
  }));

  it('renders the rail, top bar and every group a manager may open', () => {
    const html = shell('principal');
    for (const group of groups) expect(html, `${group} appears in the rail`).toContain(label(group));
    for (const route of routes) expect(html, `${route.nav} appears in the rail`).toContain(label(route.nav));
    expect(html).toContain('2026–2027 school year');
    expect(html).toContain('Collapse sidebar');
    expect(html, 'the rail names the school from its record, not a literal').toContain('Synthetic Elementary School');
    expect(html, 'sign-out lives in the profile menu, which is closed until opened').not.toContain('Sign out');
  });

  it('offers the keyboard route to every screen without opening it', () => {
    const html = shell('principal');
    expect(html, 'the top bar states how to reach the palette').toContain('Go to a screen');
    expect(html, 'the palette itself is not mounted until it is asked for').not.toContain('cmdk-box');
  });

  it('hides manager-only navigation from a teacher', () => {
    const html = shell('teacher');
    for (const route of routes.filter(r => r.manager)) {
      expect(html, `${route.nav} is hidden from a teacher`).not.toContain(label(route.nav));
    }
    for (const route of routes.filter(r => !r.manager)) {
      expect(html, `${route.nav} is offered to a teacher`).toContain(label(route.nav));
    }
  });

  it('marks exactly one navigation item as the current page', () => {
    const html = shell('principal');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  // Both of these fail silently in the deployed app and work in dev, so they
  // are asserted against the rendered markup rather than trusted to review.
  it('emits no inline style attribute and no image anywhere', () => {
    const api = (async () => ({ items: [], pagination: {} })) as never;
    const props = (manager: boolean, route: Route) => ({
      api, me: me(manager ? 'principal' : 'teacher'), manager,
      setStatus: () => {}, reload: () => {}, token: 0, route,
    });
    const html = [
      shell('principal'),
      shell('teacher'),
      ...routes.map(route => renderToString(route.render(props(true, route)) as never)),
      renderToString(createElement(CommandPalette, {
        routes, current: 'overview', onNavigate: () => {}, onClose: () => {},
      })),
      renderToString(createElement(Donut, {
        slices: [{ label: 'Grade 1', count: 2 }, { label: 'Grade 2', count: 1 }],
        centreValue: 3, centreLabel: 'sections',
      })),
      renderToString(createElement(Timeline, {
        from: '2026-06-15', to: '2027-03-31', today: '2026-09-19',
        spans: [{ label: 'First quarter', from: '2026-06-15', to: '2026-08-21' }],
      })),
    ].join(' ');

    expect(html.match(/style="[^"]*"/g) ?? [], 'style-src drops inline style attributes').toEqual([]);
    expect(html.match(/data:[a-z/]+;/g) ?? [], 'there is no img-src, so no data URL renders').toEqual([]);
    expect(html).not.toContain('<img');
  });
});

describe('command palette', () => {
  /** `Subjects & offerings` reaches the markup escaped, so it is not a literal. */
  const label = (text: string) => `>${text.replaceAll('&', '&amp;')}<`;
  const palette = (list = routes) => renderToString(createElement(CommandPalette, {
    routes: list, current: 'overview', onNavigate: () => {}, onClose: () => {},
  }));

  it('lists every screen it is given, grouped as the rail groups them', () => {
    const html = palette();
    for (const route of routes) expect(html, `${route.nav} is reachable`).toContain(label(route.nav));
    for (const group of groups) expect(html).toContain(label(group));
  });

  it('offers a teacher only the screens a teacher may open', () => {
    const html = palette(routes.filter(r => !r.manager));
    for (const route of routes.filter(r => r.manager)) {
      expect(html, `${route.nav} is not offered`).not.toContain(label(route.nav));
    }
  });

  it('says what it searches, because it deliberately does not search learners', () => {
    // A palette that searched the registry would write a record_access_events
    // row per keystroke and bury the privacy audit it exists to serve.
    expect(palette()).toContain('Searches screens, never learner records');
  });
});

describe('the unrecorded mark', () => {
  it('says a record is missing in words, not with a dash', () => {
    const html = renderToString(createElement(Unrecorded, { label: 'LRN not issued' }));
    expect(html, 'the reason is readable, including by a screen reader').toContain('LRN not issued');
    expect(html, 'an em dash reads as a value someone typed').not.toContain('—');
    expect(html, 'the hatch is a CSS class, never an inline style or an image').toContain('class="unrecorded"');
  });
});

describe('workspace figures', () => {
  it('divides the whole ring between the slices it is given', () => {
    const html = renderToString(createElement(Donut, {
      slices: [{ label: 'a', count: 3 }, { label: 'b', count: 1 }],
      centreValue: 4, centreLabel: 'sections',
    }));
    const drawn = [...html.matchAll(/stroke-dasharray="([\d.]+) [\d.]+"/g)].map(m => Number(m[1]));
    expect(drawn).toHaveLength(2);
    const circumference = 2 * Math.PI * 46;
    expect(drawn.reduce((a, b) => a + b, 0)).toBeCloseTo(circumference, 1);
    expect(drawn[0]! / circumference).toBeCloseTo(0.75, 3);
  });

  it('omits a slice with nothing in it rather than drawing an empty wedge', () => {
    const html = renderToString(createElement(Donut, {
      slices: [{ label: 'a', count: 1 }, { label: 'b', count: 0 }],
      centreValue: 1, centreLabel: 'sections',
    }));
    expect([...html.matchAll(/stroke-dasharray=/g)]).toHaveLength(1);
    expect(html, 'the empty grade still appears in the legend').toContain('>b<');
  });

  it('places a period across the share of the year it actually covers', () => {
    // The first half of a year drawn on a 1000-unit track starts at 0 and runs
    // to roughly 500, whatever the calendar month lengths are.
    const html = renderToString(createElement(Timeline, {
      from: '2026-01-01', to: '2026-12-31', today: '2026-07-01',
      spans: [{ label: 'First half', from: '2026-01-01', to: '2026-07-02' }],
    }));
    const span = /class="timeline-span slice-1" x="0.00" y="14" width="([\d.]+)"/.exec(html);
    expect(span, 'the span is drawn').not.toBeNull();
    expect(Number(span![1])).toBeGreaterThan(490);
    expect(Number(span![1])).toBeLessThan(510);
    expect(html, 'today is inside the year, so it is marked').toContain('timeline-now');
  });

  it('marks no day when today falls outside the school year', () => {
    const html = renderToString(createElement(Timeline, {
      from: '2026-06-15', to: '2027-03-31', today: '2025-01-01',
      spans: [{ label: 'First quarter', from: '2026-06-15', to: '2026-08-21' }],
    }));
    expect(html).not.toContain('timeline-now');
    expect(html).toContain('Today falls outside this year');
  });
});
