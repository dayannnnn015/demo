import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Api, Page } from '../api';
import { ApiError, message, query } from '../api';
import type { Route } from '../routes';
import { clamp, shift, weekday } from '../dates';
import { Icon } from '../components/icons';
import { Sheet } from '../components/overlay';
import { ScopePickers, useScope } from '../components/scope';
import {
  Badge, Callout, Cell, EmptyState, PageHeader, PrintButton, StatusLine, Table, TableSkeleton,
  Unrecorded, byLearnerName, idle, learnerName, localToday, type Status,
} from '../components/primitives';

type Props = { api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number; route: Route };

type Mode = 'classroom' | 'alternative_delivery' | 'no_class' | 'suspended';
export type Mark = 'present' | 'absent' | null;
type Part = 'am' | 'pm';
type Schedule = { day_on: string; source: 'school' | 'section' | 'unconfigured'; configured: boolean; am: Mode | null; pm: Mode | null; day_type: string | null; label: string | null };
type Pair = { am: Mark; pm: Mark };
type Learner = Pair & {
  enrollment_id: string; enrollment_version: number; learner_id: string; recorded_learner_id: string;
  first_name: string; middle_name: string | null; last_name: string; name_extension: string | null;
};
type Context = {
  section: { id: string; grade_level: number; name: string };
  school_year: { id: string; starts_on: string; ends_on: string; status: 'draft' | 'active' | 'closed' };
  day_on: string; version: number; calendar_version: number;
  visibility: 'full_historical_roster' | 'current_access_only';
  month_status?: 'draft' | 'submitted' | 'locked'; month_version?: number;
  schedule: Schedule;
};
type SheetData = Context & { recording_available: boolean; items: Learner[]; pagination: { limit: number; next_after_id: string | null } };
type Change = { enrollment_id: string; am: Mark; pm: Mark };
type Proposal = { day_on: string; version: number; changes: Change[]; reason: string };
type Plan = Context & {
  changes: (Change & { first_name: string; last_name: string; before: Pair; after: Pair; changed: boolean })[];
  changed_count: number; review_hash: string;
};
type Event = {
  id: string; attendance_version: number; reason: string; recorded_at: string;
  review_snapshot: { day_on: string; changed_count: number; changes: { enrollment_id: string; first_name: string; last_name: string; before: Pair; after: Pair; changed: boolean }[] };
};

const marks: [Mark, string][] = [['present', 'Present'], ['absent', 'Absent'], [null, 'Not marked']];
const markName = (mark: Mark) => marks.find(([key]) => key === mark)?.[1] ?? 'Not marked';

/** Why a session cannot take a classroom mark, in the school's own words. */
export const sessionBlock = (schedule: Schedule, part: Part): string | null => {
  const mode = schedule[part];
  if (!schedule.configured || !mode) return 'Not configured';
  if (mode === 'classroom') return null;
  return mode === 'no_class' ? 'No class' : mode === 'suspended' ? 'Suspended' : 'Alternative delivery';
};

/**
 * A recorded mark, or the mark that says nobody has said yet.
 *
 * An unmarked session is the case this whole module exists to preserve: it is
 * unknown, never zero and never "present". So it is drawn rather than blanked,
 * exactly as an unconfigured calendar date is.
 */
export function MarkValue({ mark }: { mark: Mark }) {
  if (mark === 'present') return <Badge tone="good">Present</Badge>;
  if (mark === 'absent') return <Badge tone="attention">Absent</Badge>;
  return <Unrecorded label="Not marked" />;
}

/** Before and after for one learner, as the review panel reads them across a row. */
export function PairValue({ value }: { value: Pair }) {
  return <>{markName(value.am)} · {markName(value.pm)}</>;
}

/**
 * The control an adviser uses thirty-odd times, twice a day.
 *
 * Three radios rather than a select: marking a class is the one task in this
 * system done at speed against a paper list, and a select costs two
 * interactions per session where a chip costs one. Clearing back to unknown is
 * one of the three, because a mark recorded by mistake has to be removable
 * without inventing a value in its place — the API clears a mark with an
 * explicit null, and this is where that null comes from.
 */
