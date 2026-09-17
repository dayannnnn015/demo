import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import { Action, OffsetPager, Finder, Table, gradeName, learnerName, sentence, value, type Status } from '../ui';

/** Read-only Section 2A registry. The API decides what each staff member may see. */
export function Learners({ api, manager, setStatus, token }: {
  api: Api; manager: boolean; setStatus: (s: Status) => void; token: number;
}) {
  const [rows, setRows] = useState<Page>({ items: [] });
  const [filters, setFilters] = useState<Record<string, string>>({ search: '', lrn: '', birth_date: '' });
  const [offset, setOffset] = useState(0);
  const [years, setYears] = useState<Row[]>([]);
  const [sections, setSections] = useState<Row[]>([]);
  const [records, setRecords] = useState<Record<string, Row[]>>({});

  useEffect(() => {
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

  const yearLabel = (id: unknown) => { const y = years.find(r => r.id === id); return y ? `${y.start_year}–${Number(y.start_year) + 1}` : 'Unavailable school year'; };
  const sectionLabel = (id: unknown) => String(sections.find(r => r.id === id)?.name ?? 'Unavailable section');

  return (
    <>
      <p>{manager
        ? 'Search the permanent learner registry. This screen is read-only: registration, enrollment changes, corrections and roster import are still API-only.'
        : 'This list holds only the learners currently enrolled in the sections you advise in an open school year. It is read-only.'}</p>
      <Finder title="Find learners" initial={filters} onApply={next => { setFilters(next); setOffset(0); }} fields={[
        { key: 'search', label: 'Name or LRN (at least two characters)', optional: true, minLength: 2, maxLength: 100 },
        { key: 'lrn', label: 'Exact LRN (twelve digits)', optional: true, pattern: '[0-9]{12}', maxLength: 12 },
        { key: 'birth_date', label: 'Birth date', type: 'date', optional: true },
      ]} />
      <Table
        rows={rows.items}
        rowKey={r => String(r.id)}
        empty="No learners match this search."
        columns={[
          { header: 'Learner', cell: learnerName },
          { header: 'LRN', cell: r => (r.lrn == null ? 'Pending' : value(r, 'lrn')) },
          { header: 'Birth date', cell: r => value(r, 'birth_date') },
          { header: 'Sex', cell: r => sentence(value(r, 'sex')) },
        ]}
        actionsLabel="Enrollment records"
        detailLabel="Open"
        detail={row => {
          const id = String(row.id);
          const loaded = records[id];
          if (!loaded) {
            // Fetched on demand: every successful read appends a record-access event.
            return <Action label="Load enrollment records" setStatus={setStatus} onRun={async () => {
              const result = await api<Page>(`/enrollments${query({ learner_id: id, limit: 100, record_state: manager ? 'all' : undefined })}`);
              setRecords(current => ({ ...current, [id]: result.items }));
            }} />;
          }
          return <Table rows={loaded} rowKey={r => String(r.id)} empty="No school-year records for this learner." columns={[
            { header: 'School year', cell: r => yearLabel(r.academic_year_id) },
            { header: 'Grade', cell: r => gradeName(r.grade_level) },
            { header: 'Section', cell: r => sectionLabel(r.section_id) },
            { header: 'Status', cell: r => sentence(value(r, 'status')) },
            { header: 'Enrolled on', cell: r => value(r, 'enrolled_on') },
            { header: 'Latest recorded change', cell: r => `${value(r, 'effective_on')} — ${sentence(value(r, 'last_reason'))}` },
            { header: 'Record', cell: r => (r.record_state === 'voided' ? 'Voided — not usable for reporting' : 'Valid') },
          ]} />;
        }}
      />
      <OffsetPager offset={offset} count={rows.items.length} hasMore={Boolean(rows.pagination?.has_more)} onChange={setOffset} />
    </>
  );
}
