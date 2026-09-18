import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import { Badge, Button, Callout, Editor, EmptyState, Pager, Select, Table, gradeName, sentence, value, yearName, type Field, type Status } from '../components/primitives';

type Props = { api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number };

const dateFields: Field[] = [
  { key: 'starts_on', label: 'First day', type: 'date' },
  { key: 'ends_on', label: 'Last day', type: 'date' },
];

type Tone = 'good' | 'neutral' | 'info';
const yearTone = (status: unknown): Tone => (status === 'active' ? 'good' : status === 'closed' ? 'neutral' : 'info');

export function School({ api, manager, setStatus, reload, token }: Props) {
  const [school, setSchool] = useState<Row | null>(null);
  useEffect(() => { void api<Row>('/school').then(setSchool).catch(() => setSchool(null)); }, [api, token]);
  const fields: Field[] = [
    { key: 'name', label: 'School name', maxLength: 150 },
    { key: 'school_code', label: 'School ID', optional: true, pattern: '[0-9]{6}', maxLength: 6, hint: 'Six digits. Leave blank until the school confirms it.' },
    { key: 'address', label: 'Address', maxLength: 300 },
  ];
  return (
    <div className="card">
      <div className="card-body">
        {!school ? <div className="skeleton" /> : manager
          ? <Editor fields={fields} initial={school} setStatus={setStatus} onSaved={reload}
              onSubmit={data => api('/school', 'PATCH', { ...data, version: school.version })} />
          : <dl className="form-grid">{fields.map(f => (
              <div className="field" key={f.key}><span className="label">{f.label}</span><div>{value(school, f.key) || <span className="muted">Not set</span>}</div></div>
            ))}</dl>}
      </div>
    </div>
  );
}

export function SchoolYears({ api, manager, setStatus, reload, token }: Props) {
  const [years, setYears] = useState<Row[] | null>(null);
  useEffect(() => { void api<Page>('/academic-years').then(r => setYears(r.items)).catch(() => setYears([])); }, [api, token]);
  return (
    <>
      <div className="card">
        <div className="card-head"><h2>Years</h2></div>
        <Table
          loading={years === null}
          rows={years ?? []}
          rowKey={r => String(r.id)}
          empty={<EmptyState title="No school years yet" body="Create the first school year to start setting up sections and learners." />}
          columns={[
            { header: 'School year', cell: yearName },
            { header: 'First day', cell: r => value(r, 'starts_on') },
            { header: 'Last day', cell: r => value(r, 'ends_on') },
            { header: 'State', cell: r => <Badge tone={yearTone(r.status)}>{sentence(value(r, 'status'))}</Badge> },
          ]}
          detailLabel="Change state"
          detail={manager ? (row => {
            if (row.status === 'closed') return <p className="muted">A closed year is read-only. Reopening needs a reviewed workflow that does not exist yet.</p>;
            const next = row.status === 'draft' ? 'active' : 'closed';
            return (
              <>
                <p className="muted">{next === 'active'
                  ? 'Activating makes this the year new records are entered against. Only one year can be active.'
                  : 'Closing locks this year\'s setup permanently.'}</p>
                <Button
                  label={next === 'active' ? 'Activate year' : 'Close year'}
                  variant={next === 'active' ? 'primary' : 'danger'}
                  confirm={`${next === 'active' ? 'Activate' : 'Close'} ${yearName(row)}?${next === 'closed' ? ' Its setup becomes read-only and this cannot be undone here.' : ''}`}
                  setStatus={setStatus}
                  onRun={async () => { await api(`/academic-years/${row.id}/status`, 'PATCH', { version: row.version, status: next }); reload(); }}
                />
              </>
            );
          }) : undefined}
        />
      </div>
      {manager ? (
        <div className="card">
          <div className="card-head"><div><h2>Add a school year</h2><p className="card-note">Created as a draft, so its reporting periods can be set before it opens.</p></div></div>
          <div className="card-body">
            <Editor submitLabel="Create year" setStatus={setStatus} onSaved={reload}
              fields={[{ key: 'start_year', label: 'Starting year', type: 'number', min: 2000, max: 2199, hint: 'Enter 2026 for the 2026–2027 school year.' }, ...dateFields]}
              onSubmit={data => api('/academic-years', 'POST', data)} />
          </div>
        </div>
      ) : null}
    </>
  );
}

