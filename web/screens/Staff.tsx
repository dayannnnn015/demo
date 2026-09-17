import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import { Badge, Callout, Editor, EmptyState, Pager, Table, sentence, value, type Field, type Status } from '../components/primitives';

type Props = { api: Api; me?: Row; setStatus: (s: Status) => void; reload: () => void; token: number };

const roles: [string, string][] = [['teacher', 'Teacher'], ['administrative_officer', 'Administrative officer'], ['principal', 'Principal']];
const nameField: Field = { key: 'display_name', label: 'Full name', maxLength: 150 };
const reasonField: Field = { key: 'reason', label: 'Reason', minLength: 10, maxLength: 500, hint: 'Kept in the permanent record of this change.' };

export function Staff({ api, me, setStatus, reload, token }: Props & { me: Row }) {
  const [rows, setRows] = useState<Page | null>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => { setRows(null); void api<Page>(`/staff${query({ limit: 25, offset })}`).then(setRows).catch(() => setRows({ items: [] })); }, [api, offset, token]);
  const allowed = me.role === 'principal' ? roles : roles.slice(0, 1);
  return (
    <>
      <div className="card">
        <div className="card-head"><div><h2>People with access</h2><p>Suspending someone blocks them immediately, without deleting anything they recorded.</p></div></div>
        <Table
          loading={rows === null}
          rows={rows?.items ?? []}
          rowKey={r => String(r.user_id)}
          empty={<EmptyState title="No staff yet" body="Authorize an account below, or request an invitation for a colleague." />}
          columns={[
            { header: 'Name', cell: r => value(r, 'display_name') },
            { header: 'Permission level', cell: r => sentence(value(r, 'role')) },
            { header: 'Access', cell: r => r.active ? <Badge tone="good">Active</Badge> : <Badge tone="stopped">Suspended</Badge> },
          ]}
          detail={row => {
            if (me.role !== 'principal' && row.role !== 'teacher') return <p className="muted">Only a principal can change an administrative account.</p>;
            const fields: Field[] = [nameField];
            if (row.user_id !== me.user_id) fields.push(
              { key: 'role', label: 'Permission level', options: allowed },
              { key: 'active', label: 'Access', options: [['true', 'Active'], ['false', 'Suspended']] },
            );
            return (
              <>
                {row.user_id === me.user_id ? <p className="muted">You cannot change your own permission level or access.</p> : null}
                <Editor fields={fields} initial={row} setStatus={setStatus} onSaved={reload}
                  onSubmit={data => api(`/staff/${row.user_id}`, 'PATCH', { ...data, ...('active' in data ? { active: data.active === 'true' } : {}), version: row.version })} />
              </>
            );
          }}
        />
        <Pager offset={offset} count={rows?.items.length ?? 0} hasMore={Boolean(rows?.pagination?.has_more)} onChange={setOffset} />
      </div>

      <div className="card">
        <div className="card-head"><div><h2>Authorize an existing account</h2><p>For an identity the operator has already created in Supabase. To start from scratch, use Invitations instead.</p></div></div>
        <div className="card-body">
          <Editor submitLabel="Grant access" setStatus={setStatus} onSaved={reload}
            fields={[{ key: 'user_id', label: 'Supabase Auth user ID', pattern: '[0-9a-fA-F-]{36}' }, nameField, { key: 'role', label: 'Permission level', options: allowed }]}
            onSubmit={data => api('/staff', 'POST', data)} />
        </div>
      </div>
    </>
  );
}