function MarkChoice({ name, legend, value, onChange }: {
  name: string; legend: string; value: Mark; onChange: (mark: Mark) => void;
}) {
  return (
    <>
      <fieldset className="marks">
        <legend className="sr-only">{legend}</legend>
        {marks.map(([key, text]) => (
          <label key={key ?? 'none'} className="mark">
            <input
              type="radio"
              name={name}
              value={key ?? ''}
              checked={value === key}
              onChange={() => onChange(key)}
            />
            <span className={`mark-chip ${key ?? 'none'}`}>{text}</span>
          </label>
        ))}
      </fieldset>
      {/* The register is carried to a classroom on paper, and a printed radio
          is an empty circle. The chosen value prints as its own word. */}
      <span className="mark-print">{markName(value)}</span>
    </>
  );
}

/**
 * The learners whose marks have actually moved, as the API wants them.
 *
 * Both sessions travel together. A change *replaces* a learner's AM/PM pair
 * rather than patching one half of it, so the session nobody touched is sent
 * back unchanged — leaving it out would clear it. A learner marked and then
 * put back exactly as they were is not a change at all, and is dropped here
 * rather than being sent for the API to refuse as a no-op.
 */
export function pending(items: (Pair & { enrollment_id: string })[], draft: Record<string, Pair>): Change[] {
  const out: Change[] = [];
  for (const row of items) {
    const next = draft[row.enrollment_id];
    if (!next || (next.am === row.am && next.pm === row.pm)) continue;
    out.push({ enrollment_id: row.enrollment_id, am: next.am, pm: next.pm });
  }
  return out;
}

/**
 * Preview, read, then confirm with the hash the preview returned, so what is
 * committed is what somebody looked at. A 409 throws the hash away and sends
 * the adviser back to the sheet: it is never replayed against whatever is
 * there now, because the version it was built on has moved.
 */
