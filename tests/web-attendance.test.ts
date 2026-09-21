import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MarkValue, PairValue, pending, sessionBlock } from '../web/screens/Attendance';
import { allowed, issueText, statusName } from '../web/screens/Months';
import { Classification, windowProblem } from '../web/screens/Monitor';
import { shift, span } from '../web/dates';
import { routes } from '../web/routes';

const classroom = { day_on: '2026-06-02', source: 'school' as const, configured: true, am: 'classroom' as const, pm: 'classroom' as const, day_type: 'regular', label: 'Regular day' };
const unconfigured = { day_on: '2026-06-01', source: 'unconfigured' as const, configured: false, am: null, pm: null, day_type: null, label: null };

/**
 * The rule the attendance module exists to hold: an unmarked session is
 * unknown. It is never zero, never "present", and never a blank cell — a blank
 * reads as a page that failed to load, and an em dash reads as a value
 * somebody typed.
 */
describe('daily attendance marks', () => {
  it('draws an unmarked session instead of blanking it', () => {
    const html = renderToString(createElement(MarkValue, { mark: null }));
    expect(html).toContain('Not marked');
    expect(html).toContain('unrecorded');
    expect(html).not.toContain('—');
  });

  it('names a recorded mark', () => {
    expect(renderToString(createElement(MarkValue, { mark: 'present' }))).toContain('Present');
    expect(renderToString(createElement(MarkValue, { mark: 'absent' }))).toContain('Absent');
    expect(renderToString(createElement(PairValue, { value: { am: 'present', pm: null } }))).toContain('Not marked');
  });

  it('only accepts a mark against a configured classroom session', () => {
    expect(sessionBlock(classroom, 'am')).toBeNull();
    expect(sessionBlock(classroom, 'pm')).toBeNull();
    expect(sessionBlock(unconfigured, 'am')).toBe('Not configured');
    expect(sessionBlock({ ...classroom, pm: 'no_class' }, 'pm')).toBe('No class');
    expect(sessionBlock({ ...classroom, pm: 'suspended' }, 'pm')).toBe('Suspended');
    expect(sessionBlock({ ...classroom, am: 'alternative_delivery' }, 'am')).toBe('Alternative delivery');
  });
});

/**
 * A change replaces a learner's AM/PM pair rather than patching one half of
 * it, so the untouched session has to travel with the one that moved. Leaving
 * it out of the payload would clear a mark nobody touched, which is the
 * quietest way this screen could destroy a record.
 */
describe('what a marked class sends', () => {
  const items = [
    { enrollment_id: 'e1', am: null, pm: null },
    { enrollment_id: 'e2', am: 'present' as const, pm: 'present' as const },
    { enrollment_id: 'e3', am: 'absent' as const, pm: null },
  ];

  it('carries the untouched session alongside the changed one', () => {
    const sent = pending(items, { e2: { am: 'present', pm: 'absent' } });
    expect(sent).toEqual([{ enrollment_id: 'e2', am: 'present', pm: 'absent' }]);
  });

  it('sends nothing for a learner nobody touched', () => {
    expect(pending(items, {})).toEqual([]);
  });

  it('drops a learner put back exactly as they were', () => {
    // An all-no-op batch is refused by the API, so a mark toggled and undone
    // must not reach it and turn an untouched class into a failed save.
    expect(pending(items, { e2: { am: 'present', pm: 'present' } })).toEqual([]);
  });

  it('clears a mark with an explicit null rather than by omission', () => {
    const sent = pending(items, { e3: { am: null, pm: null } });
    expect(sent).toEqual([{ enrollment_id: 'e3', am: null, pm: null }]);
    expect(Object.keys(sent[0]!)).toEqual(['enrollment_id', 'am', 'pm']);
  });

  it('sends every learner whose pair moved, and only those', () => {
    const sent = pending(items, { e1: { am: 'present', pm: null }, e2: { am: 'present', pm: 'present' }, e3: { am: 'absent', pm: 'present' } });
    expect(sent.map(c => c.enrollment_id)).toEqual(['e1', 'e3']);
  });
});