export function Invitations({ api, setStatus, reload, token }: Props) {
  const [rows, setRows] = useState<Page | null>(null);
  const [status, setFilter] = useState('requested');
  useEffect(() => { setRows(null); void api<Page>(`/staff-invitations${query({ status, limit: 50 })}`).then(setRows).catch(() => setRows({ items: [] })); }, [api, status, token]);
  return (
    <>
      <Callout tone="info" title="How an invitation works">
        You record who should get an account. The deployment operator creates the identity in Supabase and sends the email, then returns its user ID for you to enter below. EDUNEXUS never creates accounts itself.
      </Callout>

      <div className="card">
        <div className="card-head">
          <div><h2>Invitations</h2><p>Requests waiting on the operator, and the ones already completed.</p></div>
          <div className="field" style={{ margin: 0, minWidth: 200 }}>
            <label className="label" htmlFor="invite-filter">Show</label>
            <select id="invite-filter" value={status} onChange={e => setFilter(e.target.value)}>
              {[['requested', 'Waiting on the operator'], ['provisioned', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([key, text]) => (
                <option key={key} value={key}>{text}</option>
              ))}
            </select>
          </div>
        </div>
        <Table
          loading={rows === null}
          rows={rows?.items ?? []}
          rowKey={r => String(r.id)}
          empty={<EmptyState title="Nothing in this state" body="Requests you record appear here until the operator creates the account." />}
          columns={[
            { header: 'Email', cell: r => value(r, 'email') },
            { header: 'Name', cell: r => value(r, 'display_name') },
            { header: 'Permission level', cell: r => sentence(value(r, 'role')) },
            { header: 'State', cell: r => r.status === 'provisioned'
              ? <Badge tone="good">Completed</Badge>
              : r.status === 'cancelled' ? <Badge tone="neutral">Cancelled</Badge> : <Badge tone="attention">Waiting</Badge> },
          ]}
          detailLabel="Open"
          detail={row => {
            if (row.status !== 'requested') return <p className="muted">Completed and cancelled invitations are kept as a record and cannot be changed.</p>;
            return (
              <>
                <Editor submitLabel="Grant school access" setStatus={setStatus} onSaved={reload}
                  fields={[{ key: 'user_id', label: 'Supabase Auth user ID', pattern: '[0-9a-fA-F-]{36}', hint: 'From the operator, once they have invited this address.' }, reasonField]}
                  onSubmit={data => api(`/staff-invitations/${row.id}/provision`, 'POST', { ...data, version: row.version })} />
                <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: 'var(--s5) 0' }} />
                <Editor submitLabel="Cancel invitation" setStatus={setStatus} onSaved={reload}
                  fields={[reasonField]}
                  onSubmit={data => api(`/staff-invitations/${row.id}/cancellation`, 'POST', { ...data, version: row.version })} />
              </>
            );
          }}
        />
      </div>

      <div className="card">
        <div className="card-head"><div><h2>Request an invitation</h2><p>Recorded here so the request, who made it and why are all traceable.</p></div></div>
        <div className="card-body">
          <Editor submitLabel="Record request" setStatus={setStatus} onSaved={reload}
            fields={[
              { key: 'email', label: 'School email address', type: 'email', maxLength: 254 },
              nameField,
              { key: 'role', label: 'Permission level', options: roles },
              reasonField,
            ]}
            onSubmit={data => api('/staff-invitations', 'POST', data)} />
        </div>
      </div>
    </>
  );
}

export function Activity({ api, token }: { api: Api; token: number }) {
  const [rows, setRows] = useState<Page | null>(null);
  const [before, setBefore] = useState('');
  useEffect(() => { setRows(null); void api<Page>(`/audit-events${query({ limit: 25, before_id: before })}`).then(setRows).catch(() => setRows({ items: [] })); }, [api, before, token]);
  return (
    <div className="card">
      <div className="card-head"><div><h2>Recorded changes</h2><p>Field names only. Values, learner names and credentials are never copied into this log.</p></div></div>
      <Table
        loading={rows === null}
        rows={rows?.items ?? []}
        rowKey={r => String(r.id)}
        empty={<EmptyState title="No activity yet" body="Every change made in EDUNEXUS is recorded here automatically." />}
        columns={[
          { header: 'When', cell: r => new Date(String(r.occurred_at)).toLocaleString() },
          { header: 'Record', cell: r => <code style={{ fontSize: 'var(--text-xs)' }}>{value(r, 'entity_table')}</code> },
          { header: 'Action', cell: r => sentence(value(r, 'operation')) },
          { header: 'Fields changed', cell: r => Array.isArray(r.changed_fields) ? r.changed_fields.join(', ') : <span className="muted">—</span> },
        ]}
      />
      <div className="pager">
        <button type="button" className="btn ghost small" disabled={!before} onClick={() => setBefore('')}>Newest</button>
        <span>25 per page</span>
        <button type="button" className="btn ghost small" disabled={!rows?.pagination?.next_before_id} onClick={() => setBefore(String(rows!.pagination!.next_before_id))}>Older</button>
      </div>
    </div>
  );
}
