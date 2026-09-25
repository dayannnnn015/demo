// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { byLabel, byText, choose, click, expand, fill, showRoute, waitFor } from './helpers/dom';
import { basisPoints, componentProblem, percentText, totalPercent } from '../web/screens/Policies';
import { routes } from '../web/routes';

describe('policy weights as the screen reads them', () => {
  it('turns a typed percentage into basis points without rounding', () => {
    expect(basisPoints('37.5')).toBe(3750);
    expect(basisPoints('100')).toBe(10000);
    expect(basisPoints('0.01')).toBe(1);
    expect(basisPoints(' 25 ')).toBe(2500);
    // A third decimal place is refused, not rounded: rounding a weight is a rule nobody supplied.
    expect(basisPoints('12.345')).toBeNull();
    expect(basisPoints('0')).toBeNull();
    expect(basisPoints('101')).toBeNull();
    expect(basisPoints('-5')).toBeNull();
    expect(basisPoints('')).toBeNull();
  });

  it('writes basis points back the way they were typed', () => {
    expect(percentText(3750)).toBe('37.5');
    expect(percentText(3333)).toBe('33.33');
    expect(percentText(10000)).toBe('100');
    expect(percentText(5)).toBe('0.05');
  });

  it('refuses components the API would refuse, and nothing else', () => {
    const c = (code: string, percent: string, name = 'Named') => ({ code, name, percent });
    expect(componentProblem([c('WW', '40'), c('PT', '60')])).toBeNull();
    expect(componentProblem([])).toContain('at least one');
    expect(componentProblem([c('WW', '40'), c('ww', '60')])).toContain('share a code');
    expect(componentProblem([c('WW', '40'), c('PT', '59.99')])).toContain('99.99%');
    expect(componentProblem([c('WW', '40'), c('PT', '60', ' ')])).toContain('needs a name');
    expect(componentProblem([c('1W', '100')])).toContain('starts with a letter');
    expect(componentProblem(Array.from({ length: 11 }, (_, i) => c(`C${i}`, '1')))).toContain('ten');
    expect(totalPercent([c('WW', '33.33'), c('PT', '33.33'), c('QA', '33.34')])).toBe('100');
  });
});

