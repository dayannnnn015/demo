import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { ApiError, message, query } from '../api';
import type { Route } from '../routes';
import { Icon } from '../components/icons';
import { IdentityHistory, IdentitySheet, LrnCorrection, LrnHistory, ReviewActions } from './Reviews';
import { LearnerRecord } from './LearnerRecord';
import { Sf10Dialog, Sf9Dialog } from './FormDialogs';
import {
  Badge, Button, Callout, Cell, Editor, EmptyState, Finder, FormSheet, PageHeader, Pager, PrintButton,
  Table, Task, Unrecorded, gradeName, learnerName, sentence, value, type Field, type Status,
} from '../components/primitives';
import { Affects } from '../components/affects';
import { profileFields } from '../record-fields';

// The API takes exactly these keys, so the form must not send anything else.

/** Read-only Section 2A registry. The API decides what each staff member may see. */
export function Learners({ api, me, manager, setStatus, reload, token, route }: {
  api: Api; me: Row; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number; route: Route;
}) {
  const [rows, setRows] = useState<Page | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({ search: '', lrn: '', birth_date: '', sex: '' });
  const [offset, setOffset] = useState(0);
  const [years, setYears] = useState<Row[]>([]);
  const [sections, setSections] = useState<Row[]>([]);
  const [records, setRecords] = useState<Record<string, Row[]>>({});
  const [adding, setAdding] = useState(false);
  const [distinct, setDistinct] = useState('');
  const [linked, setLinked] = useState(false);
  const [identity, setIdentity] = useState<{ learner: Row; action: 'link' | 'unlink' } | null>(null);
  const [viewing, setViewing] = useState<{ learner: Row; enrollment: Row } | null>(null);
  const [form, setForm] = useState<{ kind: 'sf9'; learner: Row; enrollment: Row } | { kind: 'sf10'; learner: Row } | null>(null);

  useEffect(() => {
    setRows(null);
    void api<Page>(`/learners${query({ ...filters, include_linked: linked ? 'true' : undefined, limit: 25, offset })}`).then(setRows).catch(() => setRows({ items: [] }));
  }, [api, filters, linked, offset, token]);

  useEffect(() => {
    void api<Page>('/academic-years').then(r => setYears(r.items)).catch(() => setYears([]));
    void (async () => {
      const all: Row[] = [];
      for (let skip = 0; ; skip += 100) {
        const result = await api<Page>(`/sections${query({ limit: 100, offset: skip })}`);
        all.push(...result.items);
        if (!result.pagination?.has_more) break;
      }
      setSections(all);
    })().catch(() => setSections([]));
  }, [api, token]);

  // The SF9 and SF10 open from the registry row itself, from the group leader's notes of 9 October:
  // the forms belong with the learner, not on screens of their own.
  const openSf9 = async (learner: Row) => {
    try {
      const result = await api<Page>(`/enrollments${query({ learner_id: String(learner.id), limit: 100 })}`);
      const valid = result.items.filter(e => e.record_state !== 'voided');
      const active = years.find(y => y.status === 'active');
      const startOf = (e: Row) => Number(years.find(y => y.id === e.academic_year_id)?.start_year ?? 0);
      const pick = valid.find(e => e.academic_year_id === active?.id) ?? [...valid].sort((a, b) => startOf(b) - startOf(a))[0];
      if (!pick) { setStatus({ kind: 'error', text: `${learnerName(learner)} has no enrollment yet, so there is no report card to open.` }); return; }
      setForm({ kind: 'sf9', learner, enrollment: pick });
    } catch (error) { setStatus({ kind: 'error', text: message(error) }); }
  };
  const yearLabel = (id: unknown) => { const y = years.find(r => r.id === id); return y ? `${y.start_year}–${Number(y.start_year) + 1}` : 'Unavailable year'; };
  const sectionLabel = (id: unknown) => String(sections.find(r => r.id === id)?.name ?? 'Unavailable section');
  const searching = Object.values(filters).some(Boolean);
  const found = rows?.items.length ?? 0;

  return (
    <>
      <PageHeader
        route={route}
        actions={<>
          {found ? <PrintButton label="Print this page" /> : null}
          {manager
            ? <button type="button" className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Register a learner</button>
            : null}
        </>}
      />

      {manager
        ? null
        : <Callout tone="info" title="You see your own learners">Only the learners enrolled in the sections you advise, in an open school year. A principal or administrative officer maintains these records.</Callout>}

      <div className="card">
        <div className="card-tools">
          <Finder
            initial={filters}
            onApply={next => { setFilters(next); setOffset(0); }}
            onClear={() => { setFilters({ search: '', lrn: '', birth_date: '', sex: '' }); setOffset(0); }}
            fields={[
              { key: 'search', label: 'Name or LRN', optional: true, minLength: 2, maxLength: 100, hint: 'At least two characters.' },
              { key: 'lrn', label: 'Exact LRN', optional: true, pattern: '[0-9 -]{12,20}', maxLength: 20, hint: 'Twelve digits.' },
              { key: 'birth_date', label: 'Birth date', type: 'date', optional: true },
              { key: 'sex', label: 'Sex', optional: true, options: [['', 'Any'], ['female', 'Female'], ['male', 'Male']] },
            ]}
          />
          {manager ? (
            <label className="check-line">
              <input type="checkbox" checked={linked} onChange={event => { setLinked(event.target.checked); setOffset(0); }} />
              <span>Include records linked into another</span>
            </label>
          ) : null}
        </div>
        <Table
          loading={rows === null}
          rows={rows?.items ?? []}
          rowKey={r => String(r.id)}
          empty={searching
            ? <EmptyState title="No learners match" body="Try a shorter name, or clear the search to see everyone you have access to." />
            : <EmptyState title="The registry is empty" body={manager ? 'Register the first learner, then enrol them into a section.' : 'No learners are currently assigned to your sections.'} />}
          columns={[
            {
              header: 'Learner',
              cell: r => <Cell
                title={<>{learnerName(r)}{r.merged_into ? <> <Badge tone="info">Linked</Badge></> : null}</>}
                // An LRN the school has not been issued yet is a gap in the
                // record, not a value someone left out.
                meta={r.lrn == null ? <Unrecorded label="LRN missing" /> : `LRN ${value(r, 'lrn')}`}
              />,
            },
            { header: 'Birth date', cell: r => <span className="mono">{value(r, 'birth_date')}</span> },
            { header: 'Sex', cell: r => sentence(value(r, 'sex')) },
            {
              header: 'School forms',
              cell: r => (r.merged_into ? <span className="muted">On the kept record</span> : (
                <span className="row-actions">
                  {/* Outlined with a page icon, so they read as something to open at first sight (the group's note, 28 October). */}
                  <button type="button" className="btn secondary small form-open" aria-label={`SF9 report card of ${learnerName(r)}`} onClick={() => void openSf9(r)}><Icon name="form" size={14} />SF9</button>
                  <button type="button" className="btn secondary small form-open" aria-label={`SF10 permanent record of ${learnerName(r)}`} onClick={() => setForm({ kind: 'sf10', learner: r })}><Icon name="form" size={14} />SF10</button>
                </span>
              )),
            },
          ]}
          actionsLabel="Record"
          detailLabel="Open"
          detail={row => {
            const id = String(row.id);
            const loaded = records[id];
            if (manager && row.merged_into) {
              return (
                <>
                  <Callout tone="info" title="Linked into another record">
                    This entry was recorded as the same child as another, which is now the record that counts. It is kept as it was and cannot be edited, given an LRN or enrolled.
                  </Callout>
                  <ReviewActions>
                    <button type="button" className="btn secondary" onClick={() => setIdentity({ learner: row, action: 'unlink' })}>Reverse this link</button>
                  </ReviewActions>
                  <Task title="Identity links" note="Newest first"><IdentityHistory api={api} learnerId={id} /></Task>
                </>
              );
            }
            return (
              <>
                {manager ? (
                  <>
                    <Task title="Correct the details" note="Spelling, birth date, name extension">
                      <p className="muted">An assigned LRN is never changed here; correcting one is a separate reviewed workflow.</p>
                      <Editor fields={profileFields} initial={row} setStatus={setStatus} onSaved={reload} warning={<Affects what="learner" />}
                        onSubmit={data => api(`/learners/${row.id}`, 'PATCH', { ...data, version: row.version })} />
                    </Task>
                    {row.lrn == null ? (
                      <Task title="Fill the official LRN" note="Recorded once, and never cleared">
                        <p className="muted">EDUNEXUS never invents an LRN. Enter it only when the school has been issued one.</p>
                        <Editor submitLabel="Assign LRN" setStatus={setStatus} onSaved={reload} warning={<Affects what="lrn" />}
                          fields={[{ key: 'lrn', label: 'Learner Reference Number', pattern: '[0-9 -]{12,20}', maxLength: 20, hint: 'Exactly twelve digits, leading zeroes included.' }]}
                          onSubmit={data => api(`/learners/${row.id}/lrn`, 'PATCH', { ...data, version: row.version })} />
                      </Task>
                    ) : (
                      <Task title="Correct the assigned LRN" note="Reviewed, and the old number kept">
                        <LrnCorrection api={api} learner={row} setStatus={setStatus} onDone={reload} />
                        <h3>Earlier corrections</h3>
                        <LrnHistory api={api} learnerId={id} />
                      </Task>
                    )}
                    <Task title="Identity links" note="Duplicate records of the same child">
                      <p className="muted">When two registry entries are the same child, link the duplicate to the record that is kept. Both stay on file.</p>
                      <ReviewActions>
                        <button type="button" className="btn secondary" onClick={() => setIdentity({ learner: row, action: 'link' })}>This is the same child as another record</button>
                      </ReviewActions>
                      <IdentityHistory api={api} learnerId={id} />
                    </Task>
                    <p className="card-note">
                      <a href={`#/access?record=${id}`}>Who has opened this record</a> — the privacy access log, narrowed to this learner, including every read of their enrollments.
                    </p>
                  </>
                ) : null}

                <Task title="School years" note="Reading these is recorded in the access log">
                  {!loaded ? (
                    <>
                      <p className="muted">Fetched only when you ask. Every enrollment record returned is named in the privacy audit, so the registry does not load them for a list it was not asked for.</p>
                      <Button label="Load enrollment records" icon="years" setStatus={setStatus} onRun={async () => {
                        const result = await api<Page>(`/enrollments${query({ learner_id: id, limit: 100, record_state: manager ? 'all' : undefined })}`);
                        setRecords(current => ({ ...current, [id]: result.items }));
                      }} />
                    </>
                  ) : <Table rows={loaded} rowKey={r => String(r.id)}
                empty={<p className="muted">This learner has no enrollment records yet.</p>}
                columns={[
                  { header: 'School year', cell: r => yearLabel(r.academic_year_id) },
                  { header: 'Grade', cell: r => gradeName(r.grade_level) },
                  { header: 'Section', cell: r => sectionLabel(r.section_id) },
                  { header: 'Status', cell: r => sentence(value(r, 'status')) },
                  { header: 'Enrolled', cell: r => <span className="mono">{value(r, 'enrolled_on')}</span> },
                  { header: 'Latest change', cell: r => `${value(r, 'effective_on')} · ${sentence(value(r, 'last_reason'))}` },
                  { header: 'Record', cell: r => r.record_state === 'voided'
                    ? <Badge tone="stopped">Voided</Badge>
                    : <Badge tone="good">Valid</Badge> },
                  { header: 'Attendance', cell: r => (r.record_state === 'voided' ? <span className="muted">Not shown for a voided record</span>
                    : <span className="row-actions">
                        <button type="button" className="btn ghost small" onClick={() => setViewing({ learner: row, enrollment: r })}>View the year</button>
                        <button type="button" className="btn secondary small form-open" onClick={() => setForm({ kind: 'sf9', learner: row, enrollment: r })}><Icon name="form" size={14} />SF9</button>
                      </span>) },
                ]} />}
                  {loaded ? (
                    <div className="form-actions sheet-tools">
                      <button type="button" className="btn secondary form-open" onClick={() => setForm({ kind: 'sf10', learner: row })}><Icon name="form" size={15} />Permanent record (SF10)</button>
                    </div>
                  ) : null}
                </Task>
              </>
            );
          }}
        />
        <Pager offset={offset} count={found} hasMore={Boolean(rows?.pagination?.has_more)} onChange={setOffset} />
      </div>

      {viewing ? (
        <LearnerRecord
          api={api}
          me={me}
          learner={viewing.learner}
          enrollment={viewing.enrollment}
          yearLabel={yearLabel(viewing.enrollment.academic_year_id)}
          sectionLabel={sectionLabel(viewing.enrollment.section_id)}
          onClose={() => setViewing(null)}
        />
      ) : null}

      {form?.kind === 'sf9' ? <Sf9Dialog api={api} me={me} learner={form.learner} enrollment={form.enrollment} onClose={() => setForm(null)} /> : null}
      {form?.kind === 'sf10' ? <Sf10Dialog api={api} me={me} learner={form.learner} onClose={() => setForm(null)} /> : null}

      {identity ? (
        <IdentitySheet
          api={api}
          learner={identity.learner}
          action={identity.action}
          onClose={() => setIdentity(null)}
          onDone={text => { setIdentity(null); setStatus({ text, kind: 'done' }); reload(); }}
        />
      ) : null}

      {adding ? (
        <FormSheet
          title="Register a learner"
          note="One permanent record per child, carried across every school year. Enrolling them into a section is the next step, on the Enrollment screen."
          submitLabel="Register learner"
          fields={[...profileFields, { key: 'lrn', label: 'LRN', pattern: '[0-9 -]{12,20}', maxLength: 20, hint: 'All twelve digits, as the school’s LIS shows it. Every new learner needs one; EDUNEXUS never invents it.' }]}
          onSubmit={async data => {
            await possibleDuplicate(api, data, distinct, setDistinct);
            return api('/learners', 'POST', data);
          }}
          onSaved={() => { setAdding(false); reload(); setStatus({ text: 'Learner registered.', kind: 'done' }); }}
          onClose={() => { setAdding(false); setDistinct(''); }}
        />
      ) : null}
    </>
  );
}

/**
 * The same surname and birth date already on file usually means the same child,
 * registered again because a search missed them, so the registry's own search
 * runs first, as the late-learner sheet's does. A match is said beside the
 * name; pressing Register learner again with the same details records a
 * different child. Recording that search writes the usual access row.
 */
export async function possibleDuplicate(api: Api, data: Record<string, unknown>, distinct: string, setDistinct: (key: string) => void) {
  const last = String(data.last_name ?? ''), born = String(data.birth_date ?? '');
  const key = [last, data.first_name, born].join('|').toLowerCase();
  if (key === distinct || last.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(born)) return;
  let found: Row[] = [];
  try { found = (await api<Page>(`/learners${query({ search: last, birth_date: born, limit: 5 })}`)).items; } catch { return; }
  if (!found.length) return;
  setDistinct(key);
  const names = found.map(row => `${learnerName(row)}${row.lrn ? ` (LRN ${String(row.lrn)})` : ''}`).join('; ');
  throw new ApiError(409, 'POSSIBLE_DUPLICATE', 'This child may already be in the registry.', [{ path: 'last_name', message: `Already in the registry with this surname and birth date: ${names}. Open them from the search instead. If this is a different child, press Register learner again.` }]);
}
