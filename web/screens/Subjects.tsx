import { useEffect, useId, useState } from 'react';
import type { Api, Row } from '../api';
import { query } from '../api';
import type { Route } from '../routes';
import { Icon } from '../components/icons';
import { ScopePickers, sectionName, useScope } from '../components/scope';
import {
  Badge, Callout, Cell, Editor, EmptyState, FormSheet, PageHeader, PrintButton, Select, Table,
  Task, Unrecorded, gradeName, type Field, type Status,
} from '../components/primitives';

type Props = { api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void; token: number; route: Route };

export type Kind = 'learning_area' | 'developmental_domain';
export type Subject = { id: string; code: string; name: string; kind: Kind; grade_levels: number[]; active: boolean; version: number };
type Offering = {
  id: string; section_id: string; subject_id: string; subject_snapshot: Subject;
  active: boolean; display_order: number; version: number;
};
type Context = { section: Row; school_year: Row & { status: 'draft' | 'active' | 'closed' } };
type SubjectEvent = { id: string; subject_version: number; action: 'create' | 'update'; before_snapshot: Subject | null; after_snapshot: Subject; reason: string; recorded_at: string };
type OfferingEvent = { id: string; offering_version: number; action: 'create' | 'update' | 'refresh'; before_snapshot: Offering | null; after_snapshot: Offering; reason: string; recorded_at: string };

export const kindName: Record<Kind, string> = { learning_area: 'Learning area', developmental_domain: 'Developmental domain' };

const grades: [string, string][] = [['0', 'Kindergarten'], ...[1, 2, 3, 4, 5, 6].map(g => [String(g), `Grade ${g}`] as [string, string])];

/**
 * The grades a subject applies to, as a register would write them:
 * `[0, 1, 2, 3, 5]` is "Kindergarten, Grades 1–3, 5". Grade 0 is always
 * Kindergarten by name — it is a grade level, never a numeric grading target.
 */
