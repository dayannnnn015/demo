import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { createApp } from '../src/http-app.js';
import { AppError } from '../src/core/errors.js';
import { testDatabase, ids } from '../tests/helpers/database.js';

/**
 * A local, throwaway EDUNEXUS full of synthetic records, for looking at the
 * workspace without a Supabase account: design review, screenshots, a
 * walkthrough for staff who are learning it.
 *
 * It is the real API and the real screens over an in-memory PGlite database
 * that disappears when the process stops. Sign-in is replaced by a choice of
 * synthetic staff member on `web/demo.html`, so it accepts exactly those
 * identifiers as tokens and nothing else, and it listens on the loopback
 * address only. Nothing here reads `.env`, and no record resembles a real one.
 */
if (process.env.NODE_ENV === 'production') throw new Error('The demo refuses to run with NODE_ENV=production.');

const db = await testDatabase();
const known = new Set(Object.values(ids));
const app = createApp({
  database: db.database, logger: pino({ enabled: false }), origins: [],
  auth: { async verify(token) { if (!known.has(token)) throw new AppError(401, 'AUTH_REQUIRED', 'Choose a demo staff member.'); return { userId: token }; } },
});

const reason = 'Synthetic demo record, not a real learner or school.';
const as = (actor: string) => ({
  get: (url: string) => request(app).get(`/api/v1${url}`).set('Authorization', `Bearer ${actor}`),
  post: async (url: string, body: object) => {
    await db.pg.query('delete from edunexus.request_buckets');
    const r = await request(app).post(`/api/v1${url}`).set('Authorization', `Bearer ${actor}`).send(body);
    if (r.status >= 300) throw new Error(`${url}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.data;
  },
});
const principal = as(ids.principal);

// Dates around today, so the register, calendar and monitor open on something.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}T00:00:00Z`);
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);
const startYear = today.getUTCMonth() >= 5 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
const yearStart = `${startYear}-06-01`, yearEnd = `${startYear + 1}-03-31`;

const year = randomUUID();
const names = [
  ['Demo', 'Adviser, Grade 1', ids.teacher], ['Demo', 'Adviser, Grade 2', ids.otherTeacher],
] as const;
await db.pg.query("update edunexus.staff set display_name=$2 where user_id=$1", [ids.principal, 'Demo Principal']);
await db.pg.query("update edunexus.staff set display_name=$2 where user_id=$1", [ids.officer, 'Demo Administrative Officer']);
for (const [first, last, id] of names) await db.pg.query("update edunexus.staff set display_name=$2 where user_id=$1", [id, `${first} ${last}`]);
await db.pg.query("update edunexus.school_profile set name='Demo Elementary School (synthetic records)', address='Nowhere Road, Demo Town'");
await db.pg.query('insert into edunexus.academic_years(id,start_year,starts_on,ends_on) values($1,$2,$3,$4)', [year, startYear, yearStart, yearEnd]);
const periods: string[] = [];
for (const [n, from, to] of [[1, yearStart, `${startYear}-08-31`], [2, `${startYear}-09-01`, `${startYear}-11-15`], [3, `${startYear}-11-16`, `${startYear + 1}-01-31`], [4, `${startYear + 1}-02-01`, yearEnd]] as const) {
  const id = randomUUID(); periods.push(id);
  await db.pg.query('insert into edunexus.reporting_periods(id,academic_year_id,ordinal,name,starts_on,ends_on) values($1,$2,$3,$4,$5,$6)', [id, year, n, `Demo term ${n}`, from, to]);
}
const sections = { g1: randomUUID(), g2: randomUUID(), k: randomUUID() };
await db.pg.query("insert into edunexus.sections(id,academic_year_id,grade_level,name,adviser_user_id) values($1,$2,1,'Demo Narra',$3),($4,$2,2,'Demo Molave',$5),($6,$2,0,'Demo Sampaguita',null)",
  [sections.g1, year, ids.teacher, sections.g2, ids.otherTeacher, sections.k]);
await db.pg.query("update edunexus.academic_years set status='active' where id=$1", [year]);

// Learners: plainly synthetic names, a pending LRN for some.
const first = ['Ana', 'Ben', 'Carla', 'Dino', 'Ella', 'Felix', 'Gina', 'Hugo', 'Iris', 'Jojo', 'Kiko', 'Lia', 'Migo', 'Nina', 'Oli', 'Pia', 'Quin', 'Rina', 'Sol', 'Toni'];
const last = ['Demoson', 'Samplera', 'Testado', 'Placeholder', 'Fictiva', 'Mockadal', 'Examplo', 'Stubano'];
const roster: Record<string, string[]> = { g1: [], g2: [], k: [] };
let n = 0;
for (const [key, grade, count] of [['g1', 1, 18], ['g2', 2, 16], ['k', 0, 10]] as const) {
  for (let i = 0; i < count; i++, n++) {
    const born = `${startYear - 6 - grade}-${String(1 + (n % 12)).padStart(2, '0')}-${String(1 + (n % 27)).padStart(2, '0')}`;
    const learner = await principal.post('/learners', { first_name: first[n % first.length], last_name: last[(n * 3) % last.length], birth_date: born, sex: n % 2 ? 'male' : 'female', lrn: n % 5 === 4 ? null : `9${String(100000000000 + n).slice(1)}` });
    const enrollment = await principal.post('/enrollments', { learner_id: learner.id, section_id: sections[key], enrolled_on: yearStart });
    roster[key]!.push(enrollment.id);
  }
}

// The school calendar for this month and the last: weekdays classroom, weekends no class.
const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
const days: Date[] = [];
for (let d = monthStart; d <= monthEnd; d = shift(d, 1)) if (iso(d) >= yearStart && iso(d) <= yearEnd) days.push(d);
for (let i = 0; i < days.length; i += 60) {
  const calendar = await principal.get(`/academic-years/${year}/calendar?from=${iso(days[0]!)}&to=${iso(days[Math.min(days.length - 1, 61)]!)}`);
  const version = calendar.body.data.calendar_version;
  const changes = days.slice(i, i + 60).map(d => (d.getUTCDay() % 6 === 0
    ? { day_on: iso(d), action: 'set', am: 'no_class', pm: 'no_class', day_type: 'weekend', label: 'Weekend' }
    : { day_on: iso(d), action: 'set', am: 'classroom', pm: 'classroom', day_type: 'regular', label: 'Demo school day' }));
  const body = { version, section_id: null, changes, reason };
  const preview = await principal.post(`/academic-years/${year}/calendar/preview`, body);
  await principal.post(`/academic-years/${year}/calendar/corrections`, { ...body, review_hash: preview.review_hash, reviewed: true });
}

// Two weeks of Grade 1 marks up to yesterday, a few absences, and one day left half-done.
const adviser = as(ids.teacher);
const schoolDays = days.filter(d => d.getUTCDay() % 6 !== 0 && d < today).slice(-10);
for (const [index, day] of schoolDays.entries()) {
  const sheet = await principal.get(`/sections/${sections.g1}/attendance?day_on=${iso(day)}`);
  const changes = roster.g1!.map((id, i) => {
    if (index === schoolDays.length - 1 && i > 12) return null;
    const absent = (i + index) % 9 === 0;
    return { enrollment_id: id, am: absent ? 'absent' : 'present', pm: absent || (i === 3 && index % 3 === 0) ? 'absent' : 'present' };
  }).filter(Boolean);
  const body = { day_on: iso(day), version: sheet.body.data.version, changes, reason };
  const preview = await adviser.post(`/sections/${sections.g1}/attendance/preview`, body);
  await adviser.post(`/sections/${sections.g1}/attendance/corrections`, { ...body, review_hash: preview.review_hash, reviewed: true });
}

// Subjects, a policy the demo "school" adopted, and a few assessments with raw marks.
const draft = await principal.post('/assessment-policy-drafts', { code: 'DEMO', name: 'Demo policy (not a DepEd policy)', source_reference: 'Synthetic demo only; no real weights', grade_levels: [1, 2], status: 'draft', reason,
  components: [{ code: 'WW', name: 'Written work', weight_basis_points: 5000 }, { code: 'PT', name: 'Performance task', weight_basis_points: 5000 }] });
const adoption = await principal.post('/assessment-policy-adoptions', { academic_year_id: year, policy_id: draft.id, policy_version: draft.version, adopted_on: yearStart, adoption_reference: 'Demo record, not a school decision.', reason });
for (const [code, name] of [['DMATH', 'Mathematics (demo)'], ['DREAD', 'Reading (demo)'], ['DARTS', 'Arts (demo)']] as const) {
  const subject = await principal.post('/subjects', { code, name, kind: 'learning_area', grade_levels: [0, 1, 2], active: true, reason });
  for (const key of ['g1', 'g2'] as const) {
    const offering = await principal.post(`/sections/${sections[key]}/subjects`, { subject_id: subject.id, subject_version: subject.version, display_order: code === 'DMATH' ? 10 : code === 'DREAD' ? 20 : 30, reason });
    if (code === 'DARTS') continue;
    await principal.post('/assessment-policy-bindings', { offering_id: offering.id, offering_version: offering.version, adoption_id: adoption.id, adoption_version: adoption.version, reason });
    if (key !== 'g1' || code !== 'DMATH') continue;
    const current = periods[today.toISOString().slice(0, 10) >= `${startYear}-09-01` ? 1 : 0]!;
    for (const [sequence, title, max] of [[1, 'Quiz on place value', 20], [2, 'Quiz on addition', 15]] as const) {
      const task = await principal.post(`/section-subjects/${offering.id}/assessment-tasks`, { reporting_period_id: current, component_code: 'WW', sequence, title, max_score: max, reason });
      const entries = roster.g1!.slice(0, sequence === 1 ? 18 : 11).map((id, i) => ({ enrollment_id: id, raw_score: Math.max(0, max - ((i * 7) % 9)) - (i % 4 === 0 ? 0.5 : 0), version: 0 }));
      await adviser.post(`/assessment-tasks/${task.id}/scores`, { entries, reason });
    }
    await principal.post(`/section-subjects/${offering.id}/assessment-tasks`, { reporting_period_id: current, component_code: 'PT', sequence: 1, title: 'Counting objects in class', max_score: 10, reason });
  }
}
await db.pg.query('delete from edunexus.request_buckets');

const api = app.listen(3001, '127.0.0.1');
const web = await createServer({ configFile: 'vite.config.ts', server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await web.listen();
console.log('EDUNEXUS demo, synthetic records only. Open http://127.0.0.1:5173/demo.html');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { api.close(); void web.close().then(() => db.database.close()).finally(() => process.exit(0)); });
