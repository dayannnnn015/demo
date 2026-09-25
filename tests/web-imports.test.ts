// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/http-app.js';
import { testDatabase, ids } from './helpers/database.js';
import { byLabel, byText, check, choose, click, expand, fill, showRoute, waitFor } from './helpers/dom';
import { csvProblem, csvStats, needsDecision, resolutionList } from '../web/screens/Imports';
import { routes } from '../web/routes';

const header = 'lrn,first_name,middle_name,last_name,name_extension,birth_date,sex';

describe('what the import screen checks before a file is sent', () => {
  it('measures a file the way the API does', () => {
    expect(csvStats(`${header}\r\n,Ana,,Cruz,,1994-01-01,female\r\n\r\n`)).toEqual({ bytes: expect.any(Number), rows: 1 });
    expect(csvStats(`﻿${header}\n,Ana,,Cruz,,1994-01-01,female\n,Ben,,Cruz,,1994-01-02,male`).rows).toBe(2);
    expect(csvStats('ñ').bytes).toBe(2);
  });

  it('refuses a file larger than one import holds', () => {
    const rows = Array.from({ length: 51 }, (_, i) => `,Name${i},,Surname,,1994-01-01,female`);
    expect(csvProblem([header, ...rows].join('\n'))).toContain('51 learners');
    expect(csvProblem([header, ...rows.slice(0, 50)].join('\n'))).toBeNull();
    expect(csvProblem(`${header}\n`)).toContain('no learners');
    expect(csvProblem(`${header}\n${',x,,y,,1994-01-01,female,'.repeat(1)}${'a'.repeat(24000)}`)).toContain('bytes');
    expect(csvProblem('')).toBeNull();
  });

  it('sends one decision per row, in row order', () => {
    expect(resolutionList({ 3: { row: 3, action: 'create_distinct', reason: 'x' }, 1: { row: 1, action: 'use_existing', learner_id: 'a', version: 1 } }).map(r => r.row)).toEqual([1, 3]);
  });

  it('asks for a decision only on a possible duplicate or an LRN already on file', () => {
    const issue = (row: number, code: string) => ({ row, field: 'resolutions', code, message: '' });
    expect(needsDecision([issue(1, 'POSSIBLE_DUPLICATE')], 1)).toBe(true);
    expect(needsDecision([issue(1, 'LRN_EXISTS')], 1)).toBe(true);
    expect(needsDecision([issue(1, 'INVALID_BIRTH_DATE')], 1)).toBe(false);
    expect(needsDecision([issue(2, 'POSSIBLE_DUPLICATE')], 1)).toBe(false);
  });

  it('is a built, manager-only screen', () => {
    const route = routes.find(r => r.id === 'imports')!;
    expect(route.built).toBe(true);
    expect(route.manager).toBe(true);
  });
});

