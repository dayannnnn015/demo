import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import type { Route } from '../routes';
import { Icon } from '../components/icons';
import {
  Badge, Button, Callout, Cell, Editor, EmptyState, Finder, FormSheet, PageHeader, Pager, PrintButton,
  Table, Task, Unrecorded, gradeName, learnerName, sentence, value, type Field, type Status,
} from '../components/primitives';

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
export function Learners({ api, manager, setStatus, reload, token, route }: {
  api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number; route: Route;
}) {
  const [rows, setRows] = useState<Page | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({ search: '', lrn: '', birth_date: '' });
  const [offset, setOffset] = useState(0);
  const [years, setYears] = useState<Row[]>([]);
  const [sections, setSections] = useState<Row[]>([]);
  const [records, setRecords] = useState<Record<string, Row[]>>({});
  const [adding, setAdding] = useState(false);

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
            onClear={() => { setFilters({ search: '', lrn: '', birth_date: '' }); setOffset(0); }}
            fields={[
              { key: 'search', label: 'Name or LRN', optional: true, minLength: 2, maxLength: 100, hint: 'At least two characters.' },
              { key: 'lrn', label: 'Exact LRN', optional: true, pattern: '[0-9]{12}', maxLength: 12, hint: 'Twelve digits.' },
              { key: 'birth_date', label: 'Birth date', type: 'date', optional: true },
            ]}
          />
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
                title={learnerName(r)}
                // An LRN the school has not been issued yet is a gap in the
                // record, not a value someone left out.
                meta={r.lrn == null ? <Unrecorded label="LRN not issued" /> : `LRN ${value(r, 'lrn')}`}
              />,
            },
            { header: 'Birth date', cell: r => <span className="mono">{value(r, 'birth_date')}</span> },
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
                    <Task title="Correct the details" note="Spelling, birth date, name extension">
                      <p className="muted">An assigned LRN is never changed here; correcting one is a separate reviewed workflow.</p>
                      <Editor fields={profileFields} initial={row} setStatus={setStatus} onSaved={reload}
                        onSubmit={data => api(`/learners/${row.id}`, 'PATCH', { ...data, version: row.version })} />
                    </Task>
                    {row.lrn == null ? (
                      <Task title="Fill the official LRN" note="Recorded once, and never cleared">
                        <p className="muted">EDUNEXUS never invents an LRN. Enter it only when the school has been issued one.</p>
                        <Editor submitLabel="Assign LRN" setStatus={setStatus} onSaved={reload}
                          fields={[{ key: 'lrn', label: 'Learner Reference Number', pattern: '[0-9]{12}', maxLength: 12, hint: 'Exactly twelve digits, leading zeroes included.' }]}
                          onSubmit={data => api(`/learners/${row.id}/lrn`, 'PATCH', { ...data, version: row.version })} />
                      </Task>
                    ) : null}
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
                ]} />}
                </Task>
              </>
            );
          }}
        />
        <Pager offset={offset} count={found} hasMore={Boolean(rows?.pagination?.has_more)} onChange={setOffset} />
      </div>

      {manager ? (
        <Callout tone="info" title="Not on this screen yet">
          Correcting an assigned LRN, merging two records for the same child, and voiding a record entered by mistake exist in the API but have no screen.
        </Callout>
      ) : null}

      {adding ? (
        <FormSheet
          title="Register a learner"
          note="One permanent record per child, carried across every school year. Enrolling them into a section is the next step, on the Enrollment screen."
          submitLabel="Register learner"
          fields={[...profileFields, { key: 'lrn', label: 'Official LRN', optional: true, pattern: '[0-9]{12}', maxLength: 12, hint: 'Leave blank if it has not been issued yet. EDUNEXUS never invents one.' }]}
          onSubmit={data => api('/learners', 'POST', data)}
          onSaved={() => { setAdding(false); reload(); setStatus({ text: 'Learner registered.', kind: 'done' }); }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </>
  );
}