describe('monthly consolidation', () => {
  it('offers only the transitions the API allows from each state', () => {
    expect(allowed.draft).toEqual(['submit']);
    expect(allowed.submitted).toEqual(['return', 'lock']);
    expect(allowed.locked).toEqual(['reopen']);
    expect(statusName('locked')).toBe('Locked');
  });

  it('explains every blocking issue the API can report', () => {
    // A bare code tells a school head nothing about what to fix.
    for (const code of ['YEAR_NOT_ACTIVE', 'MONTH_NOT_ENDED', 'UNCONFIGURED_DATES', 'UNSUPPORTED_ADM', 'MISSING_MARKS']) {
      expect(issueText[code], code).toBeTruthy();
      expect(issueText[code]!.length, code).toBeGreaterThan(40);
    }
  });

  it('never calls a raw session count an official total', () => {
    const words = Object.values(issueText).join(' ').toLowerCase();
    for (const banned of ['attendance rate', 'percentage', 'school days credited']) expect(words).not.toContain(banned);
  });
});

/**
 * The monitor reports what was written down. A date nobody configured and a
 * session nobody marked are gaps in the record, not observations, so neither
 * may be drawn as an absence.
 */
describe('absence monitor', () => {
  it('draws a gap in the record as unrecorded, not as an absence', () => {
    for (const value of ['unconfigured', 'incomplete'] as const) {
      const html = renderToString(createElement(Classification, { value }));
      expect(html, value).toContain('unrecorded');
      expect(html.toLowerCase(), value).not.toContain('absent');
    }
  });

  it('names an observed date', () => {
    expect(renderToString(createElement(Classification, { value: 'absent' }))).toContain('Absent');
    expect(renderToString(createElement(Classification, { value: 'attended' }))).toContain('Attended');
    expect(renderToString(createElement(Classification, { value: 'no_classroom' }))).toContain('No class');
  });

  it('holds the window inside what the API accepts', () => {
    expect(windowProblem('2026-06-01', '2026-07-01', '2026-06-01', '2026-12-31')).toBeNull();
    expect(windowProblem('2026-06-01', '2026-07-02', '2026-06-01', '2026-12-31')).toContain('32 dates');
    expect(windowProblem('2026-06-10', '2026-06-01', '2026-06-01', '2026-12-31')).toContain('after the last one');
    expect(windowProblem('2026-06-01', '2026-06-10', '2026-06-01', '2026-06-05')).toContain('cannot end after today');
    expect(windowProblem('2026-05-25', '2026-06-10', '2026-06-01', '2026-12-31')).toContain('before the school year');
    expect(windowProblem('', '', '2026-06-01', '2026-12-31')).toBeNull();
  });

  it('accepts a single date and the full 31', () => {
    expect(windowProblem('2026-06-01', '2026-06-01', '2026-06-01', '2026-12-31')).toBeNull();
    expect(span('2026-06-01', '2026-07-01')).toBe(31);
    expect(span('2026-06-01', '2026-06-01')).toBe(1);
  });
});

describe('plain calendar date arithmetic', () => {
  it('steps across month, year and leap boundaries', () => {
    expect(shift('2026-06-30', 1)).toBe('2026-07-01');
    expect(shift('2027-01-01', -1)).toBe('2026-12-31');
    expect(shift('2028-02-28', 1)).toBe('2028-02-29');
    expect(shift('2026-02-28', 1)).toBe('2026-03-01');
    expect(shift('2026-06-15', -14)).toBe('2026-06-01');
  });

  it('counts a range inclusively, across a month boundary', () => {
    expect(span('2026-06-28', '2026-07-03')).toBe(6);
    expect(span('2026-12-31', '2027-01-01')).toBe(2);
    // A leap day is a date like any other and must be counted.
    expect(span('2028-02-28', '2028-03-01')).toBe(3);
  });
});

describe('the attendance section of the route table', () => {
  it('has a screen for each of the three modules built here', () => {
    for (const id of ['attendance', 'months', 'monitor']) {
      const route = routes.find(r => r.id === id);
      expect(route, id).toBeTruthy();
      expect(route!.built, `${id} is no longer a placeholder`).toBe(true);
      expect(route!.group, id).toBe('Attendance');
    }
  });

  it('keeps daily attendance and the monitor open to advisers', () => {
    // Recording a class is the adviser's own job, and the monitor shows them
    // only the learners they currently hold. Consolidation is a manager's.
    expect(routes.find(r => r.id === 'attendance')!.manager).toBeFalsy();
    expect(routes.find(r => r.id === 'monitor')!.manager).toBeFalsy();
    expect(routes.find(r => r.id === 'months')!.manager).toBe(true);
  });
});
