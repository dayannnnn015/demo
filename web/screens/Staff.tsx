import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { query } from '../api';
import { actionName, fieldNames, isJournal, recordName } from '../activity';
import type { Route } from '../routes';
import { Icon } from '../components/icons';
import {
  Badge, Callout, Cell, Editor, EmptyState, FormSheet, PageHeader, Pager, Select, Table, Task,
  Unrecorded, sentence, value, type Field, type Status,
} from '../components/primitives';

type Props = { api: Api; me?: Row; setStatus: (s: Status) => void; reload: () => void; token: number; route: Route };

const roles: [string, string][] = [['teacher', 'Teacher'], ['administrative_officer', 'Administrative officer'], ['principal', 'Principal']];
const nameField: Field = { key: 'display_name', label: 'Full name', maxLength: 150 };
/** A reason is 10–500 characters and belongs in a box that admits a sentence. */
const reasonField: Field = { key: 'reason', label: 'Reason', type: 'textarea', minLength: 10, maxLength: 500, wide: true, hint: 'Kept in the permanent record of this change.' };
const idField: Field = { key: 'user_id', label: 'Supabase Auth user ID', pattern: '[0-9a-fA-F-]{36}', wide: true };

export function Staff({ api, me, setStatus, reload, token, route }: Props & { me: Row }) {
  const [rows, setRows] = useState<Page | null>(null);
  const [offset, setOffset] = useState(0);
  const [granting, setGranting] = useState(false);
  useEffect(() => { setRows(null); void api<Page>(`/staff${query({ limit: 25, offset })}`).then(setRows).catch(() => setRows({ items: [] })); }, [api, offset, token]);
  const allowed = me.role === 'principal' ? roles : roles.slice(0, 1);

  return (
    <>
      <PageHeader
        route={route}
        actions={<button type="button" className="btn" onClick={() => setGranting(true)}><Icon name="plus" size={15} />Grant access</button>}
      />

      <div className="card">
        <div className="card-head"><div>
          <h2>People with access</h2>
          <p className="card-note">Suspending blocks someone immediately without deleting anything they recorded.</p>
        </div></div>
        <Table
          loading={rows === null}
          rows={rows?.items ?? []}
          rowKey={r => String(r.user_id)}
          empty={<EmptyState title="No staff yet" body="Grant access to an account the operator already created, or request an invitation for a colleague." />}
          columns={[
            { header: 'Name', cell: r => <b>{value(r, 'display_name')}</b> },
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

      {granting ? (
        <FormSheet
          title="Grant access to an existing account"
          note="For an identity the operator already created in Supabase. To start from scratch, use Invitations instead."
          submitLabel="Grant access"
          fields={[idField, nameField, { key: 'role', label: 'Permission level', options: allowed }]}
          onSubmit={data => api('/staff', 'POST', data)}
          onSaved={() => { setGranting(false); reload(); setStatus({ text: 'Access granted.', kind: 'done' }); }}
          onClose={() => setGranting(false)}
        />
      ) : null}
    </>
  );
}

export function Invitations({ api, me, setStatus, reload, token, route }: Props) {
  // An older API omits the flag; only an explicit false hides the action.
  const canCreate = me?.account_service !== false;
  const [rows, setRows] = useState<Page | null>(null);
  const [status, setFilter] = useState('requested');
  const [asking, setAsking] = useState(false);
  useEffect(() => { setRows(null); void api<Page>(`/staff-invitations${query({ status, limit: 50 })}`).then(setRows).catch(() => setRows({ items: [] })); }, [api, status, token]);

  return (
    <>
      <PageHeader
        route={route}
        actions={<button type="button" className="btn" onClick={() => setAsking(true)}><Icon name="plus" size={15} />Request an invitation</button>}
      />

      {canCreate ? (
        <Callout tone="info" title="How an invitation works">
          Record who should get an account, then open the request and create it. Your colleague is emailed an invitation and chooses their own password.
        </Callout>
      ) : (
        <Callout tone="attention" title="Accounts are created by the operator here">
          This deployment has no account service configured, so EDUNEXUS cannot create an account itself. Record the request, ask the system operator to create the identity, then link it with the ID they give you.
        </Callout>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Invitations</h2>
          <div className="field inline">
            <label className="label" htmlFor="invite-filter">Show</label>
            <Select id="invite-filter" value={status} onChange={e => setFilter(e.target.value)}>
              {[['requested', 'Waiting on the operator'], ['provisioned', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([key, text]) => (
                <option key={key} value={key}>{text}</option>
              ))}
            </Select>
          </div>
        </div>
        <Table
          loading={rows === null}
          rows={rows?.items ?? []}
          rowKey={r => String(r.id)}
          empty={<EmptyState title="Nothing in this state" body="Requests you record appear here until the operator creates the account." />}
          columns={[
            { header: 'Email', cell: r => <span className="mono">{value(r, 'email')}</span> },
            { header: 'Name', cell: r => <b>{value(r, 'display_name')}</b> },
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
                {/* Three whole forms used to sit open on top of each other here,
                    so the two nobody wanted were always in the way of the one
                    they did. Each is now folded away until it is chosen. */}
                {canCreate ? (
                  <Task title="Create the account" note="Sends an invitation email">
                    <Editor submitLabel="Create the account" setStatus={setStatus} onSaved={reload}
                      fields={[{ ...reasonField, hint: 'An invitation email goes to this address and they choose their own password.' }]}
                      onSubmit={data => api(`/staff-invitations/${row.id}/identity`, 'POST', { ...data, version: row.version })} />
                  </Task>
                ) : null}
                <Task title="Link an account the operator made by hand" note="Needs the Supabase Auth user ID">
                  <Editor submitLabel="Link the account" setStatus={setStatus} onSaved={reload}
                    fields={[{ ...idField, hint: 'Only needed when the operator created the identity in Supabase by hand.' }, reasonField]}
                    onSubmit={data => api(`/staff-invitations/${row.id}/provision`, 'POST', { ...data, version: row.version })} />
                </Task>
                <Task title="Cancel this invitation" note="Kept as a record" tone="warn">
                  <Editor submitLabel="Cancel invitation" setStatus={setStatus} onSaved={reload}
                    fields={[reasonField]}
                    onSubmit={data => api(`/staff-invitations/${row.id}/cancellation`, 'POST', { ...data, version: row.version })} />
                </Task>
              </>
            );
          }}
        />
      </div>

      {asking ? (
        <FormSheet
          title="Request an invitation"
          note="Recorded so the request, who made it and why stay traceable."
          submitLabel="Record request"
          fields={[
            { key: 'email', label: 'School email address', type: 'email', maxLength: 254 },
            nameField,
            { key: 'role', label: 'Permission level', options: roles },
            reasonField,
          ]}
          onSubmit={data => api('/staff-invitations', 'POST', data)}
          onSaved={() => { setAsking(false); reload(); setStatus({ text: 'Invitation request recorded.', kind: 'done' }); }}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}

export function Activity({ api, token }: { api: Api; token: number }) {
  const [rows, setRows] = useState<Page | null>(null);
  const [before, setBefore] = useState('');
  const [staff, setStaff] = useState<Row[]>([]);
  useEffect(() => { setRows(null); void api<Page>(`/audit-events${query({ limit: 25, before_id: before })}`).then(setRows).catch(() => setRows({ items: [] })); }, [api, before, token]);
  useEffect(() => { void api<Page>(`/staff${query({ limit: 100 })}`).then(r => setStaff(r.items)).catch(() => setStaff([])); }, [api, token]);
  return (
    <div className="card">
      <div className="card-head"><div>
        <h2>Recorded changes</h2>
        <p className="card-note">Field names only. Values, learner names and credentials are never copied here. A reviewed change also writes its own history entry, so it appears twice.</p>
      </div></div>
      <Table
        loading={rows === null}
        rows={rows?.items ?? []}
        rowKey={r => String(r.id)}
        empty={<EmptyState title="No activity yet" body="Every change made in EDUNEXUS is recorded here automatically." />}
        columns={[
          { header: 'When', cell: r => <span className="mono">{new Date(String(r.occurred_at)).toLocaleString()}</span> },
          { header: 'Record', cell: r => <Cell title={recordName(String(r.entity_table))} meta={<code>{value(r, 'entity_table')}</code>} /> },
          { header: 'Action', cell: r => (isJournal(String(r.entity_table)) ? <Badge tone="neutral">History entry</Badge> : actionName(r)) },
          { header: 'By', cell: r => {
            const who = staff.find(s => s.user_id === r.actor_user_id);
            return who ? String(who.display_name) : <Unrecorded label="Not on the staff list" />;
          } },
          { header: 'Fields changed', cell: r => {
            const fields = fieldNames(r.changed_fields);
            return fields.length ? fields.join(', ') : <Unrecorded label="None listed" />;
          } },
        ]}
      />
      <div className="pager">
        <span>25 per page, newest first</span>
        <div className="pager-nav">
          <button type="button" className="btn secondary small" disabled={!before} onClick={() => setBefore('')}>Newest</button>
          <button type="button" className="btn secondary small" disabled={!rows?.pagination?.next_before_id} onClick={() => setBefore(String(rows!.pagination!.next_before_id))}>Older</button>
        </div>
      </div>
    </div>
  );
}