export function gradesText(levels: number[]) {
  const sorted = [...new Set(levels)].sort((a, b) => a - b);
  const parts: string[] = [];
  if (sorted[0] === 0) parts.push('Kindergarten');
  const rest = sorted.filter(g => g > 0);
  const runs: string[] = [];
  for (let i = 0; i < rest.length;) {
    let j = i;
    while (j + 1 < rest.length && rest[j + 1] === rest[j]! + 1) j++;
    runs.push(j - i >= 2 ? `${rest[i]}–${rest[j]}` : rest.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  if (runs.length) parts.push(`${rest.length === 1 ? 'Grade' : 'Grades'} ${runs.join(', ')}`);
  return parts.join(', ');
}

/** What a revision changed, named field by field, for the history table. */
export function changed(before: Partial<Subject> | null, after: Partial<Subject>): string[] {
  if (!before) return ['Created'];
  const out: string[] = [];
  if (before.name !== after.name) out.push(`Name: ${before.name} → ${after.name}`);
  if (before.kind !== after.kind) out.push(`Kind: ${kindName[before.kind!]} → ${kindName[after.kind!]}`);
  if (String(before.grade_levels) !== String(after.grade_levels)) out.push(`Grades: ${gradesText(before.grade_levels ?? [])} → ${gradesText(after.grade_levels ?? [])}`);
  if (before.active !== after.active) out.push(after.active ? 'Restored to the catalog' : 'Archived');
  return out;
}

/**
 * Orders offerings the way the section reads them. The API pages by UUID, so
 * this is applied to the whole collected list: by display order, then code,
 * then id so that ties are still stable.
 */
export const byDisplay = (a: Offering, b: Offering) =>
  a.display_order - b.display_order || a.subject_snapshot.code.localeCompare(b.subject_snapshot.code) || a.id.localeCompare(b.id);

/** Every page of a UUID-paged list. Catalogs and offerings are small; a section list sorted from one page would be wrong. */
async function collect<T>(api: Api, path: string, params: Record<string, string | number | undefined>) {
  const items: T[] = [];
  let after: string | undefined;
  for (let guard = 0; guard < 50; guard++) {
    const page = await api<{ items: T[]; pagination: { next_after_id: string | null } } & Record<string, unknown>>(`${path}${query({ ...params, limit: 100, after_id: after })}`);
    items.push(...page.items);
    if (!page.pagination.next_after_id) return { items, page };
    after = page.pagination.next_after_id;
  }
  throw new Error('The list is longer than this screen can read.');
}

const reasonField: Field = { key: 'reason', label: 'Reason', type: 'textarea', minLength: 10, maxLength: 500, wide: true, hint: '10–500 characters on one line, kept in the permanent history of this change.' };
const subjectFields = (creating: boolean): Field[] => [
  ...(creating ? [{ key: 'code', label: 'Code', maxLength: 24, pattern: '[A-Za-z][A-Za-z0-9_-]{0,23}', hint: 'Starts with a letter; letters, digits, _ and -. Stored in capitals and never changed afterwards.' }] : []),
  { key: 'name', label: 'Name', maxLength: 120 },
  { key: 'kind', label: 'Kind', options: [['learning_area', kindName.learning_area], ['developmental_domain', kindName.developmental_domain]] },
  { key: 'active', label: 'In the catalog', options: [['true', 'Available for new offerings'], ['false', 'Archived']] },
  { key: 'grade_levels', label: 'Applies to', type: 'checkboxes', options: grades, wide: true, hint: 'The grade levels this subject may be offered to. It says nothing about how a grade is computed.' },
  reasonField,
];

/** Converts the editor's strings back into the types the API takes. */
const subjectBody = (data: Record<string, unknown>) => ({
  ...data,
  active: data.active === 'true',
  grade_levels: ((data.grade_levels as string[] | undefined) ?? []).map(Number),
});

function SubjectHistory({ api, subject }: { api: Api; subject: Subject }) {
  const [rows, setRows] = useState<SubjectEvent[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const read = async (before?: number) => {
    const page = await api<{ items: SubjectEvent[]; pagination: { next_before_version: number | null } }>(`/subjects/${subject.id}/events${query({ limit: 5, before_version: before })}`);
    setRows(current => (before ? [...(current ?? []), ...page.items] : page.items));
    setCursor(page.pagination.next_before_version);
  };
  useEffect(() => { void read().catch(() => setRows([])); }, [subject.id, subject.version]);
  return (
    <>
      <Table
        loading={rows === null}
        rows={rows ?? []}
        rowKey={row => row.id}
        empty={<p className="muted">No history was returned.</p>}
        columns={[
          { header: 'Version', cell: row => <span className="mono">{row.subject_version}</span> },
          { header: 'Change', cell: row => <ul className="plain">{changed(row.before_snapshot, row.after_snapshot).map(c => <li key={c}>{c}</li>)}</ul> },
          { header: 'Reason', cell: row => row.reason },
          { header: 'Recorded', cell: row => <span className="mono">{new Date(row.recorded_at).toLocaleString()}</span> },
        ]}
      />
      {cursor !== null ? <button type="button" className="btn ghost small" onClick={() => void read(cursor)}>Show older revisions</button> : null}
    </>
  );
}

/** The catalog every section chooses from. Codes are permanent; everything else is versioned. */
function Catalog({ api, manager, setStatus, reload, catalog, adding, setAdding }: {
  api: Api; manager: boolean; setStatus: (s: Status) => void; reload: () => void;
  catalog: Subject[] | null; adding: boolean; setAdding: (v: boolean) => void;
}) {
  const id = useId();
  const [show, setShow] = useState<'true' | 'false' | 'all'>('true');
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const rows = (catalog ?? [])
    .filter(s => show === 'all' || String(s.active) === show)
    .filter(s => !needle || `${s.code} ${s.name}`.toLowerCase().includes(needle))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Subject catalog</h2>
          <p className="card-note">The subjects a section may be given. Nothing here is an official curriculum, and no subject carries a grading rule.</p>
        </div>
      </div>
      <div className="card-head">
        <div className="toolbar">
          <div className="field inline">
            <label className="label" htmlFor={`${id}-show`}>Show</label>
            <Select id={`${id}-show`} value={show} onChange={event => setShow(event.target.value as typeof show)}>
              <option value="true">Available</option>
              <option value="false">Archived</option>
              <option value="all">Everything</option>
            </Select>
          </div>
          <div className="field inline">
            <label className="label" htmlFor={`${id}-search`}>Code or name</label>
            <input id={`${id}-search`} type="search" value={search} maxLength={60} onChange={event => setSearch(event.target.value)} />
          </div>
        </div>
      </div>
      <Table
        loading={catalog === null}
        rows={rows}
        rowKey={row => row.id}
        empty={<EmptyState
          title={catalog?.length ? 'Nothing matches' : 'The catalog is empty'}
          body={catalog?.length ? 'No subject matches this filter.' : 'No subject has been added yet. EDUNEXUS seeds none of its own: every subject here is one the school chose.'}
        />}
        columns={[
          { header: 'Code', cell: row => <b className="mono">{row.code}</b> },
          { header: 'Name', cell: row => <Cell title={row.name} meta={kindName[row.kind]} /> },
          { header: 'Applies to', cell: row => gradesText(row.grade_levels) },
          { header: 'State', cell: row => (row.active ? <Badge tone="good">Available</Badge> : <Badge tone="neutral">Archived</Badge>) },
          { header: 'Version', cell: row => <span className="mono">{row.version}</span>, numeric: true },
        ]}
        detailLabel={manager ? 'Edit' : 'Details'}
        detail={manager ? (row => (
          <>
            <Editor
              fields={subjectFields(false)}
              initial={{ ...row, reason: '' }}
              submitLabel="Save this revision"
              setStatus={setStatus}
              onSaved={reload}
              onSubmit={data => api(`/subjects/${row.id}`, 'PATCH', { ...subjectBody(data), version: row.version })}
              note={<span className="muted">Sections already offering <span className="mono">{row.code}</span> keep the revision they chose.</span>}
            />
            <Task title="Revision history" note="Every change, newest first"><SubjectHistory api={api} subject={row} /></Task>
          </>
        )) : undefined}
      />
      {adding ? (
        <FormSheet
          title="Add a subject"
          note="The code is permanent. The name, kind, grades and availability can be revised later, and every revision is kept."
          wide
          submitLabel="Add to the catalog"
          fields={subjectFields(true)}
          initial={{ kind: 'learning_area', active: 'true' }}
          onSubmit={data => api('/subjects', 'POST', subjectBody(data))}
          onSaved={() => { setAdding(false); reload(); setStatus({ text: 'Subject added to the catalog.', kind: 'done' }); }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}

function OfferingHistory({ api, offering }: { api: Api; offering: Offering }) {
  const [rows, setRows] = useState<OfferingEvent[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const read = async (before?: number) => {
    const page = await api<{ items: OfferingEvent[]; pagination: { next_before_version: number | null } }>(`/section-subjects/${offering.id}/events${query({ limit: 5, before_version: before })}`);
    setRows(current => (before ? [...(current ?? []), ...page.items] : page.items));
    setCursor(page.pagination.next_before_version);
  };
  useEffect(() => { void read().catch(() => setRows([])); }, [offering.id, offering.version]);
  const describe = (row: OfferingEvent) => {
    const { before_snapshot: b, after_snapshot: a } = row;
    if (!b) return [`Added at catalog version ${a.subject_snapshot.version}`];
    const out: string[] = [];
    if (row.action === 'refresh') out.push(`Refreshed from catalog version ${b.subject_snapshot.version} to ${a.subject_snapshot.version}`);
    if (b.display_order !== a.display_order) out.push(`Order ${b.display_order} → ${a.display_order}`);
    if (b.active !== a.active) out.push(a.active ? 'Reactivated' : 'Retired');
    return out.length ? out : ['No visible change'];
  };
  return (
    <>
      <Table
        loading={rows === null}
        rows={rows ?? []}
        rowKey={row => row.id}
        empty={<p className="muted">No history was returned.</p>}
        columns={[
          { header: 'Version', cell: row => <span className="mono">{row.offering_version}</span> },
          { header: 'Change', cell: row => <ul className="plain">{describe(row).map(c => <li key={c}>{c}</li>)}</ul> },
          { header: 'Reason', cell: row => row.reason },
          { header: 'Recorded', cell: row => <span className="mono">{new Date(row.recorded_at).toLocaleString()}</span> },
        ]}
      />
      {cursor !== null ? <button type="button" className="btn ghost small" onClick={() => void read(cursor)}>Show older revisions</button> : null}
    </>
  );
}

/** What a manager can still do to one offering, given its year. */
function OfferingPanel({ api, offering, current, yearStatus, setStatus, reload }: {
  api: Api; offering: Offering; current: Subject | undefined; yearStatus: 'draft' | 'active' | 'closed';
  setStatus: (s: Status) => void; reload: () => void;
}) {
  const pinned = offering.subject_snapshot;
  const behind = current && current.version !== pinned.version;
  return (
    <>
      {behind ? (
        <Callout tone="info" title="The catalog has moved on">
          This section chose <span className="mono">{pinned.code}</span> at catalog version {pinned.version}; the catalog is now at version {current.version}
          {current.name !== pinned.name ? <> and names it “{current.name}”</> : null}. The section keeps the revision it chose
          {yearStatus === 'draft' ? ' until it is refreshed below.' : '. Refreshing is only possible while the school year is a draft.'}
        </Callout>
      ) : null}
      {yearStatus === 'closed' ? <p className="muted">This school year is closed, so its offerings are read only.</p> : (
        <Editor
          fields={[
            { key: 'display_order', label: 'Order in the section', type: 'number', min: 1, max: 999, hint: '1–999. Ties are allowed and fall back to the code.' },
            { key: 'active', label: 'State', options: [['true', 'Offered'], ['false', 'Retired']] },
            reasonField,
          ]}
          initial={{ display_order: offering.display_order, active: String(offering.active), reason: '' }}
          submitLabel="Save"
          setStatus={setStatus}
          onSaved={reload}
          onSubmit={data => api(`/section-subjects/${offering.id}`, 'PATCH', {
            version: offering.version, active: data.active === 'true', display_order: data.display_order,
            refresh_subject: false, subject_version: null, reason: data.reason,
          })}
        />
      )}
      {behind && yearStatus === 'draft' && current ? (
        <Task title={`Refresh to catalog version ${current.version}`} note="Draft years only">
          <Editor
            fields={[reasonField]}
            initial={{ reason: '' }}
            submitLabel="Refresh the pinned details"
            setStatus={setStatus}
            onSaved={reload}
            onSubmit={data => api(`/section-subjects/${offering.id}`, 'PATCH', {
              version: offering.version, active: offering.active, display_order: offering.display_order,
              refresh_subject: true, subject_version: current.version, reason: data.reason,
            })}
          />
        </Task>
      ) : null}
      <Task title="Revision history" note="Every change, newest first"><OfferingHistory api={api} offering={offering} /></Task>
    </>
  );
}

/**
 * The subject catalog, and which subjects each section takes.
 *
 * An offering pins the exact catalog revision it was chosen from, so the two
 * halves of this screen can disagree and are drawn side by side when they do:
 * a later edit to a subject never silently rewrites a section that already
 * started. None of it is a grading rule. No weight, component or computation
 * hangs off a subject or an offering, and Kindergarten is a grade level here,
 * not a numeric target.
 */
export function Subjects({ api, manager, setStatus, reload, token, route }: Props) {
  const scope = useScope(api, token);
  const [catalog, setCatalog] = useState<Subject[] | null>(null);
  const [offerings, setOfferings] = useState<Offering[] | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [adding, setAdding] = useState(false);
  const [offering, setOffering] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCatalog(null);
    void collect<Subject>(api, '/subjects', { active: 'all' }).then(r => setCatalog(r.items)).catch(() => setCatalog([]));
  }, [api, token]);

  const { sectionId } = scope;
  useEffect(() => {
    if (!sectionId) { setOfferings(null); setContext(null); return; }
    setOfferings(null);
    setFailed(false);
    void collect<Offering>(api, `/sections/${sectionId}/subjects`, { active: showRetired ? 'all' : 'true' })
      .then(r => { setOfferings(r.items.sort(byDisplay)); setContext({ section: r.page.section as Row, school_year: r.page.school_year as Context['school_year'] }); })
      .catch(() => { setOfferings([]); setContext(null); setFailed(true); });
  }, [api, sectionId, showRetired, token]);

  const section = scope.section;
  const yearStatus = (context?.school_year.status ?? scope.year?.status ?? 'draft') as 'draft' | 'active' | 'closed';
  const grade = Number(section?.grade_level);
  const offered = new Set((offerings ?? []).map(o => o.subject_id));
  // Retired offerings stay unique per section, so they are excluded too, even
  // when hidden: adding one again means reactivating it, not a second row.
  const choosable = (catalog ?? []).filter(s => s.active && s.grade_levels.includes(grade) && !offered.has(s.id));
  const nextOrder = Math.min(999, Math.max(0, ...(offerings ?? []).map(o => o.display_order)) + 1);

  return (
    <>
      <PageHeader
        route={route}
        actions={<>
          {offerings?.length ? <PrintButton label="Print this section's subjects" /> : null}
          {manager ? <button type="button" className="btn secondary" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Add a subject</button> : null}
          {manager ? (
            <button type="button" className="btn" disabled={!section || yearStatus === 'closed' || catalog === null} onClick={() => setOffering(true)}>
              <Icon name="plus" size={15} />Offer a subject
            </button>
          ) : null}
        </>}
      />

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Section offerings</h2>
            <p className="card-note">What one section takes, each pinned to the catalog revision it was chosen from.</p>
          </div>
        </div>
        {scope.years?.length === 0 ? (
          <EmptyState title="No school year yet" body="Offerings belong to a section of a school year. Create a school year and its sections first." />
        ) : scope.sections?.length === 0 ? (
          <>
            <div className="card-head"><div className="toolbar"><ScopePickers scope={scope} /></div></div>
            <EmptyState
              title="No section to show"
              body={manager ? 'This school year has no sections yet. Add them on the Sections and advisers screen.' : 'You are not the current adviser of any section in this school year.'}
            />
          </>
        ) : (
          <>
            <div className="card-head">
              <div className="toolbar">
                <ScopePickers scope={scope} />
                <label className="check-line">
                  <input type="checkbox" checked={showRetired} onChange={event => setShowRetired(event.target.checked)} />
                  <span>Include retired</span>
                </label>
              </div>
              <div className="card-head-actions">
                {context ? <Badge tone={yearStatus === 'closed' ? 'neutral' : yearStatus === 'active' ? 'good' : 'info'}>{yearStatus === 'closed' ? 'Closed year — read only' : yearStatus === 'draft' ? 'Draft year' : 'Active year'}</Badge> : null}
              </div>
            </div>
            {failed ? <div className="card-body"><Callout tone="stopped" title="These offerings could not be read">A teacher reads only the sections they currently advise, in a year that is not closed. Otherwise the request failed.</Callout></div> : null}
            <Table
              loading={offerings === null && !failed && scope.years !== null}
              rows={offerings ?? []}
              rowKey={row => row.id}
              empty={<EmptyState
                title={`No subjects offered to ${sectionName(section)}`}
                body={manager ? 'Offer a subject from the catalog. Only available subjects that apply to this grade can be chosen.' : 'No subject has been offered to this section yet.'}
              />}
              columns={[
                { header: 'Order', cell: row => <span className="mono">{row.display_order}</span>, numeric: true },
                { header: 'Code', cell: row => <b className="mono">{row.subject_snapshot.code}</b> },
                { header: 'Subject as chosen', cell: row => <Cell title={row.subject_snapshot.name} meta={kindName[row.subject_snapshot.kind]} /> },
                {
                  header: 'Catalog now', cell: row => {
                    const now = catalog?.find(s => s.id === row.subject_id);
                    if (!now) return <Unrecorded label="Not in the catalog list" />;
                    if (now.version === row.subject_snapshot.version) return <Badge tone="neutral">Unchanged</Badge>;
                    return <Badge tone="info">Version {now.version}{now.active ? '' : ', archived'}</Badge>;
                  },
                },
                { header: 'Pinned version', cell: row => <span className="mono">{row.subject_snapshot.version}</span>, numeric: true },
                { header: 'State', cell: row => (row.active ? <Badge tone="good">Offered</Badge> : <Badge tone="neutral">Retired</Badge>) },
              ]}
              detailLabel={manager ? 'Manage' : 'Details'}
              detail={manager ? (row => (
                <OfferingPanel api={api} offering={row} current={catalog?.find(s => s.id === row.subject_id)} yearStatus={yearStatus} setStatus={setStatus} reload={reload} />
              )) : undefined}
            />
          </>
        )}
      </div>

      <Catalog api={api} manager={manager} setStatus={setStatus} reload={reload} catalog={catalog} adding={adding} setAdding={setAdding} />

      <Callout tone="info" title="Setup, not grading">
        A subject and an offering say what a section takes. Neither carries a weight, a component, a passing mark or a formula, and nothing on this screen computes anything. Grading rules wait on the school’s grading enclosure and sample class records.
      </Callout>

      {offering && section ? (
        <FormSheet
          title={`Offer a subject to ${sectionName(section)}`}
          note="The section keeps the catalog revision chosen here, whatever the catalog says later."
          submitLabel="Offer this subject"
          fields={[
            {
              key: 'subject_id', label: 'Subject',
              options: choosable.length ? choosable.sort((a, b) => a.code.localeCompare(b.code)).map(s => [s.id, `${s.code} — ${s.name}`]) : [['', 'No available subject applies to this grade']],
              hint: `Available catalog subjects that apply to ${gradeName(grade)} and are not already offered here.`,
            },
            { key: 'display_order', label: 'Order in the section', type: 'number', min: 1, max: 999 },
            reasonField,
          ]}
          initial={{ display_order: nextOrder, reason: '' }}
          onSubmit={data => {
            const subject = choosable.find(s => s.id === data.subject_id);
            return api(`/sections/${section.id}/subjects`, 'POST', { subject_id: data.subject_id, subject_version: subject?.version ?? 1, display_order: data.display_order, reason: data.reason });
          }}
          onSaved={() => { setOffering(false); reload(); setStatus({ text: 'Subject offered to the section.', kind: 'done' }); }}
          onClose={() => setOffering(false)}
        />
      ) : null}
    </>
  );
}
