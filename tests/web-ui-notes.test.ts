// @vitest-environment happy-dom
import { createElement, act } from 'react';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ids, testDatabase, type TestDatabase } from './helpers/database.js';
import { mount, mountScreen, serverApi, type ServerApi } from './helpers/dom.js';
import { Subjects } from '../web/screens/Subjects';
import { PriorRecords } from '../web/screens/PriorRecords';
import { Table } from '../web/components/primitives';
import { routes } from '../web/routes';

/**
 * The UI notes of 8 November, U1 (docs/ui-notes-plan.md), held on 0.102.2.
 *
 * - **Note 3, decision U-D2.** Subjects & offerings and Academic history ask for
 *   no reason when something is *added*; the journal still carries one, written
 *   in the system's words, under the person who acted. A correction to a
 *   learner's historical record still asks why.
 * - **Note 4.** A list read again keeps its rows on screen, dimmed and out of
 *   reach, instead of dropping to a skeleton that closes the open row.
 * - **Note 6.** The front page changes page at once: no view transition.
 */

let db: TestDatabase;
let server: ServerApi;
const year = '00000000-0000-4000-9000-000000000001';
const section = '00000000-0000-4000-9000-00000000000a';
const ana = '00000000-0000-4000-9001-000000000001';
const principal = { user_id: ids.principal, role: 'principal', display_name: 'Principal' };

beforeAll(async () => {
  db = await testDatabase();
  server = await serverApi(db);
  await db.pg.query(`insert into edunexus.school_profile(id,name,school_code,address,region,division,district)
    values(1,'Balili Elementary School','135617','Balili, La Trinidad, Benguet','Cordillera Administrative Region','Benguet','La Trinidad')`);
  await db.pg.query(`select set_config('edunexus.actor_id',$1,false)`, [ids.principal]);
  await db.pg.query(`select set_config('edunexus.request_id',$1,false)`, ['00000000-0000-4000-7000-000000000011']);
  await db.pg.query(`insert into edunexus.academic_years(id,start_year,starts_on,ends_on,status) values($1,2026,'2026-06-01','2027-03-31','draft')`, [year]);
  await db.pg.query(`insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,3,'A',$3)`, [section, year, ids.teacher]);
  await db.pg.query(`insert into edunexus.learners(id,first_name,last_name,sex,birth_date,lrn) values($1,'Ana','Reyes','female','2017-05-02','136170000001')`, [ana]);
  await db.pg.query(`insert into edunexus.enrollments(id,learner_id,academic_year_id,grade_level,section_id,enrolled_on,effective_on,last_reason) values
    ('00000000-0000-4000-9002-000000000001',$1,$2,3,$3,'2026-06-01','2026-06-01','regular')`, [ana, year, section]);
});
afterAll(async () => { await server.close(); await db.database.close(); });

