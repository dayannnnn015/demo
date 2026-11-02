import { useEffect, useId, useState, type FormEvent } from 'react';
import type { Api, Page, Row } from '../api';
import { ApiError, message, query } from '../api';
import type { Route } from '../routes';
import { Sheet } from '../components/overlay';
import { PrintCopy } from '../components/print';
import { SeededNotice } from '../components/seeded';
import { Icon } from '../components/icons';
import { StatTile } from '../components/figures';
import { Badge, Callout, Cell, EmptyState, PageHeader, Select, StatusLine, Table, TableSkeleton, gradeName, learnerName, localToday, type Status } from '../components/primitives';
import { hashParams } from './OutcomeQueue';

type Props = { api: Api; me: Row; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number; route: Route };
type Learner = {
  enrollment_id: string; learner_id: string; first_name: string; middle_name: string | null; last_name: string; name_extension: string | null;
  sex: 'male' | 'female'; from_grade: number; from_section: string; action: 'promoted' | 'conditionally_promoted' | 'retained' | 'remedial' | null; outcome_status: string | null;
};
type Reason = 'left' | 'no_outcome' | 'not_approved' | 'remedial' | 'completer' | 'already_enrolled' | 'no_section';
type Preview = {
  source_year: { id: string; start_year: number; status: string };
  target_year: { id: string; start_year: number; starts_on: string; status: string };
  seed: number; grade_level: number | null; review_hash: string;
  sections: { id: string; grade_level: number; name: string; adviser_name: string | null; enrolled: { male: number; female: number }; placed: { male: number; female: number } }[];
  placements: (Learner & { to_grade: number; section_id: string })[];
  unplaced: (Learner & { to_grade: number | null; reason: Reason })[];
  runs: { id: string; grade_level: number | null; seed: number; placed: number; reason: string; actor_name: string | null; recorded_at: string }[];
};

const idle: Status = { kind: 'idle', text: '' };
const yearLabel = (start: number) => `${start}–${start + 1}`;
const freshSeed = () => Math.floor(Math.random() * 1_000_000);
const outcomeWord = { promoted: 'Promoted', conditionally_promoted: 'Conditionally promoted', retained: 'Retained', remedial: 'Remedial' } as const;
const why = (u: Preview['unplaced'][number]) => ({
  left: 'Left during the year',
  no_outcome: 'No outcome recorded',
  not_approved: 'Outcome not approved yet',
  remedial: 'Remedial: placed after the remedial class',
  completer: 'Completed Grade 6',
  already_enrolled: 'Already enrolled next year',
  no_section: `No ${gradeName(u.to_grade)} section next year`,
})[u.reason];

/**
 * Next year's classes, prepared from this year's approved outcomes. Who moves
 * up is the school's decision, recorded on Report cards; this screen only
 * draws which section of the grade each learner joins, from a seed anyone can
 * repeat, balanced by sex and size, and enrols the whole draw at once.
 */
