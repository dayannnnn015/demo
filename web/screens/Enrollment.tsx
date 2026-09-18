import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { message, query } from '../api';
import {
  Badge, Callout, Editor, EmptyState, Finder, Table,
  gradeName, learnerName, sentence, value, yearName, type Status,
} from '../components/primitives';

type Props = { api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number };

const exitReasons: [string, string][] = [
  ['transfer_out', 'Transferred to another school'],
  ['withdrawal', 'Withdrawn by the family'],
  ['dropout', 'Stopped attending'],
  ['death', 'Death'],
];

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
        setStatus({ text: 'Recorded.', kind: 'done' });
        reload();
      } catch (error) { setStatus({ text: message(error), kind: 'error' }); }
      finally { setBusy(false); }
    }}>
      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor={`act-${enrollment.id}`}>What happened</label>
          <select id={`act-${enrollment.id}`} value={action} onChange={e => setAction(e.target.value)}>
            {actions.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`on-${enrollment.id}`}>First day of the new state</label>
          <input id={`on-${enrollment.id}`} type="date" required value={on} onChange={e => setOn(e.target.value)} />
          <span className="hint">The previous state applies up to the day before. Cannot be a future date.</span>
        </div>
        {action === 'withdrawn' ? (
          <div className="field">
            <label className="label" htmlFor={`why-${enrollment.id}`}>Reason</label>
            <select id={`why-${enrollment.id}`} value={reason} onChange={e => setReason(e.target.value)}>
              {exitReasons.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </select>
            <span className="hint">A recorded staff decision, not something worked out from attendance.</span>
          </div>
        ) : (
          <div className="field">
            <label className="label" htmlFor={`sec-${enrollment.id}`}>Section</label>
            <select id={`sec-${enrollment.id}`} value={section} onChange={e => setSection(e.target.value)}>
              {choices.map(s => <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>)}
            </select>
            <span className="hint">Same grade and school year. Promotion is a separate workflow.</span>
          </div>
        )}
      </div>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Recording…' : 'Record movement'}</button>
      </div>
    </form>
  );
}

function History({ api, enrollment }: { api: Api; enrollment: Row }) {
  const [rows, setRows] = useState<Page | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    void api<Page>(`/enrollments/${enrollment.id}/history${query({ limit: 50 })}`).then(setRows).catch(() => setRows({ items: [] }));
  }, [api, enrollment.id, open]);
  if (!open) return <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>Show movement history</button>;
  return (
    <Table
      loading={rows === null}
      rows={rows?.items ?? []}
      rowKey={r => String(r.id)}
      empty={<p className="muted">No movements recorded.</p>}
      columns={[
        { header: 'Effective', cell: r => value(r, 'effective_on') },
        { header: 'What', cell: r => sentence(value(r, 'reason') || value(r, 'action')) },
        { header: 'Recorded', cell: r => new Date(String(r.recorded_at ?? r.created_at)).toLocaleDateString() },
      ]}
    />
  );
}

