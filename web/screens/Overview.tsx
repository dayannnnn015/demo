import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import {
  Badge, EmptyState, PrintButton, Table, TableSkeleton, Unrecorded,
  gradeName, localToday, sentence, value, yearName, type Status,
} from '../components/primitives';
import { Donut, StatTile, Timeline, type Slice } from '../components/figures';

/**
 * The workspace landing screen.
 *
 * It reads the school profile, school years, reporting periods, sections, staff
 * and the audit log — and deliberately reads no learner or enrollment record at
 * all. Every list under `/learners` and `/enrollments` writes a row into
 * `record_access_events` naming the exact records returned, so a dashboard that
 * counted 897 enrolments on each load would bury the privacy audit under its
 * own noise and make it useless for the thing it exists to catch.
 *
 * How many learners are enrolled comes from `/enrollment-counts`, which answers
 * with numbers by grade and names no record, so it writes no access row. It is
 * the only learner figure here, and paging the roster to count it would defeat
 * the audit this paragraph describes.
 *
 * Nothing here is computed from a mark or a score. The figures are calendar and
 * roster facts: which stretch of the year today falls in, how many sections
 * exist at each grade, who holds access. Averages, attendance rates and
 * academic standing stay behind their gates in docs/constraints.md, and the
 * screen draws their absence rather than leaving it to be guessed at.
 */

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

/** Attendance and enrolment are both dated records, so the day is worth stating. */
const longDate = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** The name someone is greeted by, which is the first word of how they are filed. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const covering = (periods: Row[], today: string) =>
  periods.find(p => String(p.starts_on) <= today && today <= String(p.ends_on));

/** The figures EDUNEXUS is not allowed to state, and the decision each waits on. */
const GATED: [string, string][] = [
  ['General average', 'Waits on the grading enclosure'],
  ['Attendance rate', 'Waits on the mark meanings'],
  ['Academic standing', 'Waits on the grading enclosure'],
  ['Class ranking', 'Never requested by the school'],
];

type Counts = { scope: 'school' | 'current_access'; enrolled: number; withdrawn: number; grades: { grade_level: number; enrolled: number; withdrawn: number }[] };