export function NextYear({ api, me, setStatus, token, route }: Props) {
  const [years, setYears] = useState<Row[] | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [seed, setSeed] = useState(freshSeed);
  const [seedText, setSeedText] = useState(String(seed));
  // Opened from the Overview for one grade, as `#/next-year?grade=3`.
  const [grade, setGrade] = useState(() => { const g = hashParams().get('grade'); return g && /^[0-6]$/.test(g) ? g : ''; });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Set when an enrolment was refused because the preview went stale, until the fresh draw says why.
  const [stale, setStale] = useState(false);
  const [section, setSection] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [printing, setPrinting] = useState(false);
  const id = useId();

  useEffect(() => {
    void api<Page>('/academic-years').then(page => {
      setYears(page.items);
      setSourceId(current => (page.items.some(y => y.id === current) ? current : String((page.items.find(y => y.status === 'active') ?? page.items[0])?.id ?? '')));
    }).catch(error => { setYears([]); setStatus({ kind: 'error', text: message(error) }); });
  }, [api, token]);

  const source = years?.find(y => y.id === sourceId);
  const target = source ? years?.find(y => Number(y.start_year) === Number(source.start_year) + 1) : undefined;

  useEffect(() => {
    if (!source || !target) { setPreview(null); return; }
    setPreview(null); setFailed(null);
    void api<Preview>(`/academic-years/${source.id}/next-year-classes${query({ target_year_id: String(target.id), seed, grade_level: grade || undefined })}`)
      .then(setPreview).catch(error => setFailed(message(error)));
  }, [api, source?.id, target?.id, seed, grade, tick, token]);

  // A refused enrolment is told apart from one that already happened: in another tab, or by a colleague,
  // the same classes may have been enrolled a moment ago, and "nobody was enrolled" would read as a loss.
  useEffect(() => {
    if (!stale || !preview) return;
    setStale(false);
    const last = preview.runs[0];
    setStatus(!preview.placements.length && last
      ? { kind: 'done', text: `Nobody is left to place: ${last.placed} ${last.placed === 1 ? 'learner was' : 'learners were'} already enrolled from this screen${last.actor_name ? ` by ${last.actor_name}` : ''} at ${new Date(last.recorded_at).toLocaleString()}.` }
      : { kind: 'error', text: 'Something changed since that preview was drawn, so nobody was enrolled. It has been drawn again: check it, then enrol.' });
  }, [stale, preview]);

  if (years === null) return <><PageHeader route={route} /><div className="card"><TableSkeleton columns={5} /></div></>;
  if (!source) return <><PageHeader route={route} /><div className="card"><EmptyState title="No school year yet" body="Next year’s classes come from a school year’s approved outcomes. Create the year first." /></div></>;

  const commitSeed = () => { const n = Number(seedText); if (Number.isInteger(n) && n >= 0 && n <= 2147483647) setSeed(n); else setSeedText(String(seed)); };
  const redraw = () => { const n = freshSeed(); setSeed(n); setSeedText(String(n)); };
  const count = (...reasons: Reason[]) => preview?.unplaced.filter(u => reasons.includes(u.reason)).length ?? 0;
  const sectionOf = new Map(preview?.sections.map(s => [s.id, s]) ?? []);
  const shown = preview?.placements.filter(p => !section || p.section_id === section) ?? [];

  return (
    <>
      <PageHeader route={route} actions={preview?.placements.length
        ? <button type="button" className="btn" onClick={() => setEnrolling(true)}><Icon name="enter" size={15} />Enrol {preview.placements.length} {preview.placements.length === 1 ? 'learner' : 'learners'}</button>
        : null} />
      <div className="card">
        <div className="card-head">
          <div className="toolbar">
            <div className="field">
              <label className="label" htmlFor={`${id}-year`}>From the school year</label>
              <Select id={`${id}-year`} value={sourceId} onChange={e => { setSourceId(e.target.value); setSection(''); }}>
                {years.map(y => <option key={String(y.id)} value={String(y.id)}>{yearLabel(Number(y.start_year))}</option>)}
              </Select>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${id}-grade`}>Grade next year</label>
              <Select id={`${id}-grade`} value={grade} onChange={e => { setGrade(e.target.value); setSection(''); }}>
                <option value="">Every grade</option>
                {[0, 1, 2, 3, 4, 5, 6].map(g => <option key={g} value={String(g)}>{gradeName(g)}</option>)}
              </Select>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${id}-seed`}>Draw number</label>
              <input id={`${id}-seed`} inputMode="numeric" className="mono" value={seedText} onChange={e => setSeedText(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                onBlur={commitSeed} onKeyDown={e => { if (e.key === 'Enter') commitSeed(); }} />
            </div>
            <button type="button" className="btn secondary" onClick={redraw}>Draw again</button>
            {preview?.placements.length ? <button type="button" className="btn ghost" onClick={() => setPrinting(true)}><Icon name="print" size={15} />Print the class lists</button> : null}
          </div>
          <p className="card-note">Each learner goes where their approved outcome on <b>Report cards → Promotion</b> leads: promoted or conditionally promoted up a grade, retained in the same one. The draw only chooses the section, balancing boys and girls and class sizes. The same draw number over the same records always gives the same classes, so it can be repeated and checked.</p>
        </div>
        {!target ? (
          <div className="card-body"><Callout tone="attention" title={`No ${yearLabel(Number(source.start_year) + 1)} school year yet`}>Create the {yearLabel(Number(source.start_year) + 1)} school year and its sections on <b>School years &amp; sections</b>, then come back here.</Callout></div>
        ) : failed ? (
          <div className="card-body"><Callout tone="stopped" title="The classes could not be drawn">{failed}</Callout></div>
        ) : !preview ? (
          <div className="card-body"><TableSkeleton columns={5} /></div>
        ) : null}
      </div>
      {target && preview && !failed ? (
          <>
            <div className="tiles">
              <StatTile label="To enrol" value={preview.placements.length} meta={`into ${yearLabel(preview.target_year.start_year)}, from ${preview.target_year.starts_on}`} accent={0} />
              <StatTile label="Completed Grade 6" value={count('completer')} meta="Not placed: elementary school done" accent={1} />
              <StatTile label="Waiting on an outcome" value={count('no_outcome', 'not_approved', 'remedial')} meta="Remedial, or not approved yet" accent={2} />
              <StatTile label="Already enrolled" value={count('already_enrolled')} meta={`in ${yearLabel(preview.target_year.start_year)}`} accent={3} />
            </div>
            {count('no_section') ? <Callout tone="attention" title="Some grades have no section next year">{count('no_section')} {count('no_section') === 1 ? 'learner has' : 'learners have'} nowhere to go yet. Add the missing sections for {yearLabel(preview.target_year.start_year)} and they are drawn in.</Callout> : null}
            <div className="card">
            <div className="card-head"><h2>Sections next year</h2></div>
            <Table
              rows={preview.sections}
              rowKey={s => s.id}
              empty={<EmptyState title="No sections next year" body={`Add the ${yearLabel(preview.target_year.start_year)} sections on School years & sections.`} />}
              columns={[
                { header: 'Section', cell: s => <Cell title={`${gradeName(s.grade_level)} · ${s.name}`} meta={s.adviser_name ?? 'No adviser yet'} /> },
                { header: 'Already in it', cell: s => <span className="mono">{s.enrolled.male} M · {s.enrolled.female} F</span> },
                { header: 'Drawn into it', cell: s => <span className="mono">{s.placed.male} M · {s.placed.female} F</span> },
                { header: 'Total', cell: s => <b className="mono">{s.enrolled.male + s.enrolled.female + s.placed.male + s.placed.female}</b> },
              ]}
            />
            </div>
            {preview.placements.length ? (
              <div className="card">
                <div className="card-head">
                  <h2>Learners drawn</h2>
                  <div className="card-head-actions field">
                    <label className="label" htmlFor={`${id}-section`}>Section</label>
                    <Select id={`${id}-section`} value={section} onChange={e => setSection(e.target.value)}>
                      <option value="">Every section</option>
                      {preview.sections.filter(s => s.placed.male + s.placed.female).map(s => <option key={s.id} value={s.id}>{gradeName(s.grade_level)} · {s.name}</option>)}
                    </Select>
                  </div>
                </div>
                <Table
                  rows={shown}
                  rowKey={p => p.enrollment_id}
                  columns={[
                    { header: 'Learner', cell: p => <Cell title={learnerName(p)} meta={p.sex === 'male' ? 'Male' : 'Female'} /> },
                    { header: 'This year', cell: p => `${gradeName(p.from_grade)} · ${p.from_section}` },
                    { header: 'Outcome', cell: p => (p.action ? <Badge tone={p.action === 'retained' ? 'info' : 'good'}>{outcomeWord[p.action]}</Badge> : null) },
                    { header: 'Next year', cell: p => { const s = sectionOf.get(p.section_id); return s ? `${gradeName(s.grade_level)} · ${s.name}` : ''; } },
                  ]}
                />
              </div>
            ) : null}
            {preview.unplaced.length ? (
              <div className="card">
                <div className="card-head"><h2>Not placed</h2></div>
                <Table
                  rows={preview.unplaced}
                  rowKey={u => u.enrollment_id}
                  columns={[
                    { header: 'Learner', cell: u => <Cell title={learnerName(u)} meta={u.sex === 'male' ? 'Male' : 'Female'} /> },
                    { header: 'This year', cell: u => `${gradeName(u.from_grade)} · ${u.from_section}` },
                    { header: 'Why', cell: u => <span className={u.reason === 'completer' || u.reason === 'already_enrolled' ? 'muted' : ''}>{why(u)}</span> },
                  ]}
                />
              </div>
            ) : null}
            {preview.runs.length ? (
              <div className="card">
                <div className="card-head"><h2>Enrolled from this screen before</h2></div>
                <Table
                  rows={preview.runs}
                  rowKey={r => r.id}
                  columns={[
                    { header: 'When', cell: r => <Cell title={new Date(r.recorded_at).toLocaleString()} meta={r.actor_name ?? undefined} /> },
                    { header: 'Grade', cell: r => (r.grade_level === null ? 'Every grade' : gradeName(r.grade_level)) },
                    { header: 'Draw number', cell: r => <span className="mono">{r.seed}</span> },
                    { header: 'Enrolled', cell: r => r.placed },
                    { header: 'Reason', cell: r => <span className="note-text">{r.reason}</span> },
                  ]}
                />
              </div>
            ) : null}
          </>
      ) : null}
      {enrolling && preview ? <EnrolSheet api={api} preview={preview} onClose={() => setEnrolling(false)}
        onChanged={() => { setPreview(null); setStale(true); setTick(t => t + 1); }}
        onDone={placed => { setEnrolling(false); setTick(t => t + 1); setStatus({ kind: 'done', text: `${placed} ${placed === 1 ? 'learner' : 'learners'} enrolled in ${yearLabel(preview.target_year.start_year)}.` }); }} /> : null}
      {preview ? (
        <PrintCopy printing={printing} onPrinted={() => setPrinting(false)} long>
          <SeededNotice me={me} />
          {preview.sections.filter(s => s.placed.male + s.placed.female).map(s => {
            const list = preview.placements.filter(p => p.section_id === s.id);
            return (
              <div className="paper" key={s.id}>
                <h2>{gradeName(s.grade_level)} · {s.name}</h2>
                <p className="paper-sub">School Year {yearLabel(preview.target_year.start_year)} · Adviser {s.adviser_name ?? ''} · Draw number {preview.seed}</p>
                <table className="paper-grid card-table">
                  <thead><tr><th>No.</th><th>Learner</th><th>Sex</th><th>{yearLabel(preview.source_year.start_year)}</th><th>Outcome</th></tr></thead>
                  <tbody>{list.map((p, i) => (
                    <tr key={p.enrollment_id}><td className="numeric">{i + 1}</td><td>{learnerName(p)}</td><td>{p.sex === 'male' ? 'M' : 'F'}</td>
                      <td>{gradeName(p.from_grade)} · {p.from_section}</td><td>{p.action ? outcomeWord[p.action] : ''}</td></tr>
                  ))}</tbody>
                </table>
                <p className="print-foot">{s.enrolled.male + s.enrolled.female ? `Also in this section already: ${s.enrolled.male} male, ${s.enrolled.female} female. ` : ''}Printed {localToday()} from EDUNEXUS, before enrolment. Sections drawn at random from the approved outcomes; the draw decides no outcome.</p>
              </div>
            );
          })}
        </PrintCopy>
      ) : null}
    </>
  );
}

/** The one write: every learner drawn, enrolled together, with a reason, from exactly the preview on screen. */
function EnrolSheet({ api, preview, onClose, onChanged, onDone }: { api: Api; preview: Preview; onClose: () => void; onChanged: () => void; onDone: (placed: number) => void }) {
  const [reason, setReason] = useState(`Next year’s classes from the approved ${yearLabel(preview.source_year.start_year)} outcomes, draw number ${preview.seed}.`);
  const [status, setLocal] = useState<Status>(idle);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const go = async (event: FormEvent) => {
    event.preventDefault();
    const text = reason.replace(/\s+/g, ' ').trim();
    if (text.length < 10) { setLocal({ kind: 'error', text: 'Give a reason of at least 10 characters.' }); return; }
    setBusy(true);
    try {
      const done = await api<{ placed: number }>(`/academic-years/${preview.source_year.id}/next-year-classes`, 'POST',
        { target_year_id: preview.target_year.id, seed: preview.seed, grade_level: preview.grade_level, review_hash: preview.review_hash, reason: text });
      onDone(done.placed);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PLACEMENT_CHANGED') { onChanged(); onClose(); return; }
      setLocal({ kind: 'error', text: message(error) });
    } finally { setBusy(false); }
  };
  const into = preview.sections.filter(s => s.placed.male + s.placed.female);
  return (
    <Sheet title={`Enrol ${preview.placements.length} ${preview.placements.length === 1 ? 'learner' : 'learners'} in ${yearLabel(preview.target_year.start_year)}`}
      note={`All of them or none, from ${preview.target_year.starts_on}, into the sections drawn with number ${preview.seed}.`} onClose={onClose}>
      <StatusLine status={status} />
      <Callout tone="info">A learner can be moved to another section afterwards on <b>Enrollment</b>, like any section change. If anything changed since this preview was drawn, nothing is enrolled and the preview is drawn again.</Callout>
      <form onSubmit={go}>
        <Table rows={into} rowKey={s => s.id} columns={[
          { header: 'Section', cell: s => `${gradeName(s.grade_level)} · ${s.name}` },
          { header: 'Enrolled into it', cell: s => <span className="mono">{s.placed.male} M · {s.placed.female} F</span> },
        ]} />
        <div className="form-grid">
          <div className="field wide">
            <label className="label" htmlFor={`${id}-reason`}>Reason</label>
            <textarea id={`${id}-reason`} required minLength={10} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Enrolling…' : `Enrol ${preview.placements.length}`}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Sheet>
  );
}
