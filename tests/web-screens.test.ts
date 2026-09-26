import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { routes, groups, type Route } from '../web/routes';

/**
 * A crash on first render is the failure mode a typecheck cannot catch and a
 * staff member would meet immediately, so every route is rendered once against
 * an API that returns nothing. Effects do not run here, so this covers the
 * empty and loading states rather than the data paths behind a fetch.
 */
describe('workspace screens', () => {
  const api = (async () => ({ items: [], pagination: {} })) as never;
  const props = (manager: boolean, route: Route) => ({
    api,
    me: { user_id: 'u1', display_name: 'Synthetic staff', role: manager ? 'principal' : 'teacher' },
    manager,
    setStatus: () => {},
    reload: () => {},
    token: 0,
    route,
  });

  it('renders every route for a manager', () => {
    for (const route of routes) {
      expect(() => renderToString(route.render(props(true, route)) as never), route.id).not.toThrow();
    }
    expect(routes.length).toBeGreaterThan(10);
  });

  it('renders every teacher-visible route for a teacher', () => {
    for (const route of routes.filter(r => !r.manager)) {
      expect(() => renderToString(route.render(props(false, route)) as never), route.id).not.toThrow();
    }
  });

  it('keeps the route table coherent', () => {
    const ids = routes.map(r => r.id);
    expect(new Set(ids).size, 'route ids must be unique').toBe(ids.length);
    for (const route of routes) {
      expect(groups, `${route.id} sits in a known group`).toContain(route.group);
      expect(route.record, `${route.id} names the record it holds`).toBeTruthy();
      expect(route.lede.length, `${route.id} explains itself`).toBeGreaterThan(20);
    }
  });

  it('draws each page header exactly once', () => {
    // The shell draws a header for a route unless the route says the screen
    // draws its own. A screen that draws one without saying so gets two.
    for (const route of routes) {
      for (const manager of route.manager ? [true] : [true, false]) {
        const own = renderToString(route.render(props(manager, route)) as never).includes('class="view-head"');
        // The converse does not hold: the Overview sets ownHeader and draws a greeting instead.
        if (own) expect(route.ownHeader, `${route.id} draws its own header, so it must set ownHeader`).toBe(true);
      }
    }
  });

  it('presents no computed grade as a column or field', () => {
    // Grading arithmetic is gated on the school's enclosure, so no screen may
    // offer one as data. Prose is exempt: several screens name these terms
    // precisely to say they are absent.
    const html = routes.map(r => renderToString(r.render(props(true, r)) as never)).join(' ');
    const shown = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g), ...html.matchAll(/class="label"[^>]*>([^<]*)</g)]
      .map(m => m[1]!.toLowerCase());
    for (const banned of ['general weighted', 'mean percentage', 'transmut', 'weighted average', 'gwa', 'mps']) {
      expect(shown.filter(t => t.includes(banned)), `no column or field is labelled "${banned}"`).toEqual([]);
    }
  });

  it('opens no sheet, dialog or confirmation until one is asked for', () => {
    // A sheet that merely hid itself with CSS would put the text of a
    // destructive action into the page for anything reading the DOM, and would
    // leave its fields in the tab order. They render nothing when closed.
    const html = routes.map(r => renderToString(r.render(props(true, r)) as never)).join(' ');
    expect(html).not.toContain('class="sheet"');
    expect(html).not.toContain('class="dialog"');
    expect(html).not.toContain('aria-modal');
  });
});
