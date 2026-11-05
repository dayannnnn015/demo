import { useEffect, useId, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { message, query } from '../api';
import type { Route } from '../routes';
import { clamp } from '../dates';
import { Icon } from '../components/icons';
import { ScopePickers, sectionName, useScope } from '../components/scope';
import { csvProblem, csvStats, rosterFileText, rosterTemplateWorkbook } from '../csv';
import { downloadXlsx } from '../xlsx';
import { LateRowSheet, csvRow } from './LateLearner';
import {
  Badge, Button, Callout, Cell, Editor, EmptyState, PageHeader, Select, StatusLine, Table, TableSkeleton, Task, Unrecorded,
  gradeName, idle, learnerName, localToday, sentence, type Status,
} from '../components/primitives';

type Profile = { lrn: string | null; first_name: string; middle_name: string | null; last_name: string; name_extension: string | null; birth_date: string; sex: 'male' | 'female' };
type Issue = { row: number; field: string; code: string; message: string };
type Checked = { row_count: number; rows: (Profile | null)[]; issues: Issue[] };
export type Submission = {
  id: string; section_id: string; academic_year_id: string; enrolled_on: string; entry_kind: 'regular' | 'transfer_in'; row_count: number;
  status: 'submitted' | 'withdrawn' | 'accepted' | 'declined'; version: number; created_at: string; grade_level: number; section_name: string;
  submitted_by_name: string | null; csv?: string;
};
type Props = { api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number; route: Route };

export const TEMPLATE_HEADER = 'lrn,first_name,middle_name,last_name,name_extension,birth_date,sex';
const reasonField = { key: 'reason', label: 'Reason', type: 'textarea', minLength: 10, maxLength: 500, wide: true, hint: '10–500 characters on one line, kept with the list for good.' };

const statusBadge: Record<Submission['status'], [string, 'info' | 'neutral' | 'good' | 'stopped']> = {
  submitted: ['Waiting for review', 'info'], withdrawn: ['Withdrawn', 'neutral'], accepted: ['Imported', 'good'], declined: ['Declined', 'stopped'],
};
export const StatusBadge = ({ status }: { status: Submission['status'] }) => <Badge tone={statusBadge[status][1]}>{statusBadge[status][0]}</Badge>;
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/**
 * An adviser's own route to a roster import. They check their class list's
 * format, which reads nothing from the registry, and submit it with a reason;
 * a principal or administrative officer then imports it through the reviewed
 * import, where duplicates are resolved, because learner records stay in
 * managers' hands. The adviser follows the list's state here.
 */
export function RosterSubmit({ api, setStatus, token, route }: Props) {
  const id = useId();
  const scope = useScope(api, token);
  const [enrolledOn, setEnrolledOn] = useState('');
  const [kind, setKind] = useState<'regular' | 'transfer_in'>('regular');
  const [csv, setCsv] = useState('');
  const [checked, setChecked] = useState<Checked | null>(null);
  const [status, setLocal] = useState<Status>(idle);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Submission[] | null>(null);
  const [tick, setTick] = useState(0);
  const [late, setLate] = useState(false);
  const { year, section } = scope;

  useEffect(() => { if (year) setEnrolledOn(clamp(localToday(), String(year.starts_on), String(year.ends_on))); }, [year?.id]);
  useEffect(() => { setChecked(null); }, [csv, scope.sectionId, enrolledOn, kind]);
  useEffect(() => {
    void api<Page<Submission>>(`/roster-submissions${query({ status: 'all', limit: 50 })}`).then(r => setMine(r.items)).catch(() => setMine([]));
  }, [api, token, tick]);

  const body = () => ({ section_id: scope.sectionId, enrolled_on: enrolledOn, entry_kind: kind, csv });
  const runCheck = async () => {
    setBusy(true);
    setLocal({ text: 'Checking the list…', kind: 'busy' });
    try {
      const result = await api<Checked>('/roster-submissions/check', 'POST', body());
      setChecked(result);
      setLocal(result.issues.length ? { text: `${result.issues.length} ${result.issues.length === 1 ? 'problem' : 'problems'} to fix. Each is shown beside its row.`, kind: 'error' } : { text: `All ${result.row_count} rows are in order. Give a reason and submit.`, kind: 'done' });
    } catch (error) { setLocal({ text: message(error), kind: 'error' }); }
    finally { setBusy(false); }
  };

  if (scope.years === null) return <><PageHeader route={route} /><div className="card"><TableSkeleton columns={4} /></div></>;
  if (!scope.years.length || scope.sections?.length === 0) {
    return (
      <>
        <PageHeader route={route} />
        <div className="card"><EmptyState title="No section assigned to you" body="You can submit a class list for a section you currently advise. A principal or administrative officer assigns advisers." /></div>
      </>
    );
  }

  const problem = csvProblem(csv);
  const stats = csvStats(csv);
  const waiting = (mine ?? []).some(s => s.section_id === scope.sectionId && s.status === 'submitted');
  const issuesFor = (row: number) => (checked?.issues ?? []).filter(i => i.row === row);

  return (
    <>
      <PageHeader route={route} actions={<button type="button" className="btn secondary" data-tour="roster-template" onClick={() => { void downloadXlsx('edunexus-class-list-template.xlsx', rosterTemplateWorkbook()).catch(error => setStatus({ text: message(error), kind: 'error' })); }}><Icon name="imports" size={15} />Download the template</button>} />
      <Callout tone="info" title="You submit; the office imports">
        Check your class list here and submit it. The principal or administrative officer reviews it against the registry, resolves any learner already on file, and imports it. You will see its state below.
      </Callout>

      {late ? (
        <LateRowSheet onClose={() => setLate(false)} onAdd={row => {
          // A late learner is one more row of the list: the header starts it if the list is empty.
          setCsv(current => `${current.trim() ? current.replace(/\s*$/, '') : TEMPLATE_HEADER}\r\n${csvRow(row)}\r\n`);
          setLate(false);
          setLocal({ text: `${row.last_name}, ${row.first_name} is on your list. Check the list, then submit it.`, kind: 'done' });
        }} />
      ) : null}
      <div className="card">
        <div className="card-head" data-tour="roster-form"><div><h2>Your class list</h2><p className="card-note">One file, up to 50 learners, all joining one section on one date.</p></div></div>
        <div className="card-head">
          <div className="toolbar">
            <ScopePickers scope={scope} />
            <div className="field inline">
              <label className="label" htmlFor={`${id}-on`}>First day in the section</label>
              <input id={`${id}-on`} type="date" className="date-input" value={enrolledOn} min={String(year?.starts_on ?? '')} max={String(year?.ends_on ?? '')} onChange={event => setEnrolledOn(event.target.value)} />
            </div>
            <div className="field inline">
              <label className="label" htmlFor={`${id}-kind`}>Joining as</label>
              <Select id={`${id}-kind`} value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
                <option value="regular">Regular enrollment</option>
                <option value="transfer_in">Transferred in</option>
              </Select>
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="form-grid">
            <div className="field wide">
              <label className="label" htmlFor={`${id}-file`}>CSV file</label>
              <input id={`${id}-file`} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={async event => {
                const file = event.target.files?.[0];
                if (!file) return;
                try { setCsv(await rosterFileText(file)); } catch (error) { setStatus({ text: message(error), kind: 'error' }); }
              }} />
              <span className="hint">The Excel template, or a CSV file. The header must be exactly <span className="mono">{TEMPLATE_HEADER}</span>. every LRN with all twelve digits, since each learner needs one; dates as YYYY-MM-DD; sex as male or female.</span>
            </div>
          </div>
          <Task title="Paste the CSV text instead" note="For a list copied from a text editor">
            <div className="field wide">
              <label className="label" htmlFor={`${id}-text`}>CSV text</label>
              <textarea id={`${id}-text`} className="mono" rows={8} value={csv} onChange={event => setCsv(event.target.value)} />
            </div>
          </Task>
          {csv ? <p className="card-note">{stats.rows} {stats.rows === 1 ? 'row' : 'rows'}, {stats.bytes.toLocaleString()} bytes{problem ? ` — ${problem}` : ''}</p> : null}
          <StatusLine status={status} />
          <div className="form-actions">
            <button type="button" className="btn" disabled={busy || !csv || !!problem || !scope.sectionId} aria-busy={busy} onClick={() => void runCheck()} data-tour="roster-check">{busy ? 'Checking…' : 'Check the list'}</button>
            <button type="button" className="btn secondary" onClick={() => setLate(true)} data-tour="roster-late">Add one late learner</button>
          </div>
        </div>
        {checked ? (
          <Table
            stack
            rows={checked.rows.map((profile, i) => ({ row: i + 1, profile }))}
            rowKey={r => String(r.row)}
            columns={[
              { header: 'Row', cell: r => <span className="mono">{r.row}</span>, numeric: true },
              { header: 'Learner', cell: r => (r.profile ? <Cell title={learnerName(r.profile)} meta={r.profile.lrn ? `LRN ${r.profile.lrn}` : <Unrecorded label="LRN missing" />} /> : <Unrecorded label="Unreadable row" />) },
              { header: 'Birth date', cell: r => (r.profile ? <span className="mono">{r.profile.birth_date}</span> : null) },
              { header: 'Sex', cell: r => (r.profile ? sentence(r.profile.sex) : null) },
              { header: 'Check', cell: r => (issuesFor(r.row).length ? <span className="batch-area">{issuesFor(r.row).map(i => <span key={i.field + i.code} className="batch-note"><Badge tone="stopped">{sentence(i.field.replace(/_/g, ' '))}</Badge> {i.message}</span>)}</span> : <Badge tone="good">In order</Badge>) },
            ]}
          />
        ) : null}
        {checked && !checked.issues.length ? (
          <div className="card-body">
            {waiting ? <Callout tone="attention" title="A list for this section is already waiting">Withdraw it below before submitting another, or wait for the office to decide it.</Callout> : (
              <Editor
                fields={[reasonField]}
                submitLabel={`Submit ${checked.row_count} ${checked.row_count === 1 ? 'learner' : 'learners'} for review`}
                setStatus={setLocal}
                onSubmit={data => api('/roster-submissions', 'POST', { ...body(), reason: data.reason })}
                onSaved={() => { setCsv(''); setChecked(null); setTick(t => t + 1); setStatus({ text: `Class list for ${sectionName(section)} submitted for review.`, kind: 'done' }); }}
              />
            )}
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-head" data-tour="roster-sent"><div><h2>Lists you have submitted</h2><p className="card-note">Newest first.</p></div></div>
        <Table
          loading={mine === null}
          rows={mine ?? []}
          rowKey={s => s.id}
          empty={<EmptyState title="None yet" body="A class list you submit appears here with its state." />}
          columns={[
            { header: 'Section', cell: s => `${gradeName(s.grade_level)} · ${s.section_name}` },
            { header: 'Learners', cell: s => s.row_count, numeric: true },
            { header: 'Submitted', cell: s => <span className="mono">{when(s.created_at)}</span> },
            { header: 'State', cell: s => <StatusBadge status={s.status} /> },
          ]}
          detailLabel="Open"
          detail={s => (s.status !== 'submitted' ? <p className="muted">{s.status === 'accepted' ? 'Imported: the learners are on your register.' : s.status === 'declined' ? 'Declined. Ask the office why, then submit a corrected list.' : 'Withdrawn by you.'}</p> : (
            <Task title="Withdraw this list" note="Kept as a record" tone="warn">
              <Editor fields={[reasonField]} submitLabel="Withdraw" setStatus={setLocal}
                onSubmit={data => api(`/roster-submissions/${s.id}/withdrawal`, 'POST', { version: s.version, reason: data.reason })}
                onSaved={() => { setTick(t => t + 1); setStatus({ text: 'Class list withdrawn.', kind: 'done' }); }} />
            </Task>
          ))}
        />
      </div>
    </>
  );
}

/**
 * The lists advisers have submitted, for a manager. Opening one fills the
 * import above with it; committing that import then accepts the list with the
 * import's receipt. Declining needs a reason the adviser can read.
 */
export function AdviserLists({ api, token, onOpen, setStatus }: { api: Api; token: number; onOpen: (s: Submission) => void; setStatus: (s: Status) => void }) {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [show, setShow] = useState<'submitted' | 'all'>('submitted');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void api<Page<Submission>>(`/roster-submissions${query({ status: show, limit: 50 })}`).then(r => setRows(r.items)).catch(() => setRows([]));
  }, [api, token, show, tick]);
  if (rows && !rows.length && show === 'submitted') return null;
  return (
    <div className="card">
      <div className="card-head">
        <div><h2>Class lists from advisers</h2><p className="card-note">Open one to import it below. Committing that import accepts the list.</p></div>
        <div className="card-head-actions">
          <Select aria-label="Which lists" value={show} onChange={event => setShow(event.target.value as typeof show)}>
            <option value="submitted">Waiting</option>
            <option value="all">All</option>
          </Select>
        </div>
      </div>
      <Table
        loading={rows === null}
        rows={rows ?? []}
        rowKey={s => s.id}
        empty={<EmptyState title="Nothing in this state" body="Lists advisers submit appear here." />}
        columns={[
          { header: 'Section', cell: s => <Cell title={`${gradeName(s.grade_level)} · ${s.section_name}`} meta={s.submitted_by_name ?? 'An adviser'} /> },
          { header: 'Learners', cell: s => s.row_count, numeric: true },
          { header: 'Submitted', cell: s => <span className="mono">{when(s.created_at)}</span> },
          { header: 'State', cell: s => <StatusBadge status={s.status} /> },
        ]}
        detailLabel="Open"
        detail={s => (s.status !== 'submitted' ? <p className="muted">This list has been {statusBadge[s.status][0].toLowerCase()}.</p> : (
          <>
            <div className="form-actions sheet-tools">
              <Button
                label="Open in the import"
                setStatus={setStatus}
                onRun={async () => onOpen(await api<Submission>(`/roster-submissions/${s.id}`))}
              />
            </div>
            <Task title="Decline this list" note="The adviser sees that it was declined" tone="warn">
              <Editor fields={[reasonField]} submitLabel="Decline" setStatus={setStatus}
                onSubmit={data => api(`/roster-submissions/${s.id}/decision`, 'POST', { version: s.version, decision: 'declined', import_id: null, reason: data.reason })}
                onSaved={() => { setTick(t => t + 1); setStatus({ text: 'Class list declined.', kind: 'done' }); }} />
            </Task>
          </>
        ))}
      />
    </div>
  );
}