describe('the import screen against the API', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let app: ReturnType<typeof createApp>;
  let unmount: (() => Promise<void>) | null = null;
  const year = randomUUID(), narra = randomUUID(), molave = randomUUID();
  const route = routes.find(r => r.id === 'imports')!;
  const show = async (log: string[] = []) => {
    const view = await showRoute(app, route, { actor: ids.principal, manager: true, log });
    unmount = view.unmount;
    await choose(view.host, 'Section', narra);
    await fill(byLabel(view.host, 'First day in the section'), '2001-06-03');
    return view;
  };
  const paste = async (host: HTMLElement, lines: string[]) => {
    await fill(byLabel<HTMLTextAreaElement>(host, 'CSV text'), [header, ...lines].join('\r\n'));
  };
  const count = async (last: string) => (await db.pg.query<{ learners: number; enrolled: number }>(
    `select count(distinct l.id)::int learners, count(e.id)::int enrolled from edunexus.learners l
      left join edunexus.enrollments e on e.learner_id=l.id and e.academic_year_id=$2 where l.last_name=$1`, [last, year])).rows[0]!;

  beforeAll(async () => {
    db = await testDatabase();
    app = createApp({ database: db.database, logger: pino({ enabled: false }), origins: [], auth: { async verify(token) { return { userId: token }; } } });
    await db.pg.query("insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,2001,'2001-06-01','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.reporting_periods(academic_year_id,ordinal,name,starts_on,ends_on) values($1,1,'Synthetic term','2001-06-01','2002-03-31')", [year]);
    await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name) values($1,$3,3,'Synthetic Narra'),($2,$3,3,'Synthetic Molave')", [narra, molave, year]);
    await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);
  });
  beforeEach(async () => { await db.pg.query('delete from edunexus.request_buckets'); });
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });
  afterAll(async () => db?.database.close());

  it('previews a class list, then registers and enrols every row', async () => {
    const { host } = await show();
    await paste(host, ['100000000101,Ana,,Importado,,1994-01-01,female', ',Ben,Reyes,Importado,Jr,1994-05-06,male']);
    expect(host.textContent).toContain('2 learners');
    await click(byText(host, 'Preview the import'));

    const confirm = await waitFor(() => byText(host, 'Import 2 learners'), 'a committable preview');
    expect(host.textContent).toContain('Synthetic Narra');
    expect(host.textContent).toContain('LRN 100000000101');
    expect(host.textContent).toContain('2 new records, 0 already on file');
    expect(await count('Importado')).toEqual({ learners: 0, enrolled: 0 });
    await click(confirm);

    await waitFor(() => byText(host, 'Imported', 'h2'), 'the receipt');
    expect(await count('Importado')).toEqual({ learners: 2, enrolled: 2 });
    const pending = await db.pg.query("select lrn from edunexus.learners where first_name='Ben' and last_name='Importado'");
    expect(pending.rows).toEqual([{ lrn: null }]);
  });

  it('shows a rejected row beside its data and offers no import', async () => {
    const { host } = await show();
    await paste(host, [',Cara,,Mali,,1994-01-01,female', ',Dino,,Mali,,2005-01-01,male']);
    await click(byText(host, 'Preview the import'));
    const row = await waitFor(() => byText(host, /^Mali, Dino/, 'span')?.closest('tr'), 'the rejected row');
    expect(row!.querySelector('.field-error')?.textContent).toContain('Birth date must precede enrollment');
    expect(byText(host, /^Import \d/)).toBeUndefined();
    expect(await count('Mali')).toEqual({ learners: 0, enrolled: 0 });
  });

  it('asks who a possible duplicate is, marks the preview stale, then enrols the learner already on file', async () => {
    const existing = await request(app).post('/api/v1/learners').set('Authorization', `Bearer ${ids.principal}`)
      .send({ first_name: 'Elena', last_name: 'Onfile', birth_date: '1994-03-03', sex: 'female' });
    expect(existing.status).toBe(201);

    const { host } = await show();
    await paste(host, [',Elena,,Onfile,,1994-03-03,female']);
    await click(byText(host, 'Preview the import'));
    const row = await waitFor(() => byText(host, /^Onfile, Elena/, 'span')?.closest('tr'), 'the duplicate row');
    expect(row!.textContent).toContain('Review possible matches');
    await expand(row);
    await check(await waitFor(() => byText(host, /The learner already on file/, 'span')?.closest('label')?.querySelector('input'), 'the candidate'));

    await waitFor(() => host.textContent?.includes('Your decisions changed since this preview'), 'the stale notice');
    expect(byText(host, /^Import \d/)).toBeUndefined();
    await click(byText(host.querySelector('.callout.attention')!, 'Preview again'));
    await click(await waitFor(() => byText(host, 'Import 1 learner'), 'the resolved preview'));

    await waitFor(() => byText(host, 'Imported', 'h2'), 'the receipt');
    expect(host.textContent).toContain('Existing learner enrolled');
    expect(await count('Onfile')).toEqual({ learners: 1, enrolled: 1 });
  });

  it('imports a namesake as a different child, keeping the reason in the receipt', async () => {
    const { host } = await show();
    await choose(host, 'Section', molave);
    await paste(host, [',Elena,Cruz,Onfile,,1994-03-03,female']);
    await click(byText(host, 'Preview the import'));
    const row = await waitFor(() => byText(host, /^Onfile, Elena/, 'span')?.closest('tr'), 'the namesake row');
    await expand(row);
    await check(await waitFor(() => byText(host, 'A different child with a similar name', 'span')?.closest('label')?.querySelector('input'), 'the distinct choice'));
    await fill(byLabel(host, 'Why they are a different child'), 'Different parents on the birth certificate.');
    await click(await waitFor(() => byText(host.querySelector('.callout.attention')!, 'Preview again'), 'the stale notice'));
    await click(await waitFor(() => byText(host, 'Import 1 learner'), 'the resolved preview'));

    await waitFor(() => byText(host, 'Imported', 'h2'), 'the receipt');
    expect(host.textContent).toContain('Different parents on the birth certificate.');
    expect((await count('Onfile')).learners).toBe(2);
  });

  it('reports a wrong header on the page and imports nothing', async () => {
    const { host } = await show();
    await fill(byLabel<HTMLTextAreaElement>(host, 'CSV text'), 'first,last\nAna,Cruz');
    await click(byText(host, 'Preview the import'));
    await waitFor(() => host.querySelector('.status.error')?.textContent?.includes('template header'), 'the header refusal');
  });

  it('refuses an oversized list before sending it', async () => {
    const log: string[] = [];
    const { host } = await show(log);
    await paste(host, Array.from({ length: 51 }, (_, i) => `,Name${i},,Toolong,,1994-01-01,female`));
    expect(host.textContent).toContain('51 learners');
    expect((byText(host, 'Preview the import') as HTMLButtonElement).disabled).toBe(true);
    expect(log.filter(line => line.startsWith('POST'))).toEqual([]);
  });
});
