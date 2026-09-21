import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Pair, Session } from '../web/screens/Calendar';
import { clamp, firstOf, lastDay, lastOf, monthName, monthOf, step, weekday } from '../web/dates';
import { routes } from '../web/routes';

/**
 * The calendar screen's two load-bearing rules.
 *
 * A date nobody has configured must be *drawn* as unknown rather than left
 * blank: this module exists precisely so an unconfigured date is not read as a
 * holiday, a school day or an absence, and a blank cell reads as a page that
 * failed to load. And its dates are plain calendar dates, so no helper here
 * may route one through a local-time conversion — at 8am in Benguet that is
 * still the previous UTC day, and a weekday column would be wrong for everyone
 * looking at it.
 */
describe('instructional calendar', () => {
  const unconfigured = { day_on: '2026-06-01', source: 'unconfigured' as const, configured: false, am: null, pm: null, day_type: null, label: null };
  const configured = { day_on: '2026-06-02', source: 'school' as const, configured: true, am: 'classroom' as const, pm: 'no_class' as const, day_type: 'regular', label: 'Morning classes' };

  it('draws an unconfigured session instead of blanking it', () => {
    const html = renderToString(createElement(Session, { day: unconfigured, part: 'am' }));
    expect(html).toContain('Not configured');
    expect(html).toContain('unrecorded');
    expect(html).not.toContain('—');
  });

  it('names both sessions of a configured date', () => {
    expect(renderToString(createElement(Session, { day: configured, part: 'am' }))).toContain('Classroom');
    expect(renderToString(createElement(Session, { day: configured, part: 'pm' }))).toContain('No class');
    expect(renderToString(createElement(Pair, { day: configured }))).toContain('Classroom');
    expect(renderToString(createElement(Pair, { day: unconfigured }))).toContain('Not configured');
  });

  it('reads a weekday without a local-time conversion', () => {
    // 1 June 2026 is a Monday in Manila and everywhere else; a date parsed as
    // local midnight and read back in another zone would answer Sunday.
    expect(weekday('2026-06-01')).toBe('Monday');
    expect(weekday('2026-06-06')).toBe('Saturday');
    expect(weekday('2027-03-31')).toBe('Wednesday');
  });

  it('counts the days of a month, including February in a leap year', () => {
    expect(lastDay(2026, 2)).toBe(28);
    expect(lastDay(2028, 2)).toBe(29);
    expect(lastDay(2026, 6)).toBe(30);
    expect(lastOf({ y: 2026, m: 7 })).toBe('2026-07-31');
    expect(firstOf({ y: 2026, m: 7 })).toBe('2026-07-01');
  });

  it('steps across a year boundary in both directions', () => {
    expect(step({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 });
    expect(step({ y: 2027, m: 1 }, -1)).toEqual({ y: 2026, m: 12 });
    expect(monthName({ y: 2026, m: 9 })).toBe('September 2026');
    expect(monthOf('2026-09-21')).toEqual({ y: 2026, m: 9 });
  });

  it('holds a date inside the school year', () => {
    expect(clamp('2026-05-01', '2026-06-01', '2027-03-31')).toBe('2026-06-01');
    expect(clamp('2027-08-01', '2026-06-01', '2027-03-31')).toBe('2027-03-31');
    expect(clamp('2026-09-21', '2026-06-01', '2027-03-31')).toBe('2026-09-21');
  });

  it('is reachable, and only by a manager', () => {
    const route = routes.find(r => r.id === 'calendar')!;
    expect(route.built, 'the calendar screen is built').toBe(true);
    expect(route.manager, 'configuring a calendar is a manager action').toBe(true);
    expect(route.feeds).toBe('SF2');
  });
});
