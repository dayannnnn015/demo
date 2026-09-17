import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import { Action, Editor, OffsetPager, Table, gradeName, value, yearName, type Field, type Status } from '../ui';

const dateFields: Field[] = [
  { key: 'starts_on', label: 'Start date', type: 'date' },
  { key: 'ends_on', label: 'End date', type: 'date' },
];

export function School({ api, manager, setStatus, reload, token }: {
  api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number;
}) {
  const [school, setSchool] = useState<Row | null>(null);
  useEffect(() => { void api<Row>('/school').then(setSchool).catch(e => setStatus({ text: String(e.message), kind: 'error' })); }, [api, token, setStatus]);
  if (!school) return null;
  const fields: Field[] = [
    { key: 'name', label: 'School name', maxLength: 150 },
    { key: 'school_code', label: 'School ID (optional, six digits)', optional: true, pattern: '[0-9]{6}', maxLength: 6 },
    { key: 'address', label: 'Address', maxLength: 300 },
  ];
  return (
    <>
      <p>Start here: check the school profile, create a school year, add its reporting periods, then create sections. Learners and attendance follow.</p>
      {manager
        ? <Editor title="School profile" fields={fields} initial={school} setStatus={setStatus} onSaved={reload}
            onSubmit={data => api('/school', 'PATCH', { ...data, version: school.version })} />
        : <Table rows={[school]} rowKey={() => 'school'} columns={fields.map(f => ({ header: f.label, cell: (r: Row) => value(r, f.key) }))} />}
    </>
  );
}

export function Years({ api, manager, setStatus, reload, token }: {
  api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number;
}) {
  const [years, setYears] = useState<Row[]>([]);
  useEffect(() => { void api<Page>('/academic-years').then(r => setYears(r.items)).catch(() => setYears([])); }, [api, token]);
  return (
    <>
      <p>Create a draft year and define its reporting periods before activating it. Closing a year locks its setup and cannot be undone here.</p>
      <Table
        rows={years}
        rowKey={r => String(r.id)}
        columns={[
          { header: 'School year', cell: yearName },
          { header: 'Start', cell: r => value(r, 'starts_on') },
          { header: 'End', cell: r => value(r, 'ends_on') },
          { header: 'Status', cell: r => value(r, 'status') },
        ]}
        detail={manager ? (row => {
          if (row.status === 'closed') return <p className="empty">Closed year is read-only.</p>;
          const next = row.status === 'draft' ? 'active' : 'closed';
          return <Action
            label={next === 'active' ? 'Activate year' : 'Close year'}
            confirm={`${next === 'active' ? 'Activate' : 'Close'} school year ${yearName(row)}?${next === 'closed' ? ' Its setup will become read-only.' : ''}`}
            setStatus={setStatus}
            onRun={async () => { await api(`/academic-years/${row.id}/status`, 'PATCH', { version: row.version, status: next }); reload(); }}
          />;
        }) : undefined}
        detailLabel="Change"
      />
      {manager ? <Editor title="Create school year" setStatus={setStatus} onSaved={reload}
        fields={[{ key: 'start_year', label: 'Starting year (e.g. 2026)', type: 'number', min: 2000, max: 2199 }, ...dateFields]}
        onSubmit={data => api('/academic-years', 'POST', data)} /> : null}
    </>
  );
}