export function Enrollment({ api, manager, setStatus, reload, token }: Props) {
  const [years, setYears] = useState<Row[] | null>(null);
  const [yearId, setYearId] = useState('');
  const [sections, setSections] = useState<Row[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [rows, setRows] = useState<Page | null>(null);
  const [learners, setLearners] = useState<Record<string, Row>>({});
  const [found, setFound] = useState<Row[] | null>(null);
  const [enrolling, setEnrolling] = useState<Row | null>(null);

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
      .then(async result => {
        setRows(result);
        // Names live on the learner record, not the enrollment, so resolve the
        // ones on screen and keep them for the rest of the session.
        const missing = [...new Set(result.items.map(r => String(r.learner_id)))].filter(id => !learners[id]);
        if (!missing.length) return;
        const fetched = await Promise.all(missing.map(id => api<Row>(`/learners/${id}`).catch(() => null)));
        setLearners(current => {
          const next = { ...current };
          for (const learner of fetched) if (learner) next[String(learner.id)] = learner;
          return next;
        });
      })
      .catch(() => setRows({ items: [] }));
  }, [api, sectionId, manager, token]);

  if (years === null) return <div className="card"><div className="card-body"><div className="skeleton" /><div className="skeleton" /></div></div>;
  if (!years.length) return <div className="card"><EmptyState title="No school year yet" body="Enrollment belongs to a school year. Create one from the School years screen first." /></div>;

  const year = years.find(y => y.id === yearId);
  const section = sections.find(s => s.id === sectionId);
  const closed = year?.status === 'closed';
  const named = (row: Row) => { const learner = learners[String(row.learner_id)]; return learner ? learnerName(learner) : 'Loading…'; };

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="row">
            <div className="field" style={{ margin: 0, minWidth: 200 }}>
              <label className="label" htmlFor="enrol-year">School year</label>
              <select id="enrol-year" value={yearId} onChange={e => setYearId(e.target.value)}>
                {years.map(y => <option key={String(y.id)} value={String(y.id)}>{yearName(y)} — {String(y.status)}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0, minWidth: 220 }}>
              <label className="label" htmlFor="enrol-section">Section</label>
              <select id="enrol-section" value={sectionId} onChange={e => setSectionId(e.target.value)}>
                {sections.length
                  ? sections.map(s => <option key={String(s.id)} value={String(s.id)}>{gradeName(s.grade_level)} · {String(s.name)}</option>)
                  : <option value="">No sections in this year</option>}
              </select>
            </div>
          </div>
          {closed ? <Badge tone="neutral">Closed year — read only</Badge> : null}
        </div>

        <Table
          loading={rows === null}
          rows={rows?.items ?? []}
          rowKey={r => String(r.id)}
          empty={<EmptyState title="Nobody enrolled here yet" body={closed ? 'This year is closed and its enrollment can no longer change.' : 'Find a learner below and enrol them into this section.'} />}
          columns={[
            { header: 'Learner', cell: named },
            { header: 'LRN', cell: r => { const l = learners[String(r.learner_id)]; return l?.lrn ? <code>{String(l.lrn)}</code> : <Badge tone="attention">Pending</Badge>; } },
            { header: 'Status', cell: r => r.status === 'withdrawn'
              ? <Badge tone="stopped">{sentence(value(r, 'last_reason'))}</Badge>
              : <Badge tone="good">Enrolled</Badge> },
            { header: 'Enrolled', cell: r => value(r, 'enrolled_on') },
            { header: 'Latest change', cell: r => value(r, 'effective_on') },
            { header: 'Record', cell: r => r.record_state === 'voided' ? <Badge tone="stopped">Voided</Badge> : <Badge tone="neutral">Valid</Badge> },
          ]}
          detailLabel="Open"
          actionsLabel="Movement"
          detail={row => {
            if (row.record_state === 'voided') return <p className="muted">This record was voided and is kept only as evidence. Restoring it is a reviewed workflow that has no screen yet.</p>;
            if (closed) return <p className="muted">A closed school year cannot take further movements.</p>;
            if (!manager) return <p className="muted">Only a principal or administrative officer can record movements.</p>;
            return (
              <>
                <MovementForm api={api} enrollment={row} sections={sections} setStatus={setStatus} reload={reload} />
                <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: 'var(--s5) 0' }} />
                <History api={api} enrollment={row} />
              </>
            );
          }}
        />
      </div>

      {manager && !closed && section ? (
        <div className="card">
          <div className="card-head"><div>
            <h2>Enrol a learner into {gradeName(section.grade_level)} · {String(section.name)}</h2>
            <p>Search the registry, then set the first day this learner belongs to this section.</p>
          </div></div>
          <div className="card-body">
            <Finder
              initial={{ search: '', lrn: '' }}
              onApply={async values => {
                setEnrolling(null);
                setFound(null);
                try {
                  const result = await api<Page>(`/learners${query({ ...values, limit: 25 })}`);
                  setFound(result.items);
                } catch (error) { setStatus({ text: message(error), kind: 'error' }); setFound([]); }
              }}
              onClear={() => { setFound(null); setEnrolling(null); }}
              fields={[
                { key: 'search', label: 'Name or LRN', optional: true, minLength: 2, maxLength: 100, hint: 'At least two characters.' },
                { key: 'lrn', label: 'Exact LRN', optional: true, pattern: '[0-9]{12}', maxLength: 12 },
              ]}
            />

            {found === null ? null : enrolling ? (
              <>
                <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: 'var(--s5) 0' }} />
                <p><strong>{learnerName(enrolling)}</strong>{enrolling.lrn ? <> · LRN {String(enrolling.lrn)}</> : ' · LRN pending'}</p>
                <Editor
                  submitLabel="Enrol this learner"
                  setStatus={setStatus}
                  onSaved={() => { setEnrolling(null); setFound(null); reload(); }}
                  fields={[
                    { key: 'enrolled_on', label: 'First day in this section', type: 'date', hint: 'Must fall inside the school year and after the learner’s birth date.' },
                    { key: 'entry_kind', label: 'Joining as', options: [['regular', 'Regular enrollment'], ['transfer_in', 'Transferred in from another school']] },
                  ]}
                  onSubmit={data => api('/enrollments', 'POST', { ...data, learner_id: enrolling.id, section_id: sectionId })}
                />
                <div className="form-actions">
                  <button type="button" className="btn ghost small" onClick={() => setEnrolling(null)}>Choose someone else</button>
                </div>
              </>
            ) : (
              <>
                <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: 'var(--s5) 0' }} />
                <Table
                  rows={found}
                  rowKey={r => String(r.id)}
                  empty={<EmptyState title="No learner found" body="Check the spelling, or register the learner first from the Learner registry screen." />}
                  columns={[
                    { header: 'Learner', cell: learnerName },
                    { header: 'LRN', cell: r => r.lrn ? <code>{String(r.lrn)}</code> : <Badge tone="attention">Pending</Badge> },
                    { header: 'Birth date', cell: r => value(r, 'birth_date') },
                    { header: '', cell: r => <button type="button" className="btn secondary small" onClick={() => setEnrolling(r)}>Choose</button> },
                  ]}
                />
              </>
            )}
          </div>
        </div>
      ) : null}

      <Callout tone="info" title="Not on this screen yet">
        Correcting a recorded movement or its dates, voiding an enrollment entered by mistake, correcting a whole-year grade placement, and merging duplicate learner records are all reviewed workflows that exist in the API but have no screen. Promotion to the next grade is a separate section and is not built at all.
      </Callout>
    </>
  );
}
