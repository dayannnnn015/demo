import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { message, query } from '../api';
import type { Route } from '../routes';
import { Icon } from '../components/icons';
import { Sheet } from '../components/overlay';
import { PlacementSheet, RecordHistory, RecordSheet, ReviewActions, TimelineHistory, TimelineSheet } from './Reviews';
import {
  Badge, Callout, Cell, Editor, EmptyState, Finder, PageHeader, PrintButton, Select, StatusLine, Table,
  TableSkeleton, Task, Unrecorded, gradeName, idle, learnerName, sentence, value, yearName, type Status,
} from '../components/primitives';
import { Affects } from '../components/affects';

type Props = { api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number; route: Route };

const exitReasons: [string, string][] = [
  ['transfer_out', 'Transferred to another school'],
  ['withdrawal', 'Withdrawn by the family'],
  ['dropout', 'Stopped attending'],
  ['death', 'Death'],
];

/** The LRN on a learner record, or the mark that says none has been issued. */
const lrnOf = (learner: Row | undefined) =>
  !learner ? null : learner.lrn ? `LRN ${String(learner.lrn)}` : <Unrecorded label="LRN missing" />;

/**
 * A movement is a dated event, and which fields it needs depends on the action,
 * so this cannot use the generic editor. Withdrawal records a reason and no
 * section; reassignment and re-entry record a section and no reason.
 */