export function Overview({ api, me, manager, token }: {
  api: Api; me: Row; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number;
}) {
  const [years, setYears] = useState<Row[] | null>(null);
  const [periods, setPeriods] = useState<Row[]>([]);
  const [sections, setSections] = useState<Row[] | null>(null);
  const [staff, setStaff] = useState<Row[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [recent, setRecent] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const today = localToday();

  useEffect(() => {
    setYears(null);
    void api<Page>('/academic-years').then(r => setYears(r.items)).catch(() => setYears([]));
  }, [api, token]);

  const year = years?.find(y => y.status === 'active')
    ?? [...(years ?? [])].sort((a, b) => Number(b.start_year) - Number(a.start_year))[0];
  const yearId = year ? String(year.id) : '';

  useEffect(() => {
    if (!yearId) { setPeriods([]); setSections([]); return; }
    setSections(null);
    void api<Page>(`/academic-years/${yearId}/periods`).then(r => setPeriods(r.items)).catch(() => setPeriods([]));
    void (async () => {
      const all: Row[] = [];
      for (let offset = 0; ; offset += 100) {
        const result = await api<Page>(`/sections${query({ academic_year_id: yearId, limit: 100, offset })}`);
        all.push(...result.items);
        if (!result.pagination?.has_more) break;
      }
      setSections(all);
    })().catch(() => setSections([]));
  }, [api, yearId, token]);

  useEffect(() => {
    if (!yearId) { setCounts(null); return; }
    void api<Counts>(`/enrollment-counts${query({ academic_year_id: yearId })}`).then(setCounts).catch(() => setCounts(null));
  }, [api, yearId, token]);

  useEffect(() => {
    if (!manager) return;
    void api<Page>(`/staff${query({ limit: 100 })}`).then(r => setStaff(r.items)).catch(() => setStaff([]));
    void api<Page>(`/staff-invitations${query({ status: 'requested', limit: 50 })}`).then(r => setPending(r.items.length)).catch(() => setPending(null));
    void api<Page>(`/audit-events${query({ limit: 6 })}`).then(r => setRecent(r.items)).catch(() => setRecent([]));
  }, [api, manager, token]);

  const loading = years === null || (Boolean(yearId) && sections === null);
  const rooms = sections ?? [];
  const period = covering(periods, today);
  const active = year?.status === 'active';

  // Sections per grade, Kindergarten first, skipping grades the school has none of.
  const byGrade: Slice[] = [...new Set(rooms.map(r => Number(r.grade_level)))]
    .sort((a, b) => a - b)
    .map(grade => ({ label: gradeName(grade), count: rooms.filter(r => Number(r.grade_level) === grade).length }));

  const unassigned = rooms.filter(r => r.adviser_user_id == null).length;
  const activeStaff = staff.filter(s => s.active !== false);
  const teachers = activeStaff.filter(s => s.role === 'teacher').length;
  const staffName = (id: unknown) => staff.find(s => s.user_id === id)?.display_name;

  const adviser = (row: Row) => {
    if (row.adviser_user_id == null) return <Unrecorded label="No adviser" />;
    if (row.adviser_user_id === me.user_id) return <b>You</b>;
    const named = staffName(row.adviser_user_id);
    return named ? String(named) : <span className="muted">Assigned</span>;
  };

  if (loading) {
    return <div className="card"><TableSkeleton columns={4} rows={5} /></div>;
  }

  if (!year) {
    return (
      <div className="card">
        <EmptyState
          title="No school year exists yet"
          body="EDUNEXUS records everything against a school year. Create one under School years, add its reporting periods, then activate it."
        />
      </div>
    );
  }

  return (
    <>
      <div className="greeting">
        <div>
          <p className="greeting-eyebrow">{longDate()}</p>
          <h2>{greeting()}, {firstName(String(me.display_name))}</h2>
          <p className="greeting-sub">
            {active
              ? <>Records you enter go into <b>{yearName(year)}</b>{period ? <> during <b>{String(period.name)}</b></> : null}.</>
              : <>No school year is active, so no new records can be entered yet.</>}
          </p>
        </div>
        {active ? <Badge tone="good">Year active</Badge> : <Badge tone="attention">{sentence(value(year, 'status'))}</Badge>}
      </div>

      <div className="tiles">
        <StatTile
          accent={0}
          label="School year"
          value={yearName(year)}
          meta={<span className="mono">{value(year, 'starts_on')} → {value(year, 'ends_on')}</span>}
        />
        <StatTile
          accent={1}
          label="Reporting periods"
          value={periods.length}
          meta={period ? <>Now in <b>{String(period.name)}</b></> : 'None covers today'}
        />
        <StatTile
          accent={2}
          label={manager ? 'Sections' : 'Sections you advise'}
          value={rooms.length}
          meta={byGrade.length ? `Across ${byGrade.length} grade ${byGrade.length === 1 ? 'level' : 'levels'}` : 'None created yet'}
        />
        <StatTile
          accent={4}
          label={manager ? 'Learners enrolled' : 'Your learners'}
          value={counts ? counts.enrolled : <Unrecorded label="Not read" />}
          meta={counts ? `${counts.withdrawn} withdrawn this year · voided records not counted` : 'The count could not be read'}
        />
        {manager ? (
          <StatTile
            accent={3}
            label="Staff with access"
            value={activeStaff.length}
            meta={<>{teachers} {teachers === 1 ? 'teacher' : 'teachers'}{pending ? <> · {pending} invitation{pending === 1 ? '' : 's'} waiting</> : null}</>}
          />
        ) : (
          <StatTile
            accent={3}
            label="Your access"
            value="Teacher"
            meta="Read-only, for your currently assigned learners"
          />
        )}
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head"><div>
            <h2>The school year</h2>
            <p className="card-note">Where today falls among the reporting periods this year is divided into.</p>
          </div></div>
          <div className="card-body">
            {periods.length ? (
              <Timeline
                from={String(year.starts_on)}
                to={String(year.ends_on)}
                today={today}
                spans={[...periods]
                  .sort((a, b) => Number(a.ordinal) - Number(b.ordinal))
                  .map(p => ({ label: String(p.name), from: String(p.starts_on), to: String(p.ends_on) }))}
              />
            ) : (
              <EmptyState
                title="No reporting periods yet"
                body="A school year is divided into reporting periods while it is still a draft. Add them under Reporting periods."
              />
            )}
          </div>
        </div>

        {counts?.grades.length ? (
          <div className="card">
            <div className="card-head"><div>
              <h2>{manager ? 'Learners by grade' : 'Your learners by grade'}</h2>
              <p className="card-note">Currently enrolled, from a count that names nobody. Withdrawn learners are not in the ring.</p>
            </div></div>
            <div className="card-body">
              <Donut
                slices={counts.grades.filter(g => g.enrolled).map(g => ({ label: gradeName(g.grade_level), count: g.enrolled }))}
                centreValue={counts.enrolled}
                centreLabel={counts.enrolled === 1 ? 'learner' : 'learners'}
              />
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="card-head"><div>
            <h2>Sections by grade</h2>
            <p className="card-note">How many classes exist at each grade level in this school year.</p>
          </div></div>
          <div className="card-body">
            {byGrade.length ? (
              <Donut slices={byGrade} centreValue={rooms.length} centreLabel={rooms.length === 1 ? 'section' : 'sections'} />
            ) : (
              <EmptyState title="No sections yet" body="Create the school's classes under Sections and advisers, each with one adviser." />
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{manager ? 'Sections and advisers' : 'Your sections'}</h2>
            <p className="card-note">
              {unassigned
                ? `${unassigned} ${unassigned === 1 ? 'section has' : 'sections have'} no adviser. Attendance cannot be recorded for a section until one is assigned.`
                : !rooms.length ? 'Nothing is set up for this school year yet.'
                : manager ? 'Every section in this school year has an adviser.'
                : 'The sections you currently advise in this school year.'}
            </p>
          </div>
          {rooms.length ? <div className="card-head-actions"><PrintButton /></div> : null}
        </div>
        <Table
          rows={[...rooms].sort((a, b) => Number(a.grade_level) - Number(b.grade_level) || String(a.name).localeCompare(String(b.name)))}
          rowKey={r => String(r.id)}
          empty={<EmptyState
            title={manager ? 'No sections yet' : 'You advise no sections'}
            body={manager
              ? 'Create the school\'s classes under Sections and advisers.'
              : 'A principal or administrative officer assigns advisers. Until then there are no learners for you to read.'}
          />}
          columns={[
            { header: 'Grade', cell: r => gradeName(r.grade_level) },
            { header: 'Section', cell: r => <b>{value(r, 'name')}</b> },
            { header: 'Adviser', cell: adviser },
          ]}
        />
      </div>

      {manager && recent.length ? (
        <div className="card">
          <div className="card-head"><div>
            <h2>Latest recorded changes</h2>
            <p className="card-note">Field names only. Values, learner names and credentials are never copied into this log.</p>
          </div></div>
          <Table
            rows={recent}
            rowKey={r => String(r.id)}
            columns={[
              { header: 'When', cell: r => new Date(String(r.occurred_at)).toLocaleString() },
              { header: 'Record', cell: r => <code>{value(r, 'entity_table')}</code> },
              { header: 'Action', cell: r => sentence(value(r, 'operation')) },
              { header: 'Fields changed', cell: r => Array.isArray(r.changed_fields) && r.changed_fields.length
                ? r.changed_fields.join(', ')
                : <Unrecorded label="None listed" /> },
            ]}
          />
        </div>
      ) : null}

      {/* Drawn, not omitted. A reader who expects a general average on a school
          dashboard should see that its absence was decided — and by whom. */}
      <div className="card">
        <div className="gated">
          <h3>Nothing in EDUNEXUS computes a grade or a rate</h3>
          <div className="gated-row">
            {GATED.map(([figure, waiting]) => (
              <div className="gated-box" key={figure}>
                <b>{figure}</b>
                <span>{waiting}</span>
              </div>
            ))}
          </div>
          <p>
            These depend on rules only the school can supply — the current DepEd grading enclosure, and the approved meaning of each
            attendance mark. Until those arrive, the system records what was entered and works nothing out from it. An unmarked session
            and an unentered score stay unknown rather than counting as zero.
          </p>
        </div>
      </div>
    </>
  );
}