export function YearScoped({ api, manager, setStatus, reload, token, page }: {
  api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number; page: 'Reporting periods' | 'Sections';
}) {
  const [years, setYears] = useState<Row[]>([]);
  const [yearId, setYearId] = useState('');
  const [rows, setRows] = useState<Page>({ items: [] });
  const [advisers, setAdvisers] = useState<Row[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    void api<Page>('/academic-years').then(r => {
      setYears(r.items);
      setYearId(current => (r.items.some(y => y.id === current) ? current : String((r.items.find(y => y.status === 'active') ?? r.items[0])?.id ?? '')));
    }).catch(() => setYears([]));
  }, [api, token]);

  useEffect(() => {
    if (!yearId) return;
    const path = page === 'Reporting periods'
      ? `/academic-years/${yearId}/periods`
      : `/sections${query({ academic_year_id: yearId, limit: 25, offset })}`;
    void api<Page>(path).then(setRows).catch(() => setRows({ items: [] }));
    if (page === 'Sections' && manager) {
      void (async () => {
        const all: Row[] = [];
        for (let skip = 0; ; skip += 100) {
          const result = await api<Page>(`/staff${query({ role: 'teacher', limit: 100, offset: skip })}`);
          all.push(...result.items.filter(r => r.active));
          if (!result.pagination?.has_more) break;
        }
        setAdvisers(all);
      })().catch(() => setAdvisers([]));
    }
  }, [api, yearId, page, offset, manager, token]);

  if (!years.length) return <p className="empty">Create a school year first from the School years tab.</p>;
  const selected = years.find(y => y.id === yearId);
  if (!selected) return null;
  const draft = selected.status === 'draft';
  const open = selected.status !== 'closed';

  const periodFields: Field[] = [
    { key: 'ordinal', label: 'Order (1, 2, 3…)', type: 'number', min: 1, max: 12 },
    { key: 'name', label: 'Period name', maxLength: 60 },
    ...dateFields,
  ];
  const sectionFields: Field[] = [
    { key: 'name', label: 'Section name', maxLength: 80 },
    { key: 'adviser_user_id', label: 'Adviser', optional: true, options: [['', 'Unassigned'], ...advisers.map((r): [string, string] => [String(r.user_id), String(r.display_name)])] },
  ];

  return (
    <>
      <label>School year
        <select value={yearId} onChange={e => { setYearId(e.target.value); setOffset(0); }}>
          {years.map(y => <option key={String(y.id)} value={String(y.id)}>{yearName(y)} ({String(y.status)})</option>)}
        </select>
      </label>

      {page === 'Reporting periods' ? (
        <>
          <p>Periods must fit within the school year and must not overlap. They can be edited while the year is a draft.</p>
          <Table rows={rows.items} rowKey={r => String(r.id)} columns={[
            { header: 'Order', cell: r => value(r, 'ordinal') },
            { header: 'Name', cell: r => value(r, 'name') },
            { header: 'Start', cell: r => value(r, 'starts_on') },
            { header: 'End', cell: r => value(r, 'ends_on') },
          ]} detail={manager && draft ? (row => (
            <Editor title="Update period" fields={periodFields} initial={row} setStatus={setStatus} onSaved={reload}
              onSubmit={data => api(`/reporting-periods/${row.id}`, 'PATCH', { ...data, version: row.version })} />
          )) : undefined} />
          {manager && draft ? <Editor title="Add reporting period" fields={periodFields} initial={{ ordinal: rows.items.length + 1 }}
            setStatus={setStatus} onSaved={reload} onSubmit={data => api(`/academic-years/${yearId}/periods`, 'POST', data)} /> : null}
        </>
      ) : (
        <>
          <Table rows={rows.items} rowKey={r => String(r.id)} columns={[
            { header: 'Grade', cell: r => gradeName(r.grade_level) },
            { header: 'Section', cell: r => value(r, 'name') },
            { header: 'Adviser', cell: r => String(advisers.find(a => a.user_id === r.adviser_user_id)?.display_name ?? (r.adviser_user_id ? 'Assigned staff account' : 'Unassigned')) },
          ]} detail={manager && open ? (row => (
            <Editor title="Update section" fields={sectionFields} initial={row} setStatus={setStatus} onSaved={reload}
              onSubmit={data => api(`/sections/${row.id}`, 'PATCH', { ...data, version: row.version })} />
          )) : undefined} />
          <OffsetPager offset={offset} count={rows.items.length} hasMore={Boolean(rows.pagination?.has_more)} onChange={setOffset} />
          {manager && open ? <Editor title="Create section" setStatus={setStatus} onSaved={reload}
            fields={[{ key: 'grade_level', label: 'Grade', type: 'number', options: Array.from({ length: 7 }, (_, g): [string, string] => [String(g), gradeName(g)]) }, ...sectionFields]}
            onSubmit={data => api('/sections', 'POST', { ...data, academic_year_id: yearId })} /> : null}
        </>
      )}
    </>
  );
}