function MovementForm({ api, enrollment, sections, setStatus, reload }: {
  api: Api; enrollment: Row; sections: Row[]; setStatus: (s: Status) => void; reload: () => void;
}) {
  const withdrawn = enrollment.status === 'withdrawn';
  const [action, setAction] = useState(withdrawn ? 'reentered' : 'reassigned');
  const [on, setOn] = useState('');
  const [section, setSection] = useState(String(enrollment.section_id));
  const [reason, setReason] = useState('transfer_out');
  const [busy, setBusy] = useState(false);

  // Same grade, same year: the API rejects anything else, so do not offer it.
  const choices = sections.filter(s => s.academic_year_id === enrollment.academic_year_id && Number(s.grade_level) === Number(enrollment.grade_level));
  const actions: [string, string][] = withdrawn
    ? [['reentered', 'Re-enter this learner']]
    : [['reassigned', 'Move to another section'], ['withdrawn', 'Withdraw from school']];

  return (
    <form onSubmit={async event => {
      event.preventDefault();
      setBusy(true);
      setStatus({ text: 'Recording…', kind: 'busy' });
      try {
        await api(`/enrollments/${enrollment.id}/movements`, 'POST', {
          version: enrollment.version,
          action,
          effective_on: on,
          section_id: action === 'withdrawn' ? null : section,
          exit_reason: action === 'withdrawn' ? reason : null,
        });
        setStatus({ text: 'Movement recorded.', kind: 'done' });
        reload();
      } catch (error) { setStatus({ text: message(error), kind: 'error' }); }
      finally { setBusy(false); }
    }}>
      <Affects what="movement" />
      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor={`act-${enrollment.id}`}>What happened</label>
          <Select id={`act-${enrollment.id}`} value={action} onChange={e => setAction(e.target.value)}>
            {actions.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </Select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`on-${enrollment.id}`}>First day of the new state</label>
          <input id={`on-${enrollment.id}`} type="date" required value={on} onChange={e => setOn(e.target.value)} />
          <span className="hint">The previous state applies up to the day before. Cannot be a future date.</span>
        </div>
        {action === 'withdrawn' ? (
          <div className="field">
            <label className="label" htmlFor={`why-${enrollment.id}`}>Reason</label>
            <Select id={`why-${enrollment.id}`} value={reason} onChange={e => setReason(e.target.value)}>
              {exitReasons.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </Select>
            <span className="hint">A recorded staff decision, not something worked out from attendance.</span>
          </div>
        ) : (
          <div className="field">
            <label className="label" htmlFor={`sec-${enrollment.id}`}>Section</label>
            <Select id={`sec-${enrollment.id}`} value={section} onChange={e => setSection(e.target.value)}>
              {choices.map(s => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
            </Select>
            <span className="hint">Same grade and school year. Promotion is a separate workflow.</span>
          </div>
        )}
      </div>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={busy} aria-busy={busy}>{busy ? 'Recording…' : 'Record movement'}</button>
      </div>
    </form>
  );
}

/** The movements as they were first recorded. A correction supersedes them without rewriting them. */
function History({ api, enrollment }: { api: Api; enrollment: Row }) {
  const [rows, setRows] = useState<Page | null>(null);
  useEffect(() => {
    void api<Page>(`/enrollments/${enrollment.id}/history${query({ limit: 50 })}`).then(setRows).catch(() => setRows({ items: [] }));
  }, [api, enrollment.id]);
  return (
    <Table
      loading={rows === null}
      rows={rows?.items ?? []}
      rowKey={r => String(r.id)}
      empty={<p className="muted">No movements recorded.</p>}
      columns={[
        { header: 'Effective', cell: r => <span className="mono">{value(r, 'effective_on')}</span> },
        { header: 'What', cell: r => sentence(value(r, 'reason') || value(r, 'action')) },
        { header: 'Recorded', cell: r => new Date(String(r.recorded_at ?? r.created_at)).toLocaleDateString() },
      ]}
    />
  );
}

/**
 * Finding a learner and enrolling them is two steps, so it gets a panel of its
 * own rather than a permanent second form under the class list. The registry
 * search happens here, deliberately, and writes its own access-log row: this
 * is the one place in the workspace where naming learners is the task.
 */
function EnrolSheet({ api, sectionId, sectionLabel, reload, onClose, onDone }: {
  api: Api;
  sectionId: string;
  sectionLabel: string;
  reload: () => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<Status>(idle);
  const [found, setFound] = useState<Row[] | null>(null);
  const [chosen, setChosen] = useState<Row | null>(null);

  return (
    <Sheet title="Enrol a learner" note={`Into ${sectionLabel}. Search the registry, then set the first day in this section.`} wide onClose={onClose}>
      <StatusLine status={status} />

      {chosen ? (
        <>
          <dl className="facts">
            <div><dt>Learner</dt><dd>{learnerName(chosen)}</dd></div>
            <div><dt>Reference number</dt><dd>{lrnOf(chosen)}</dd></div>
          </dl>
          <hr className="rule" />
          <Editor
            submitLabel="Enrol this learner"
            setStatus={setStatus}
            onSaved={() => { onDone(); reload(); }}
            fields={[
              { key: 'enrolled_on', label: 'First day in this section', type: 'date', hint: 'Must fall inside the school year and after the learner’s birth date.' },
              { key: 'entry_kind', label: 'Joining as', options: [['regular', 'Regular enrollment'], ['transfer_in', 'Transferred in from another school']] },
            ]}
            onSubmit={data => api('/enrollments', 'POST', { ...data, learner_id: chosen.id, section_id: sectionId })}
            note={<button type="button" className="btn ghost small" onClick={() => setChosen(null)}>Choose someone else</button>}
          />
        </>
      ) : (
        <>
          <Finder
            initial={{ search: '', lrn: '' }}
            onApply={async values => {
              setFound(null);
              try {
                const result = await api<Page>(`/learners${query({ ...values, limit: 25 })}`);
                setFound(result.items);
              } catch (error) { setStatus({ text: message(error), kind: 'error' }); setFound([]); }
            }}
            onClear={() => setFound(null)}
            fields={[
              { key: 'search', label: 'Name or LRN', optional: true, minLength: 2, maxLength: 100, hint: 'At least two characters.' },
              { key: 'lrn', label: 'Exact LRN', optional: true, pattern: '[0-9 -]{12,20}', maxLength: 20 },
            ]}
          />
          <hr className="rule" />
          {found === null
            ? <p className="muted">Search the registry to find the learner. Nothing is read until you do.</p>
            : <Table
                rows={found}
                rowKey={r => String(r.id)}
                empty={<EmptyState title="No learner found" body="Check the spelling, or register the learner first on the Learner registry screen." />}
                columns={[
                  { header: 'Learner', cell: r => <Cell title={learnerName(r)} meta={lrnOf(r)} /> },
                  { header: 'Birth date', cell: r => <span className="mono">{value(r, 'birth_date')}</span> },
                  { header: '', cell: r => <button type="button" className="btn secondary small" onClick={() => setChosen(r)}>Choose</button> },
                ]}
              />}
        </>
      )}
    </Sheet>
  );
}

type Review = 'timeline' | 'placement' | 'void' | 'restore';

/**
 * Everything a manager can do to one annual record: record a real movement,
 * or correct what was recorded — its dated history, its grade, or whether it
 * counts at all. The histories sit underneath, because a lost response is
 * checked there before anything is tried twice.
 */
function RecordPanel({ api, row, closed, sections, sectionName, name, setStatus, reload }: {
  api: Api; row: Row; closed: boolean; sections: Row[]; sectionName: (id: string) => string; name: string;
  setStatus: (s: Status) => void; reload: () => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const voided = row.record_state === 'voided';
  const done = (text: string) => { setReview(null); setStatus({ text, kind: 'done' }); reload(); };
  return (
    <>
      {voided ? (
        <Callout tone="attention" title="This record is voided">
          It does not count, and it is kept only as evidence: no movement or correction can be recorded against it until it is restored.
        </Callout>
      ) : null}
      {closed ? <p className="muted">A closed school year cannot take further movements or corrections. Its histories are below.</p> : null}
      {!voided && !closed ? <MovementForm api={api} enrollment={row} sections={sections} setStatus={setStatus} reload={reload} /> : null}
      {!closed ? (
        <ReviewActions>
          {voided ? <button type="button" className="btn secondary" onClick={() => setReview('restore')}>Restore this enrollment</button> : (
            <>
              <button type="button" className="btn secondary" onClick={() => setReview('timeline')}>Correct the timeline</button>
              <button type="button" className="btn secondary" onClick={() => setReview('placement')}>Correct the grade</button>
              <button type="button" className="btn secondary" onClick={() => setReview('void')}>Void this enrollment</button>
            </>
          )}
        </ReviewActions>
      ) : null}
      <hr className="rule" />
      <Task title="Movements as first recorded" note="Never rewritten"><History api={api} enrollment={row} /></Task>
      <Task title="Corrections" note="Timeline and grade, newest first"><TimelineHistory api={api} enrollmentId={String(row.id)} sectionName={sectionName} /></Task>
      <Task title="Void and restore reviews" note="Newest first"><RecordHistory api={api} enrollmentId={String(row.id)} /></Task>

      {review === 'timeline' ? <TimelineSheet api={api} enrollment={row} sections={sections} sectionName={sectionName} onClose={() => setReview(null)} onDone={done} /> : null}
      {review === 'placement' ? <PlacementSheet api={api} enrollment={row} sections={sections} sectionName={sectionName} onClose={() => setReview(null)} onDone={done} /> : null}
      {review === 'void' || review === 'restore' ? <RecordSheet api={api} enrollment={row} action={review} learnerName={name} onClose={() => setReview(null)} onDone={done} /> : null}
    </>
  );
}

export function Enrollment({ api, manager, setStatus, reload, token, route }: Props) {
  const [years, setYears] = useState<Row[] | null>(null);
  const [yearId, setYearId] = useState('');
  const [sections, setSections] = useState<Row[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [rows, setRows] = useState<Page | null>(null);
  const [learners, setLearners] = useState<Record<string, Row>>({});
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    void api<Page>('/academic-years').then(r => {
      setYears(r.items);
      setYearId(current => (r.items.some(y => y.id === current) ? current : String((r.items.find(y => y.status === 'active') ?? r.items[0])?.id ?? '')));
    }).catch(() => setYears([]));
  }, [api, token]);

  useEffect(() => {
    if (!yearId) return;
    void api<Page>(`/sections${query({ academic_year_id: yearId, limit: 100 })}`).then(r => {
      setSections(r.items);
      setSectionId(current => (r.items.some(s => s.id === current) ? current : String(r.items[0]?.id ?? '')));
    }).catch(() => setSections([]));
  }, [api, yearId, token]);

  useEffect(() => {
    if (!sectionId) { setRows({ items: [] }); return; }
    setRows(null);
    void api<Page>(`/enrollments${query({ section_id: sectionId, limit: 100, record_state: manager ? 'all' : undefined })}`)
      .then(result => {
        setRows(result);
        // Each row carries its learner's name and LRN, logged with the list in
        // one access row. Reading every learner separately wrote one row per
        // learner each time a class list opened.
        setLearners(current => {
          const next = { ...current };
          for (const row of result.items) if (row.learner) next[String(row.learner_id)] = row.learner as Row;
          return next;
        });
      })
      .catch(() => setRows({ items: [] }));
  }, [api, sectionId, manager, token]);

  if (years === null) return <><PageHeader route={route} /><div className="card"><TableSkeleton columns={5} /></div></>;
  if (!years.length) {
    return (
      <>
        <PageHeader route={route} />
        <div className="card"><EmptyState title="No school year yet" body="Enrollment belongs to a school year. Create one from the School years screen first." /></div>
      </>
    );
  }

  const year = years.find(y => y.id === yearId);
  const section = sections.find(s => s.id === sectionId);
  const closed = year?.status === 'closed';
  const label = section ? `${gradeName(section.grade_level)} · ${String(section.name)}` : 'this section';
  const named = (row: Row) => { const learner = learners[String(row.learner_id)]; return learner ? learnerName(learner) : 'This learner'; };
  const sectionName = (id: string) => String(sections.find(s => s.id === id)?.name ?? 'a section outside this year');
  const listed = rows?.items.length ?? 0;

  return (
    <>
      <PageHeader
        route={route}
        actions={<>
          {listed ? <PrintButton label="Print class list" /> : null}
          {manager && !closed && section
            ? <button type="button" className="btn" onClick={() => setEnrolling(true)}><Icon name="plus" size={15} />Enrol a learner</button>
            : null}
        </>}
      />

      <div className="card">
        <div className="card-head">
          <div className="toolbar">
            <div className="field inline">
              <label className="label" htmlFor="enrol-year">School year</label>
              <Select id="enrol-year" value={yearId} onChange={e => setYearId(e.target.value)}>
                {years.map(y => <option key={String(y.id)} value={String(y.id)}>{yearName(y)} — {sentence(String(y.status))}</option>)}
              </Select>
            </div>
            <div className="field inline">
              <label className="label" htmlFor="enrol-section">Section</label>
              <Select id="enrol-section" value={sectionId} onChange={e => setSectionId(e.target.value)}>
                {sections.length
                  ? sections.map(s => <option key={String(s.id)} value={String(s.id)}>{gradeName(s.grade_level)} · {String(s.name)}</option>)
                  : <option value="">No sections in this year</option>}
              </Select>
            </div>
          </div>
          <div className="card-head-actions">
            {closed ? <Badge tone="neutral">Closed year — read only</Badge> : null}
          </div>
        </div>

        <Table
          loading={rows === null}
          rows={rows?.items ?? []}
          rowKey={r => String(r.id)}
          empty={<EmptyState title="Nobody enrolled here yet" body={closed ? 'This year is closed and its enrollment can no longer change.' : 'Find a learner in the registry and enrol them into this section.'} />}
          columns={[
            { header: 'Learner', cell: r => (learners[String(r.learner_id)] ? <Cell title={named(r)} meta={lrnOf(learners[String(r.learner_id)])} /> : <Unrecorded label="Not readable to you" />) },
            { header: 'Status', cell: r => r.status === 'withdrawn'
              ? <Badge tone="stopped">{sentence(value(r, 'last_reason'))}</Badge>
              : <Badge tone="good">Enrolled</Badge> },
            { header: 'Enrolled', cell: r => <span className="mono">{value(r, 'enrolled_on')}</span> },
            { header: 'Latest change', cell: r => <span className="mono">{value(r, 'effective_on')}</span> },
            { header: 'Record', cell: r => r.record_state === 'voided' ? <Badge tone="stopped">Voided</Badge> : <Badge tone="neutral">Valid</Badge> },
          ]}
          detailLabel="Open"
          actionsLabel="Movement"
          detail={row => {
            if (!manager) return <p className="muted">Only a principal or administrative officer can record movements or corrections.</p>;
            return <RecordPanel api={api} row={row} closed={closed} sections={sections} sectionName={sectionName} name={named(row)} setStatus={setStatus} reload={reload} />;
          }}
        />
      </div>

      {/* This read "Not built — promotion does not exist yet" until 0.87.0. It
          had been untrue since 0033/0034: promotion and next year's classes are
          both built. The distinction it was drawing is the part that still
          matters, so that is what it says now. */}
      <Callout tone="info" title="This is a correction, not a promotion">
        Correcting a grade here fixes a year recorded under the wrong grade; it never moves a learner up.
        Moving a learner into the next grade is an end-of-year outcome, recommended and approved on <a href="#/report-cards">Promotion</a>,
        and then enrolled on <a href="#/next-year">Next year’s classes</a>.
      </Callout>

      {enrolling && section ? (
        <EnrolSheet
          api={api}
          sectionId={sectionId}
          sectionLabel={label}
          reload={reload}
          onClose={() => setEnrolling(false)}
          onDone={() => { setEnrolling(false); setStatus({ text: 'Learner enrolled.', kind: 'done' }); }}
        />
      ) : null}
    </>
  );
}