describe('the policy screen against the API', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let unmount: (() => Promise<void>) | null = null;
  const year = randomUUID(), acacia = randomUUID();
  const reason = 'Typed from the synthetic school memorandum for the screen test.';
  const route = routes.find(r => r.id === 'policies')!;
  const call = (url: string, body: object, method: 'post' | 'patch' = 'post') => request(app)[method](`/api/v1${url}`).set('Authorization', `Bearer ${ids.principal}`).send(body);
  const sheet = () => document.querySelector('.sheet') as HTMLElement;
  const card = (host: HTMLElement, heading: RegExp) => byText(host, heading, 'h2')!.closest('.card') as HTMLElement;
  const show = async (log: string[] = []) => {
    const view = await showRoute(app, route, { actor: ids.principal, manager: true, log });
    unmount = view.unmount;
    return view;
  };
  const draftRow = async () => (await db.pg.query<{ id: string; version: number; components: { code: string; weight_basis_points: number }[] }>(
    "select id,version,components from edunexus.assessment_policy_drafts where code='SYNTH'")).rows[0];
  const adoption = async () => (await db.pg.query<{ id: string; status: string; policy_snapshot: { components: { weight_basis_points: number }[] } }>(
    'select id,status,policy_snapshot from edunexus.assessment_policy_adoptions order by created_at desc limit 1')).rows[0];
  const binding = async () => (await db.pg.query<{ status: string }>('select status from edunexus.assessment_policy_bindings order by created_at desc limit 1')).rows[0];

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2001,'2001-06-01','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2001-06-01','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name) values($1,$2,4,'Synthetic Acacia')", [acacia, year]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
    const subject = await call('/subjects', { code: 'SCI4', name: 'Science', kind: 'learning_area', grade_levels: [4], active: true, reason });
    expect(subject.status).toBe(201);
    expect((await call(`/sections/${acacia}/subjects`, { subject_id: subject.body.data.id, subject_version: 1, display_order: 1, reason })).status).toBe(201);
  });
  beforeEach(async () => { await db.pg.query('delete from edunexus.request_buckets'); });
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });
  afterAll(async () => db?.database.close());

  const fillDraft = async (weights: [string, string, string][]) => {
    await fill(byLabel(sheet(), 'Code'), 'synth');
    await fill(byLabel(sheet(), 'Name'), 'Synthetic weighting');
    await fill(byLabel(sheet(), 'Source reference'), 'Synthetic memorandum number one, for testing only.');
    for (const grade of ['Grade 4', 'Grade 5']) await click(byText(sheet(), grade, 'span')!.closest('label')!.querySelector('input'));
    for (let i = 0; i < weights.length; i++) {
      if (i > 0) await click(byText(sheet(), 'Add a component'));
      const [code, name, percent] = weights[i]!;
      await fill(sheet().querySelector(`input[aria-label="Component ${i + 1} code"]`), code);
      await fill(sheet().querySelector(`input[aria-label="Component ${i + 1} name"]`), name);
      await fill(sheet().querySelector(`input[aria-label="Component ${i + 1} weight"]`), percent);
    }
    await fill(byLabel(sheet(), 'Reason'), reason);
  };

  it('starts a draft with no components or weights of its own, and refuses a total other than 100% before sending', async () => {
    const log: string[] = [];
    const { host } = await show(log);
    await click(await waitFor(() => byText(host, 'Record a draft'), 'the draft action'));
    const weight = sheet().querySelector<HTMLInputElement>('input[aria-label="Component 1 weight"]')!;
    expect(weight.value).toBe('');
    expect(sheet().querySelectorAll('input[aria-label$="weight"]')).toHaveLength(1);

    await fillDraft([['WW', 'Written work', '40'], ['PT', 'Performance tasks', '50']]);
    expect(sheet().textContent).toContain('90%');
    await click(byText(sheet(), 'Record the draft'));
    expect(sheet().querySelector('.status.error')?.textContent).toContain('must total exactly 100%');
    expect(log.filter(l => l.startsWith('POST'))).toEqual([]);
  });

  it('records a draft exactly as typed, labelled unapproved', async () => {
    const { host } = await show();
    await click(await waitFor(() => byText(host, 'Record a draft'), 'the draft action'));
    await fillDraft([['WW', 'Written work', '37.5'], ['PT', 'Performance tasks', '62.5']]);
    await click(byText(sheet(), 'Record the draft'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    // The API stores components in a canonical order, which is not a display priority, so compare them as a set.
    expect((await draftRow())!.components.map(c => [c.code, c.weight_basis_points]).sort()).toEqual([['PT', 6250], ['WW', 3750]]);
    const row = await waitFor(() => byText(card(host, /^Drafts/), 'SYNTH', 'b')?.closest('tr'), 'the new draft');
    expect(row!.textContent).toContain('Unapproved draft');
    expect(row!.textContent).toContain('WW 37.5%');
  });

  it('adopts the draft and keeps the adopted revision frozen when the draft is revised', async () => {
    const { host } = await show();
    await click(await waitFor(() => {
      const button = byText(host, 'Record an adoption') as HTMLButtonElement | undefined;
      return button && !button.disabled && button;
    }, 'the adoption action'));
    await fill(byLabel(sheet(), 'Adopted on'), '2001-06-15');
    await fill(byLabel(sheet(), 'School record of the decision'), 'Synthetic school memorandum 1, s. 2001.');
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Record the adoption'));
    await waitFor(() => !document.querySelector('.sheet'), 'the sheet to close');
    expect(await adoption()).toMatchObject({ status: 'adopted' });

    const draft = (await draftRow())!;
    const revised = await call(`/assessment-policy-drafts/${draft.id}`, {
      version: draft.version, name: 'Synthetic weighting', source_reference: 'Synthetic memorandum number two, for testing only.', grade_levels: [4, 5],
      components: [{ code: 'WW', name: 'Written work', weight_basis_points: 3000 }, { code: 'PT', name: 'Performance tasks', weight_basis_points: 7000 }], status: 'draft', reason,
    }, 'patch');
    expect(revised.status).toBe(200);
    expect((await adoption())!.policy_snapshot.components.map(c => c.weight_basis_points).sort()).toEqual([3750, 6250]);
  });

  it('binds a section subject to the adoption, refuses withdrawal while bound, then releases and withdraws', async () => {
    const { host } = await show();
    await choose(host, 'Section', acacia);
    const bindings = () => card(host, /^Bindings for/);
    const row = await waitFor(() => byText(bindings(), 'SCI4', 'b')?.closest('tr'), 'the offering');
    expect(row!.textContent).toContain('No policy bound');
    await expand(row);
    await click(byText(bindings(), 'Bind an adopted policy'));
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Record the binding'));
    await waitFor(() => !document.querySelector('.sheet') && byText(bindings(), 'SYNTH', 'b'), 'the binding');
    expect(await binding()).toMatchObject({ status: 'bound' });

    const adopted = await waitFor(() => byText(card(host, /^Adoptions/), 'SYNTH', 'b')?.closest('tr'), 'the adoption row');
    await expand(adopted);
    await click(byText(host, 'Withdraw this adoption'));
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Withdraw the adoption'));
    await waitFor(() => sheet().querySelector('.status.error')?.textContent?.includes('Release the subject bindings'), 'the bound refusal');
    await click(sheet().querySelector('.sheet-close'));

    await expand(await waitFor(() => byText(bindings(), 'SCI4', 'b')?.closest('tr'), 'the bound offering'));
    await click(byText(bindings(), 'Release this binding'));
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Release the binding'));
    await waitFor(() => !document.querySelector('.sheet'), 'the release');
    expect(await binding()).toMatchObject({ status: 'released' });

    await expand(await waitFor(() => byText(card(host, /^Adoptions/), 'SYNTH', 'b')?.closest('tr'), 'the adoption row'));
    await click(byText(host, 'Withdraw this adoption'));
    await fill(byLabel(sheet(), 'Reason'), reason);
    await click(byText(sheet(), 'Withdraw the adoption'));
    await waitFor(() => !document.querySelector('.sheet'), 'the withdrawal');
    expect(await adoption()).toMatchObject({ status: 'withdrawn' });
  });

  it('is a manager-only route', () => {
    expect(route.manager).toBe(true);
    expect(route.built).toBe(true);
  });
});