function ReviewSheet({ api, sectionId, dayOn, version, changes, onClose, onDone }: {
  api: Api; sectionId: string; dayOn: string; version: number; changes: Change[];
  onClose: () => void; onDone: (text: string) => void;
}) {
  const [status, setStatus] = useState<Status>(idle);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState<Proposal | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  const review = async (event: FormEvent) => {
    event.preventDefault();
    // The API's reason is a single line; a textarea can hold newlines, and a
    // pasted one would be refused for a formatting rule nobody was shown.
    const body: Proposal = { day_on: dayOn, version, changes, reason: reason.trim().replace(/\s+/g, ' ') };
    setBusy(true);
    setStatus({ text: 'Reviewing…', kind: 'busy' });
    try {
      const result = await api<Plan>(`/sections/${sectionId}/attendance/preview`, 'POST', body);
      setSent(body);
      setPlan(result);
      setStatus(idle);
    } catch (error) { setStatus({ text: message(error), kind: 'error' }); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!sent || !plan) return;
    setBusy(true);
    setStatus({ text: 'Recording…', kind: 'busy' });
    try {
      await api(`/sections/${sectionId}/attendance/corrections`, 'POST', { ...sent, review_hash: plan.review_hash, reviewed: true });
      onDone(`${plan.changed_count} ${plan.changed_count === 1 ? 'learner' : 'learners'} updated.`);
    } catch (error) {
      if (error instanceof ApiError && error.isConflict) { setPlan(null); setSent(null); }
      setStatus({ text: message(error), kind: 'error' });
    } finally { setBusy(false); }
  };

  const count = `${changes.length} ${changes.length === 1 ? 'learner' : 'learners'}`;

  return (
    <Sheet
      title="Review these marks"
      note={`${count} on ${dayOn}. Nothing is recorded until you confirm what the review shows.`}
      wide
      onClose={onClose}
    >
      <StatusLine status={status} />

      {plan ? (
        <>
          <p className="card-note">
            {plan.changed_count} of {plan.changes.length} learners change. A session already holding exactly what you marked is left alone.
          </p>

          <Table
            rows={plan.changes}
            rowKey={row => row.enrollment_id}
            columns={[
              { header: 'Learner', cell: row => learnerName(row) },
              { header: 'Now', cell: row => <PairValue value={row.before} /> },
              { header: 'After', cell: row => <PairValue value={row.after} /> },
              { header: 'Changes', cell: row => (row.changed ? <Badge tone="info">Yes</Badge> : <Badge tone="neutral">No change</Badge>) },
            ]}
          />

          <div className="form-actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Recording…' : 'Confirm this review'}
            </button>
            <button type="button" className="btn ghost small" disabled={busy} onClick={() => { setPlan(null); setSent(null); setStatus(idle); }}>
              Change something
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={event => void review(event)}>
          <div className="form-grid">
            <div className="field wide">
              <label className="label" htmlFor="att-reason">Reason</label>
              <textarea id="att-reason" required minLength={10} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
              <span className="hint">10–500 characters, kept with the marks for good. Say where they came from: the class register, a correction, a late report.</span>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>{busy ? 'Reviewing…' : `Review ${count}`}</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

/** Manager-only. Every reviewed change to this section and date, newest first. */
function History({ api, sectionId, dayOn }: { api: Api; sectionId: string; dayOn: string }) {
  const [rows, setRows] = useState<Event[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); setRows(null); setCursor(null); }, [sectionId, dayOn]);

  useEffect(() => {
    if (!open) return;
    void api<Page<Event>>(`/sections/${sectionId}/attendance/corrections${query({ day_on: dayOn, limit: 5 })}`)
      .then(page => { setRows(page.items); setCursor(page.pagination?.next_before_version ?? null); })
      .catch(() => { setRows([]); setCursor(null); });
  }, [api, sectionId, dayOn, open]);

  const older = async () => {
    if (cursor === null) return;
    try {
      const page = await api<Page<Event>>(`/sections/${sectionId}/attendance/corrections${query({ day_on: dayOn, limit: 5, before_version: cursor })}`);
      setRows(current => [...(current ?? []), ...page.items]);
      setCursor(page.pagination?.next_before_version ?? null);
    } catch { setCursor(null); }
  };

  if (!open) {
    return (
      <div className="card">
        <div className="card-head"><h2>Change history</h2></div>
        <div className="card-body">
          <p className="muted">Every reviewed change to this date, newest first. Use it to check a save whose response you never saw, before recording it a second time.</p>
          <button type="button" className="btn ghost small" onClick={() => setOpen(true)}><Icon name="activity" size={14} />Show change history</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head"><h2>Change history</h2></div>
      <Table
        loading={rows === null}
        rows={rows ?? []}
        rowKey={row => row.id}
        empty={<EmptyState title="No changes yet" body="Nothing has been recorded against this section on this date." />}
        columns={[
          { header: 'Version', cell: row => <span className="mono">{row.attendance_version}</span> },
          { header: 'Learners changed', cell: row => row.review_snapshot.changed_count, numeric: true },
          { header: 'Recorded', cell: row => <span className="mono">{new Date(row.recorded_at).toLocaleString()}</span> },
        ]}
        detailLabel="Open"
        detail={row => (
          <>
            <p>{row.reason}</p>
            <hr className="rule" />
            <Table
              rows={row.review_snapshot.changes.filter(change => change.changed)}
              rowKey={change => change.enrollment_id}
              empty={<p className="muted">This review changed nothing.</p>}
              columns={[
                { header: 'Learner', cell: change => learnerName(change) },
                { header: 'Was', cell: change => <PairValue value={change.before} /> },
                { header: 'Became', cell: change => <PairValue value={change.after} /> },
              ]}
            />
          </>
        )}
      />
      {cursor !== null ? (
        <div className="card-body"><button type="button" className="btn ghost small" onClick={() => void older()}>Show older changes</button></div>
      ) : null}
    </div>
  );
}

/**
 * One section, one date, both sessions.
 *
 * The register an adviser fills twice a day. Marks are held locally until they
 * are reviewed together, because the API records a batch atomically against one
 * shared sheet version: saving each chip as it is clicked would be thirty
 * writes, thirty version bumps and thirty chances for two staff members to
 * overwrite each other's half of the same class.
 */
export function Attendance({ api, manager, setStatus, reload, token, route }: Props) {
  const group = useId();
  const scope = useScope(api, token);
  const [dayOn, setDayOn] = useState(localToday());
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [extra, setExtra] = useState<Learner[]>([]);
  const [draft, setDraft] = useState<Record<string, Pair>>({});
  const [reviewing, setReviewing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openedBack, setOpenedBack] = useState('');
  const settled = useRef(false);

  const { year, sectionId } = scope;

  // On a weekend or a holiday the register would open on a date nobody can
  // mark. Once per visit, and only while the date is still today, step back to
  // the most recent classroom date in the last two weeks and say so. The
  // calendar is read only when today's own sheet already says it holds no
  // class, because each calendar read is a line in the privacy access log.
  useEffect(() => {
    if (settled.current || !year || !sectionId || !sheet) return;
    settled.current = true;
    const today = localToday();
    if (dayOn !== today || sheet.schedule.am === 'classroom' || sheet.schedule.pm === 'classroom') return;
    const from = clamp(shift(today, -13), String(year.starts_on), today);
    void api<{ days: { day_on: string; am: string | null; pm: string | null }[] }>(`/academic-years/${year.id}/calendar${query({ from, to: today, section_id: sectionId })}`)
      .then(calendar => {
        const classroom = (d: { am: string | null; pm: string | null }) => d.am === 'classroom' || d.pm === 'classroom';
        const todays = calendar.days.find(d => d.day_on === today);
        if (!todays || classroom(todays)) return;
        const last = [...calendar.days].reverse().find(classroom);
        if (!last) return;
        setDayOn(current => (current === today ? last.day_on : current));
        setOpenedBack(today);
      })
      .catch(() => undefined);
  }, [api, year?.id, sectionId, sheet]);

  // Open on a date inside the chosen year, so the first read is never outside it.
  useEffect(() => {
    if (!year) return;
    setDayOn(current => clamp(current, String(year.starts_on), String(year.ends_on)));
  }, [year?.id, year?.starts_on, year?.ends_on]);

  useEffect(() => {
    if (!sectionId || !dayOn) { setSheet(null); return; }
    setSheet(null);
    setExtra([]);
    setDraft({});
    setFailed(false);
    void api<SheetData>(`/sections/${sectionId}/attendance${query({ day_on: dayOn, limit: 100 })}`)
      .then(setSheet)
      .catch(() => { setSheet(null); setFailed(true); });
  }, [api, sectionId, dayOn, token]);

  const more = async () => {
    const cursor = sheet?.pagination.next_after_id;
    if (!cursor) return;
    try {
      const page = await api<SheetData>(`/sections/${sectionId}/attendance${query({ day_on: dayOn, limit: 100, after_id: cursor })}`);
      setExtra(current => [...current, ...page.items]);
      setSheet(current => (current ? { ...current, pagination: page.pagination } : current));
    } catch (error) { setStatus({ text: message(error), kind: 'error' }); }
  };

  if (scope.years === null) return <><PageHeader route={route} /><div className="card"><TableSkeleton columns={4} /></div></>;
  if (!scope.years.length) {
    return (
      <>
        <PageHeader route={route} />
        <div className="card"><EmptyState title="No school year yet" body="Attendance belongs to a school year. Create one on the School years screen first." /></div>
      </>
    );
  }
  if (scope.sections?.length === 0) {
    return (
      <>
        <PageHeader route={route} />
        <div className="card">
          <div className="card-head"><div className="toolbar"><ScopePickers scope={scope} /></div></div>
          <EmptyState
            title={manager ? 'No sections in this year' : 'No section assigned to you'}
            body={manager
              ? 'Create a section on the Sections and advisers screen before recording attendance.'
              : 'You are not the current adviser of any section in this school year. A principal or administrative officer assigns advisers.'}
          />
        </div>
      </>
    );
  }

  const items = [...(sheet?.items ?? []), ...extra].sort(byLearnerName);
  const schedule = sheet?.schedule;
  const editable = sheet?.recording_available === true;
  const today = localToday();

  const pairOf = (row: Learner): Pair => draft[row.enrollment_id] ?? { am: row.am, pm: row.pm };
  const setPart = (row: Learner, part: Part, mark: Mark) =>
    setDraft(current => ({ ...current, [row.enrollment_id]: { ...(current[row.enrollment_id] ?? { am: row.am, pm: row.pm }), [part]: mark } }));

  const changes = pending(items, draft);

  const overBatch = changes.length > 100;

  const closedBecause = (): string | null => {
    if (!sheet || editable) return null;
    if (sheet.school_year.status !== 'active') return `This school year is ${sheet.school_year.status}. Attendance is recorded only in an active year.`;
    if (sheet.day_on > today) return 'This date is in the future. It can be read to prepare, but marks are recorded on or before the day itself.';
    if (sheet.month_status && sheet.month_status !== 'draft') return `This month has been ${sheet.month_status}, which freezes its marks. A principal or administrative officer returns or reopens the month on the Monthly consolidation screen before it can be edited.`;
    if (!schedule?.configured) return 'Nobody has configured this date. It is not a school day, not a holiday and not an absence, and attendance cannot be recorded against it. Set it on the Instructional calendar screen first.';
    return 'Neither session on this date is a classroom session, so no classroom mark can be recorded against it.';
  };

  const blocked = closedBecause();
  const backOn = year && dayOn > String(year.starts_on) ? shift(dayOn, -1) : null;
  const nextOn = year && dayOn < String(year.ends_on) ? shift(dayOn, 1) : null;

  return (
    <>
      <PageHeader
        route={route}
        actions={<>
          {items.length ? <PrintButton label="Print this register" /> : null}
          {editable ? (
            <button type="button" className="btn" disabled={!changes.length || overBatch} onClick={() => setReviewing(true)}>
              <Icon name="check" size={15} />Review {changes.length ? `${changes.length} ` : ''}marks
            </button>
          ) : null}
        </>}
      />

      <div className="card">
        <div className="card-head">
          <div className="toolbar">
            <ScopePickers scope={scope} />
            <div className="field inline">
              <label className="label" htmlFor="att-day">Date</label>
              <span className="month-nav">
                <button type="button" className="btn ghost small" disabled={!backOn} aria-label="Previous day" onClick={() => backOn && setDayOn(backOn)}><Icon name="back" size={14} /></button>
                <input
                  id="att-day"
                  type="date"
                  className="date-input"
                  value={dayOn}
                  min={year ? String(year.starts_on) : undefined}
                  max={year ? String(year.ends_on) : undefined}
                  onChange={event => event.target.value && year && setDayOn(clamp(event.target.value, String(year.starts_on), String(year.ends_on)))}
                />
                <button type="button" className="btn ghost small" disabled={!nextOn} aria-label="Next day" onClick={() => nextOn && setDayOn(nextOn)}><Icon name="forward" size={14} /></button>
              </span>
            </div>
          </div>
          <div className="card-head-actions">
            <Badge tone="neutral">{weekday(dayOn)}</Badge>
            {sheet?.month_status && sheet.month_status !== 'draft' ? <Badge tone="attention">Month {sheet.month_status}</Badge> : null}
            {sheet?.visibility === 'current_access_only' ? <Badge tone="info">Your current learners</Badge> : null}
          </div>
        </div>

        {schedule ? (
          <div className="card-body">
            {openedBack && openedBack !== dayOn ? (
              <p className="card-note">Opened on the last classroom day, because today ({weekday(openedBack)}, <span className="mono">{openedBack}</span>) has no class.</p>
            ) : null}
            <p className="card-note">
              Morning: <b>{sessionBlock(schedule, 'am') ?? 'Classroom'}</b> · Afternoon: <b>{sessionBlock(schedule, 'pm') ?? 'Classroom'}</b>
              {schedule.label ? <> · {schedule.label}</> : null}
            </p>
          </div>
        ) : null}

        {blocked ? <div className="card-body"><Callout tone="attention" title="Marks cannot be recorded here">{blocked}</Callout></div> : null}
        {overBatch ? <div className="card-body"><Callout tone="stopped" title="Too many at once">{changes.length} learners are marked for review and the API records at most 100 in one batch. Review some of them first.</Callout></div> : null}
        {failed ? <div className="card-body"><Callout tone="stopped" title="This sheet could not be read">The section or date is outside what you can open, or the request failed. Check which school year the date belongs to.</Callout></div> : null}

        <Table
          stack
          loading={sheet === null && !failed}
          rows={items}
          rowKey={row => row.enrollment_id}
          empty={<EmptyState
            title="No learners on this date"
            body="Nobody was enrolled in this section on this date, so there is nothing to mark. A learner appears here from the effective date of their enrolment or transfer in."
          />}
          columns={[
            { header: 'Learner', cell: row => <Cell title={learnerName(row)} /> },
            {
              header: 'Morning',
              cell: row => {
                const stop = schedule ? sessionBlock(schedule, 'am') : 'Not configured';
                if (stop && row.am === null) return <Unrecorded label={stop} />;
                if (!editable || stop) return <MarkValue mark={pairOf(row).am} />;
                return <MarkChoice name={`${group}-am-${row.enrollment_id}`} legend={`Morning, ${learnerName(row)}`} value={pairOf(row).am} onChange={mark => setPart(row, 'am', mark)} />;
              },
            },
            {
              header: 'Afternoon',
              cell: row => {
                const stop = schedule ? sessionBlock(schedule, 'pm') : 'Not configured';
                if (stop && row.pm === null) return <Unrecorded label={stop} />;
                if (!editable || stop) return <MarkValue mark={pairOf(row).pm} />;
                return <MarkChoice name={`${group}-pm-${row.enrollment_id}`} legend={`Afternoon, ${learnerName(row)}`} value={pairOf(row).pm} onChange={mark => setPart(row, 'pm', mark)} />;
              },
            },
          ]}
        />

        {sheet ? (
          <div className="card-body">
            <p className="card-note">
              {items.length} {items.length === 1 ? 'learner' : 'learners'} on this date · sheet version <span className="mono">{sheet.version}</span>
              {changes.length ? <> · {changes.length} marked, not yet recorded </> : null}
              {changes.length ? <button type="button" className="btn ghost small" onClick={() => setDraft({})}>Undo my marks</button> : null}
            </p>
            {sheet.pagination.next_after_id ? (
              <button type="button" className="btn ghost small" onClick={() => void more()}>Show more learners</button>
            ) : null}
            {sheet.visibility === 'current_access_only' ? (
              <p className="muted">This is your current class list, not a historical report: a learner who has since transferred out is not shown here even if they were marked on this date. A principal or administrative officer sees the full dated roster.</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {manager && sectionId ? <History api={api} sectionId={sectionId} dayOn={dayOn} /> : null}

      <Callout tone="info" title="An unmarked session stays unknown">
        A session nobody has marked is not an absence and not a presence: it is unrecorded, and it is drawn that way. Nothing here is counted into a school day, a percentage or an SF2 total. The school&apos;s approved mark meanings and half-day rules have not been supplied, so EDUNEXUS records what was observed and computes nothing from it.
      </Callout>

      {reviewing && sheet ? (
        <ReviewSheet
          api={api}
          sectionId={sectionId}
          dayOn={dayOn}
          version={sheet.version}
          changes={changes}
          onClose={() => setReviewing(false)}
          onDone={text => { setReviewing(false); setDraft({}); setStatus({ text, kind: 'done' }); reload(); }}
        />
      ) : null}
    </>
  );
}
