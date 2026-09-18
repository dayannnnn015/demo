import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import { Badge, Button, Callout, Editor, EmptyState, Finder, Pager, Table, gradeName, learnerName, sentence, value, type Field, type Status } from '../components/primitives';

// The API takes exactly these keys, so the form must not send anything else.
const profileFields: Field[] = [
  { key: 'last_name', label: 'Last name', maxLength: 100 },
  { key: 'first_name', label: 'First name', maxLength: 100 },
  { key: 'middle_name', label: 'Middle name', optional: true, maxLength: 100 },
  { key: 'name_extension', label: 'Extension', optional: true, maxLength: 20, hint: 'Jr, III, and so on.' },
  { key: 'birth_date', label: 'Birth date', type: 'date' },
  { key: 'sex', label: 'Sex as recorded on school forms', options: [['female', 'Female'], ['male', 'Male']] },
];

/** Read-only Section 2A registry. The API decides what each staff member may see. */
export function Learners({ api, manager, setStatus, reload, token }: {
  api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number;
}) {
  const [rows, setRows] = useState<Page | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({ search: '', lrn: '', birth_date: '' });
  const [offset, setOffset] = useState(0);
  const [years, setYears] = useState<Row[]>([]);
  const [sections, setSections] = useState<Row[]>([]);
  const [records, setRecords] = useState<Record<string, Row[]>>({});

  useEffect(() => {
    setRows(null);
    void api<Page>(`/learners${query({ ...filters, limit: 25, offset })}`).then(setRows).catch(() => setRows({ items: [] }));
  }, [api, filters, offset, token]);

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

  const yearLabel = (id: unknown) => { const y = years.find(r => r.id === id); return y ? `${y.start_year}–${Number(y.start_year) + 1}` : 'Unavailable year'; };
  const sectionLabel = (id: unknown) => String(sections.find(r => r.id === id)?.name ?? 'Unavailable section');
  const searching = Object.values(filters).some(Boolean);

  return (
    <>
      {manager
        ? null
        : <Callout tone="info" title="You see your own learners">This list holds only the learners currently enrolled in the sections you advise in an open school year.</Callout>}

      <div className="card">
        <div className="card-head"><div><h2>Find a learner</h2><p>Search by name, or go straight to an exact LRN.</p></div></div>
        <div className="card-body">
          <Finder
            initial={filters}
            onApply={next => { setFilters(next); setOffset(0); }}
            onClear={() => { setFilters({ search: '', lrn: '', birth_date: '' }); setOffset(0); }}
            fields={[
              { key: 'search', label: 'Name or LRN', optional: true, minLength: 2, maxLength: 100, hint: 'At least two characters.' },
              { key: 'lrn', label: 'Exact LRN', optional: true, pattern: '[0-9]{12}', maxLength: 12, hint: 'Twelve digits.' },
              { key: 'birth_date', label: 'Birth date', type: 'date', optional: true },
            ]}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>Learners</h2><p>{manager ? 'Open a learner to correct their details or fill a pending LRN.' : 'Read only. A principal or administrative officer maintains these records.'}</p></div>
          {rows?.items.length ? <Badge tone="neutral">{rows.items.length} shown</Badge> : null}
        </div>
        <Table
          loading={rows === null}
          rows={rows?.items ?? []}
          rowKey={r => String(r.id)}
          empty={searching
            ? <EmptyState title="No learners match" body="Try a shorter name, or clear the search to see everyone you have access to." />
            : <EmptyState title="The registry is empty" body={manager ? 'Register the first learner below, then enrol them into a section.' : 'No learners are currently assigned to your sections.'} />}
          columns={[
            { header: 'Learner', cell: learnerName },
            { header: 'LRN', cell: r => r.lrn == null ? <Badge tone="attention">Pending</Badge> : <code>{value(r, 'lrn')}</code> },
            { header: 'Birth date', cell: r => value(r, 'birth_date') },
            { header: 'Sex', cell: r => sentence(value(r, 'sex')) },
          ]}
          actionsLabel="Record"
          detailLabel="Open"
          detail={row => {
            const id = String(row.id);
            const loaded = records[id];
            return (
              <>
                {manager ? (
                  <>
                    <h3>Correct details</h3>
                    <p className="muted">An assigned LRN is never changed here. Correcting one is a separate reviewed workflow with no screen yet.</p>
                    <Editor fields={profileFields} initial={row} setStatus={setStatus} onSaved={reload}
                      onSubmit={data => api(`/learners/${row.id}`, 'PATCH', { ...data, version: row.version })} />
                    {row.lrn == null ? (
                      <>
                        <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: 'var(--s5) 0' }} />
                        <h3>Fill the official LRN</h3>
                        <p className="muted">Recorded once. It cannot be cleared or replaced afterwards.</p>
                        <Editor submitLabel="Assign LRN" setStatus={setStatus} onSaved={reload}
                          fields={[{ key: 'lrn', label: 'Learner Reference Number', pattern: '[0-9]{12}', maxLength: 12, hint: 'Exactly twelve digits, leading zeroes included.' }]}
                          onSubmit={data => api(`/learners/${row.id}/lrn`, 'PATCH', { ...data, version: row.version })} />
                      </>
                    ) : null}
                    <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: 'var(--s5) 0' }} />
                  </>
                ) : null}
                <h3>School years</h3>
                {!loaded ? (
                  <>
                    <p className="muted">Fetched only when you ask, because every read is recorded in the access log.</p>
                    <Button label="Load enrollment records" setStatus={setStatus} onRun={async () => {
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
                { header: 'Enrolled', cell: r => value(r, 'enrolled_on') },
                { header: 'Latest change', cell: r => `${value(r, 'effective_on')} · ${sentence(value(r, 'last_reason'))}` },
                { header: 'Record', cell: r => r.record_state === 'voided'
                  ? <Badge tone="stopped">Voided</Badge>
                  : <Badge tone="good">Valid</Badge> },
              ]} />}
              </>
            );
          }}
        />
        <Pager offset={offset} count={rows?.items.length ?? 0} hasMore={Boolean(rows?.pagination?.has_more)} onChange={setOffset} />
      </div>

      {manager ? (
        <div className="card">
          <div className="card-head"><div>
            <h2>Register a learner</h2>
            <p>One permanent record, carried across every school year. Enrolling them into a section is the next step, on the Enrollment screen.</p>
          </div></div>
          <div className="card-body">
            <Editor submitLabel="Register learner" setStatus={setStatus} onSaved={reload}
              fields={[...profileFields, { key: 'lrn', label: 'Official LRN', optional: true, pattern: '[0-9]{12}', maxLength: 12, hint: 'Leave blank if it has not been issued yet. EDUNEXUS never invents one.' }]}
              onSubmit={data => api('/learners', 'POST', data)} />
          </div>
        </div>
      ) : null}

      {manager ? (
        <Callout tone="info" title="Not on this screen yet">
          Correcting an LRN that was already assigned, merging two records for the same child, voiding a record entered by mistake, and importing a class list from a file are reviewed workflows that exist in the API but have no screen.
        </Callout>
      ) : null}
    </>
  );
}