export function YearScoped({ api, manager, setStatus, reload, token, page }: Props & { page: 'Reporting periods' | 'Sections' }) {
  const [years, setYears] = useState<Row[] | null>(null);
  const [yearId, setYearId] = useState('');
  const [rows, setRows] = useState<Page | null>(null);
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
    setRows(null);
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

  if (years === null) return <div className="card"><div className="card-body"><div className="skeleton" /><div className="skeleton" /></div></div>;
  if (!years.length) return <div className="card"><EmptyState title="No school year yet" body="Reporting periods and sections belong to a school year. Create one from the School years screen first." /></div>;

  const selected = years.find(y => y.id === yearId);
  if (!selected) return null;
  const draft = selected.status === 'draft';
  const open = selected.status !== 'closed';

  const periodFields: Field[] = [
    { key: 'ordinal', label: 'Order', type: 'number', min: 1, max: 12, hint: 'First period is 1.' },
    { key: 'name', label: 'Period name', maxLength: 60 },
    ...dateFields,
  ];
  const sectionFields: Field[] = [
    { key: 'name', label: 'Section name', maxLength: 80 },
    { key: 'adviser_user_id', label: 'Adviser', optional: true, options: [['', 'Unassigned'], ...advisers.map((r): [string, string] => [String(r.user_id), String(r.display_name)])] },
  ];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="field inline">
            <label className="label" htmlFor="year-scope">School year</label>
            <Select id="year-scope" value={yearId} onChange={e => { setYearId(e.target.value); setOffset(0); }}>
              {years.map(y => <option key={String(y.id)} value={String(y.id)}>{yearName(y)} — {sentence(String(y.status))}</option>)}
            </Select>
          </div>
          <Badge tone={yearTone(selected.status)}>{sentence(value(selected, 'status'))}</Badge>
        </div>

        {page === 'Reporting periods' ? (
          <Table
            loading={rows === null}
            rows={rows?.items ?? []}
            rowKey={r => String(r.id)}
            empty={<EmptyState title="No reporting periods" body={draft ? 'Add the periods this year is divided into. They must not overlap.' : 'This year has no reporting periods and can no longer be edited.'} />}
            columns={[
              { header: 'Order', cell: r => value(r, 'ordinal'), numeric: true },
              { header: 'Name', cell: r => value(r, 'name') },
              { header: 'First day', cell: r => value(r, 'starts_on') },
              { header: 'Last day', cell: r => value(r, 'ends_on') },
            ]}
            detail={manager && draft ? (row => (
              <Editor fields={periodFields} initial={row} setStatus={setStatus} onSaved={reload}
                onSubmit={data => api(`/reporting-periods/${row.id}`, 'PATCH', { ...data, version: row.version })} />
            )) : undefined}
          />
        ) : (
          <>
            <Table
              loading={rows === null}
              rows={rows?.items ?? []}
              rowKey={r => String(r.id)}
              empty={<EmptyState title="No sections in this year" body={open ? 'Create a section for each class, then assign its adviser.' : 'This year is closed and its sections can no longer be changed.'} />}
              columns={[
                { header: 'Grade', cell: r => gradeName(r.grade_level) },
                { header: 'Section', cell: r => value(r, 'name') },
                { header: 'Adviser', cell: r => {
                  const adviser = advisers.find(a => a.user_id === r.adviser_user_id);
                  if (adviser) return String(adviser.display_name);
                  return r.adviser_user_id ? <span className="muted">Assigned</span> : <Badge tone="attention">Unassigned</Badge>;
                } },
              ]}
              detail={manager && open ? (row => (
                <Editor fields={sectionFields} initial={row} setStatus={setStatus} onSaved={reload}
                  onSubmit={data => api(`/sections/${row.id}`, 'PATCH', { ...data, version: row.version })} />
              )) : undefined}
            />
            <Pager offset={offset} count={rows?.items.length ?? 0} hasMore={Boolean(rows?.pagination?.has_more)} onChange={setOffset} />
          </>
        )}
      </div>

      {manager && (page === 'Reporting periods' ? draft : open) ? (
        <div className="card">
          <div className="card-head"><div>
            <h2>{page === 'Reporting periods' ? 'Add a reporting period' : 'Add a section'}</h2>
            <p className="card-note">{page === 'Reporting periods' ? 'Periods sit inside the school year and must not overlap.' : 'An adviser sees only the learners in their own sections.'}</p>
          </div></div>
          <div className="card-body">
            {page === 'Reporting periods'
              ? <Editor submitLabel="Add period" fields={periodFields} initial={{ ordinal: (rows?.items.length ?? 0) + 1 }} setStatus={setStatus} onSaved={reload}
                  onSubmit={data => api(`/academic-years/${yearId}/periods`, 'POST', data)} />
              : <Editor submitLabel="Add section" setStatus={setStatus} onSaved={reload}
                  fields={[{ key: 'grade_level', label: 'Grade', type: 'number', options: Array.from({ length: 7 }, (_, g): [string, string] => [String(g), gradeName(g)]) }, ...sectionFields]}
                  onSubmit={data => api('/sections', 'POST', { ...data, academic_year_id: yearId })} />}
          </div>
        </div>
      ) : null}

      {manager && page === 'Reporting periods' && !draft ? (
        <Callout tone="info" title="This year is no longer a draft">Reporting periods can only be changed while a school year is a draft, so that dates already used by records cannot shift underneath them.</Callout>
      ) : null}
    </>
  );
}