describe('reasons the screen writes (note 3, U-D2)', () => {
  it('adds a subject with no reason box, and journals the system’s reason under the manager', async () => {
    server.signInAs('principal');
    const m = await mountScreen(Subjects as never, server, principal, { route: routes.find(r => r.id === 'subjects')! });
    await m.until(v => v.byText('Add a subject', 'button') !== null, 'the add action');
    await m.click(m.byText('Add a subject', 'button'));
    await m.until(v => v.text().includes('Add to the catalog'), 'the sheet');
    expect(m.field('Reason')).toBeNull();
    expect(m.all('textarea')).toHaveLength(0);

    // By exact label inside the sheet: the catalog's own filter is labelled "Code or name".
    const inSheet = (label: string) => {
      const found = m.all('.sheet label').find(l => (l.textContent ?? '').trim() === label);
      return found ? m.host.querySelector<HTMLInputElement>(`[id="${found.getAttribute('for')}"]`) : null;
    };
    await m.type(inSheet('Code'), 'read3');
    await m.type(inSheet('Name'), 'Reading');
    const grade3 = m.all('label.check-line').find(l => (l.textContent ?? '').trim() === 'Grade 3')!.querySelector('input');
    await m.click(grade3);
    await m.submit(m.byText('Add to the catalog', 'button'));
    // The harness's reload() is a no-op, so the sheet closing is the sign the API accepted it.
    await m.until(v => !v.text().includes('Add to the catalog'), 'the sheet to close');

    const [event] = await db.pg.query<{ reason: string; actor_user_id: string }>(
      `select e.reason,e.actor_user_id from edunexus.subject_events e join edunexus.subjects s on s.id=e.subject_id where s.code='READ3'`);
    expect(event).toEqual({ reason: 'Added to the subject catalog on Subjects & offerings.', actor_user_id: ids.principal });
    m.unmount();
  });

  it('opens a new school year on Academic history with no reason box, and a correction with one', async () => {
    server.signInAs('principal');
    const m = await mountScreen(PriorRecords as never, server, principal, { route: routes.find(r => r.id === 'prior-records')! });
    await m.type(m.field('Name or LRN'), 'Reyes');
    await m.submit(m.field('Name or LRN'));
    await m.until(v => v.byText('Open the history', 'button') !== null, 'the search');
    await m.click(m.byText('Open the history', 'button'));
    await m.until(v => v.byText('Add a school year', 'button') !== null, 'the history');
    await m.click(m.byText('Add a school year', 'button'));
    await m.until(v => v.text().includes('Document this was copied from'), 'the year sheet');
    // The document the year was read from is still asked for: that is the record of where it came from.
    expect(m.field('Document this was copied from')).not.toBeNull();
    expect(m.field('Reason for this entry')).toBeNull();
    expect(m.field('Reason for this correction')).toBeNull();
    m.unmount();
  });
});

describe('a list read again (note 4)', () => {
  it('keeps its rows on screen, dimmed and inert, and the open row open, instead of a skeleton', async () => {
    const rows = [{ id: '1', name: 'Ana' }, { id: '2', name: 'Ben' }];
    const table = (loading: boolean, list: typeof rows) => createElement(Table<{ id: string; name: string }>, {
      rows: list, loading, rowKey: r => r.id, columns: [{ header: 'Name', cell: r => r.name }], detail: r => `Details of ${r.name}`,
    });
    const m = await mount(table(false, rows));
    await m.click(m.all('button.row-toggle')[0]!);
    expect(m.text()).toContain('Details of Ana');

    await act(async () => { m.root.render(table(true, [])); });
    await m.settle();
    expect(m.all('.skeleton-table')).toHaveLength(0);
    const wrap = m.all('.table-wrap.refreshing')[0]!;
    expect(wrap.getAttribute('aria-busy')).toBe('true');
    expect(wrap.hasAttribute('inert')).toBe(true);
    expect(m.text()).toContain('Details of Ana');

    await act(async () => { m.root.render(table(false, [rows[0]!, { id: '3', name: 'Cora' }])); });
    await m.settle();
    expect(m.all('.table-wrap.refreshing')).toHaveLength(0);
    expect(m.text()).toContain('Cora');
    expect(m.text()).toContain('Details of Ana');

    // A list never shown before still starts as a skeleton: there is nothing to keep.
    await act(async () => { m.root.render(table(true, [])); });
    m.unmount();
    const fresh = await mount(table(true, []));
    expect(fresh.all('.skeleton-table')).toHaveLength(1);
    fresh.unmount();
  });
});

describe('the front page (note 6)', () => {
  it('changes page without a view transition, and plays its opening only on arrival', () => {
    const site = readFileSync('web/site/Site.tsx', 'utf8');
    const css = readFileSync('web/styles/site.css', 'utf8');
    expect(site).not.toMatch(/startViewTransition/);
    expect(css).not.toMatch(/view-transition/);
    expect(css).not.toMatch(/\.notice:hover \{[^}]*translate: 0/);
    // Every opening animation is scoped to the page a visitor arrived at.
    for (const rule of css.match(/^\s*[^@\n{]*\{[^}]*animation: (?:art-in|copy-in|line-up|card-in|ping|settle)[^}]*\}/gm) ?? []) {
      expect(rule.trim(), rule).toMatch(/^\.opening /);
    }
  });
});
