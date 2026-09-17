import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import { Editor, OffsetPager, Table, sentence, value, type Field, type Status } from '../ui';

const roles: [string, string][] = [['teacher', 'Teacher'], ['administrative_officer', 'Administrative officer'], ['principal', 'Principal']];
const name: Field = { key: 'display_name', label: 'Full name', maxLength: 150 };

export function Staff({ api, me, setStatus, reload, token }: {
  api: Api; me: Row; setStatus: (s: Status) => void; reload: () => void; token: number;
}) {
  const [rows, setRows] = useState<Page>({ items: [] });
  const [offset, setOffset] = useState(0);
  useEffect(() => { void api<Page>(`/staff${query({ limit: 25, offset })}`).then(setRows).catch(() => setRows({ items: [] })); }, [api, offset, token]);
  const allowed = me.role === 'principal' ? roles : roles.slice(0, 1);
  return (
    <>
      <p>Access for accounts that already exist in Supabase Auth. To invite someone new, use the Invitations tab.</p>
      <Table rows={rows.items} rowKey={r => String(r.user_id)} columns={[
        { header: 'Name', cell: r => value(r, 'display_name') },
        { header: 'Role', cell: r => sentence(value(r, 'role')) },
        { header: 'Access', cell: r => (r.active ? 'Active' : 'Suspended') },
      ]} detail={row => {
        if (me.role !== 'principal' && row.role !== 'teacher') return <p className="empty">Principal access required.</p>;
        const fields: Field[] = [name];
        if (row.user_id !== me.user_id) fields.push(
          { key: 'role', label: 'Role', options: allowed },
          { key: 'active', label: 'Access', options: [['true', 'Active'], ['false', 'Suspended']] },
        );
        return <Editor title="Update staff" fields={fields} initial={row} setStatus={setStatus} onSaved={reload}
          onSubmit={data => api(`/staff/${row.user_id}`, 'PATCH', { ...data, ...('active' in data ? { active: data.active === 'true' } : {}), version: row.version })} />;
      }} />
      <OffsetPager offset={offset} count={rows.items.length} hasMore={Boolean(rows.pagination?.has_more)} onChange={setOffset} />
      <Editor title="Authorize an existing account" setStatus={setStatus} onSaved={reload}
        fields={[{ key: 'user_id', label: 'Supabase Auth user ID', pattern: '[0-9a-fA-F-]{36}' }, name, { key: 'role', label: 'Role', options: allowed }]}
        onSubmit={data => api('/staff', 'POST', data)} />
    </>
  );
}

export function Invitations({ api, setStatus, reload, token }: {
  api: Api; setStatus: (s: Status) => void; reload: () => void; token: number;
}) {
  const [rows, setRows] = useState<Page>({ items: [] });
  const [status, setFilter] = useState('requested');
  useEffect(() => { void api<Page>(`/staff-invitations${query({ status, limit: 50 })}`).then(setRows).catch(() => setRows({ items: [] })); }, [api, status, token]);
  return (
    <>
      <p>
        EDUNEXUS records the invitation; it does not create the account or send the email.
        The deployment operator provisions the identity in Supabase and returns its user ID, which you paste below to grant school access.
      </p>
      <label>Show
        <select value={status} onChange={e => setFilter(e.target.value)}>
          {[['requested', 'Awaiting the operator'], ['provisioned', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([key, text]) => (
            <option key={key} value={key}>{text}</option>
          ))}
        </select>
      </label>
      <Table rows={rows.items} rowKey={r => String(r.id)} empty="No invitations in this state." columns={[
        { header: 'Email', cell: r => value(r, 'email') },
        { header: 'Name', cell: r => value(r, 'display_name') },
        { header: 'Role', cell: r => sentence(value(r, 'role')) },
        { header: 'State', cell: r => sentence(value(r, 'status')) },
      ]} detailLabel="Open" actionsLabel="Actions" detail={row => {
        if (row.status !== 'requested') return <p className="empty">Completed and cancelled invitations are read-only.</p>;
        return (
          <>
            <Editor title="Record the provisioned identity" submitLabel="Grant school access" setStatus={setStatus} onSaved={reload}
              fields={[{ key: 'user_id', label: 'Supabase Auth user ID', pattern: '[0-9a-fA-F-]{36}', help: 'From the operator, after they invite this address in Supabase.' },
                { key: 'reason', label: 'Reason', minLength: 10, maxLength: 500 }]}
              onSubmit={data => api(`/staff-invitations/${row.id}/provision`, 'POST', { ...data, version: row.version })} />
            <Editor title="Cancel this request" submitLabel="Cancel invitation" setStatus={setStatus} onSaved={reload}
              fields={[{ key: 'reason', label: 'Reason', minLength: 10, maxLength: 500 }]}
              onSubmit={data => api(`/staff-invitations/${row.id}/cancellation`, 'POST', { ...data, version: row.version })} />
          </>
        );
      }} />
      <Editor title="Request an invitation" submitLabel="Record request" setStatus={setStatus} onSaved={reload}
        fields={[
          { key: 'email', label: 'School email address', type: 'email', maxLength: 254 },
          { key: 'display_name', label: 'Full name', maxLength: 150 },
          { key: 'role', label: 'Permission level', options: roles },
          { key: 'reason', label: 'Reason', minLength: 10, maxLength: 500 },
        ]}
        onSubmit={data => api('/staff-invitations', 'POST', data)} />
    </>
  );
}

export function Activity({ api, token }: { api: Api; token: number }) {
  const [rows, setRows] = useState<Page>({ items: [] });
  const [before, setBefore] = useState('');
  useEffect(() => { void api<Page>(`/audit-events${query({ limit: 25, before_id: before })}`).then(setRows).catch(() => setRows({ items: [] })); }, [api, before, token]);
  return (
    <>
      <p>Changes are recorded automatically. This log cannot be edited.</p>
      <Table rows={rows.items} rowKey={r => String(r.id)} columns={[
        { header: 'Time', cell: r => new Date(String(r.occurred_at)).toLocaleString() },
        { header: 'Record', cell: r => value(r, 'entity_table') },
        { header: 'Action', cell: r => value(r, 'operation') },
        { header: 'Changed fields', cell: r => (Array.isArray(r.changed_fields) ? r.changed_fields.join(', ') : '') },
        { header: 'Actor ID', cell: r => value(r, 'actor_user_id') },
      ]} />
      <div className="actions">
        {before ? <button type="button" className="inline" onClick={() => setBefore('')}>Newest activity</button> : null}
        {rows.pagination?.next_before_id ? <button type="button" className="inline" onClick={() => setBefore(String(rows.pagination!.next_before_id))}>Older activity</button> : null}
      </div>
    </>
  );
}
