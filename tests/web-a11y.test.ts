// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import axe from 'axe-core';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { mount, settle, showRoute, waitFor } from './helpers/dom';
import { AppShell } from '../web/components/AppShell';
import { routes } from '../web/routes';

/**
 * Every screen, as a manager and as an adviser, through axe's structural
 * rules: every control named, every label pointing at something, roles and
 * ARIA used as the specification allows, no duplicate ids. It stands in for
 * part of the accessibility pass nobody has run in a signed-in browser.
 *
 * happy-dom has no layout, so colour contrast cannot be measured here; the
 * design tokens were contrast-checked by hand instead. `region` is off because
 * a screen is mounted without the shell's landmarks around it — the shell is
 * checked on its own below.
 */
const options: axe.RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
  rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
};

const describeViolations = (results: axe.AxeResults) => results.violations.map(v =>
  `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 3).map(n => `    ${n.html.slice(0, 160)}`).join('\n')}`).join('\n');

describe('accessibility of every screen', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  const year = randomUUID(), section = randomUUID(), period = randomUUID();
  const reason = 'Synthetic records for the accessibility test.';
  const post = (url: string, body: object) => request(app).post(`/api/v1${url}`).set('Authorization', `Bearer ${ids.principal}`).send(body);

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2004,'2004-06-01','2005-03-31')", [year]);
    await db.pg.query("insert into edunexus.reporting_periods(id,academic_year_id,ordinal,name,starts_on,ends_on) values($1,$2,1,'Synthetic term','2004-06-01','2005-03-31')", [period, year]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,'Synthetic Pine',$3)", [section, year, ids.teacher]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    for (const last of ['Aquino', 'Bello']) {
      const l = await post('/learners', { first_name: 'Synthetic', last_name: last, birth_date: '1998-01-01', sex: 'male' });
      expect((await post('/enrollments', { learner_id: l.body.data.id, section_id: section, enrolled_on: '2004-06-01' })).status).toBe(201);
    }
    const draft = (await post('/assessment-policy-drafts', { code: 'SYNA11Y', name: 'Synthetic draft', source_reference: 'Synthetic source for testing only', grade_levels: [1], status: 'draft', reason,
      components: [{ code: 'WW', name: 'Synthetic written', weight_basis_points: 10000 }] })).body.data;
    const adoption = (await post('/assessment-policy-adoptions', { academic_year_id: year, policy_id: draft.id, policy_version: draft.version, adopted_on: '2004-06-15', adoption_reference: 'Synthetic school record reference.', reason })).body.data;
    const subject = (await post('/subjects', { code: 'SYNA11Y', name: 'Synthetic subject', kind: 'learning_area', grade_levels: [1], active: true, reason })).body.data;
    const offering = (await post(`/sections/${section}/subjects`, { subject_id: subject.id, subject_version: subject.version, display_order: 10, reason })).body.data;
    expect((await post('/assessment-policy-bindings', { offering_id: offering.id, offering_version: offering.version, adoption_id: adoption.id, adoption_version: adoption.version, reason })).status).toBe(201);
    expect((await post(`/section-subjects/${offering.id}/assessment-tasks`, { reporting_period_id: period, component_code: 'WW', sequence: 1, title: 'Synthetic quiz', max_score: 10, reason })).status).toBe(201);
  });
  afterAll(async () => db?.database.close());

  const check = async (id: string, actor: string, manager: boolean) => {
    const route = routes.find(r => r.id === id)!;
    const view = await showRoute(app, route, { actor, manager });
    try {
      // Let every first fetch land: skeletons gone, then two more turns for the reads they unlock.
      await waitFor(() => !view.host.querySelector('.skeleton-table'), `${id} to load`, 10000).catch(() => undefined);
      await settle(); await settle();
      const results = await axe.run(view.host, options);
      return results;
    } finally {
      await view.unmount();
      document.body.innerHTML = '';
    }
  };

  it('does catch a violation in this environment, so a pass means something', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<input type="text"><button type="button"></button>';
    document.body.append(host);
    try {
      const found = (await axe.run(host, options)).violations.map(v => v.id).sort();
      expect(found).toEqual(expect.arrayContaining(['button-name', 'label']));
    } finally { host.remove(); }
  });

  for (const route of routes) {
    it(`${route.id} as a manager`, async () => {
      const results = await check(route.id, ids.principal, true);
      expect(results.violations, describeViolations(results)).toEqual([]);
    });
    if (!route.manager) {
      it(`${route.id} as an adviser`, async () => {
        const results = await check(route.id, ids.teacher, false);
        expect(results.violations, describeViolations(results)).toEqual([]);
      });
    }
  }

  it('the shell, with its landmarks', async () => {
    const view = await mount(createElement(AppShell, {
      me: { user_id: ids.principal, display_name: 'Synthetic Principal', role: 'principal' },
      current: routes[0]!, onNavigate: () => {}, onSignOut: () => {}, onChangePassword: () => {},
      children: createElement('p', null, 'Synthetic content'),
    }));
    try {
      const results = await axe.run(document.body, { ...options, rules: { 'color-contrast': { enabled: false } } });
      expect(results.violations, describeViolations(results)).toEqual([]);
    } finally { await view.unmount(); }
  });
});
