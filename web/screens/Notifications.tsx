import { useEffect, useState } from 'react';
import type { Api, Page, Row } from '../api';
import { message, query } from '../api';
import { available, routes, type Route } from '../routes';
import { Icon } from '../components/icons';
import { Callout, Cell, EmptyState, PageHeader, Table, Unrecorded, type Status } from '../components/primitives';

type Props = { api: Api; me: Row; token: number; route: Route; setStatus: (s: Status) => void };

/**
 * Your own notifications. Nobody else's: the row policy behind this list
 * answers only rows addressed to the caller, so a principal opening it reads
 * their own inbox and not the school's.
 *
 * **No row here names a learner**, and that is the reason this screen has no
 * learner column to add later. Every list under /learners and /enrollments
 * writes a `record_access_events` row naming the records it returned, so a
 * notification that previewed names would put an access row behind every poll
 * of the bell and bury the privacy audit. A notification says what happened and
 * to which class; the screen it points at is the one that logs the disclosure.
 */

/** What each kind says, in the words of the work rather than the column's. */
const says: Record<string, { text: string; goes?: string }> = {
  roster_submitted: { text: 'A class list is waiting to be imported', goes: 'imports' },
  roster_withdrawn: { text: 'A class list was withdrawn before it was decided', goes: 'imports' },
  roster_imported: { text: 'Your class list was imported', goes: 'imports' },
  roster_declined: { text: 'Your class list was declined — it needs correcting', goes: 'imports' },
  learner_placed: { text: 'A learner was placed in a class', goes: 'enrollment' },
  learner_moved: { text: 'A learner was moved between classes', goes: 'enrollment' },
  learner_withdrawn: { text: 'A learner was withdrawn', goes: 'enrollment' },
  learner_reentered: { text: 'A learner re-entered', goes: 'enrollment' },
  learner_unplaced: { text: 'A learner is registered at a grade with no class', goes: 'enrollment' },
  month_submitted: { text: 'A monthly consolidation was submitted', goes: 'months' },
  month_returned: { text: 'Your monthly consolidation was returned', goes: 'months' },
  month_locked: { text: 'A monthly consolidation was locked', goes: 'months' },
  promotion_endorsed: { text: 'Promotion outcomes are waiting for approval', goes: 'report-cards' },
  promotion_approved: { text: 'Your promotion outcomes were approved', goes: 'report-cards' },
  promotion_returned: { text: 'Your promotion outcomes were returned', goes: 'report-cards' },
  adviser_assigned: { text: 'You were made adviser of a class', goes: 'staff' },
  adviser_removed: { text: 'You are no longer adviser of a class', goes: 'staff' },
  calendar_changed: { text: 'The instructional calendar changed', goes: 'calendar' },
  year_activated: { text: 'A school year was activated', goes: 'years' },
  year_closed: { text: 'A school year was closed', goes: 'years' },
  next_year_placed: { text: 'Next year’s classes were completed', goes: 'next-year' },
};

/** The class a notification is about, from the only facts its payload may carry. */
export function describeSubject(payload: Row) {
  const name = payload.section_name ? String(payload.section_name) : '';
  const grade = payload.grade_level === undefined || payload.grade_level === null
    ? '' : Number(payload.grade_level) === 0 ? 'Kindergarten' : `Grade ${String(payload.grade_level)}`;
  return [grade, name].filter(Boolean).join(' — ');
}

/**
 * Where a notification points, when the reader is allowed that screen.
 *
 * `hiddenFor` hides a screen from a role's navigation without changing what the
 * API allows, and `routeFor` answers Overview for a screen a role may not open
 * — so an unconditional link would land a principal on the Overview with no
 * explanation. Roster import is exactly that case: it is `hiddenFor:
 * ['principal']`, because on this school's division of work the administrative
 * officer imports, and the principal is still told a list is waiting. So the
 * link is offered when the screen is theirs to open, and the screen is named in
 * words when it is not.
 */
function pointsAt(kind: string, role: unknown) {
  const goes = says[kind]?.goes;
  const target = goes ? routes.find(r => r.id === goes) : undefined;
  if (!target) return null;
  return { route: target, open: available(target, role) };
}

export function Notifications({ api, me, token, route, setStatus }: Props) {
  const [status, setFilter] = useState<'unread' | 'all'>('unread');
  const [before, setBefore] = useState('');
  const [rows, setRows] = useState<Page | null>(null);
  const [clearing, setClearing] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    setRows(null);
    void api<Page>(`/notifications${query({ status, limit: 25, before_id: before })}`)
      .then(setRows)
      .catch(() => setRows({ items: [] }));
  }, [api, status, before, token, refresh]);

  const show = (next: 'unread' | 'all') => { setBefore(''); setFilter(next); };

  const readOne = async (id: string) => {
    try {
      await api(`/notifications/read`, 'POST', { id });
      setRefresh(n => n + 1);
    } catch (error) { setStatus({ kind: 'error', text: message(error) }); }
  };

  const readAll = async () => {
    setClearing(true);
    try {
      const done = await api<{ marked: number }>(`/notifications/read-all`, 'POST', {});
      setRefresh(n => n + 1);
      setStatus({ kind: 'done', text: done.marked
        ? `Marked ${done.marked} ${done.marked === 1 ? 'notification' : 'notifications'} as read.`
        : 'Nothing was unread.' });
    } catch (error) {
      setStatus({ kind: 'error', text: message(error) });
    } finally { setClearing(false); }
  };

  const items = rows?.items ?? [];
  return (
    <>
      <PageHeader
        route={route}
        actions={
          <button type="button" className="btn secondary" aria-busy={clearing} disabled={clearing || !items.some(r => r.read_at === null)} onClick={() => void readAll()}>
            <Icon name="check" size={15} />{clearing ? 'Marking…' : 'Mark all as read'}
          </button>
        }
      />

      <div className="card">
        <div className="card-head"><div>
          <h2>Your notifications</h2>
          <p className="card-note">Yours alone, and no learner is named in one. Open the screen a notification points at to see the records themselves.</p>
        </div></div>
        <div className="card-tools">
          <div className="segmented" role="group" aria-label="Which notifications to show">
            {([['unread', 'Unread'], ['all', 'Everything']] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={status === key} className={status === key ? 'active' : undefined} onClick={() => show(key)}>{label}</button>
            ))}
          </div>
        </div>
        <Table
          loading={rows === null}
          rows={items}
          rowKey={r => String(r.id)}
          empty={status === 'unread'
            ? <EmptyState title="Nothing unread" body="You are up to date. Choose Everything to see the ones you have already read." />
            : <EmptyState title="No notifications yet" body="When a class list is submitted or decided, or a learner’s class changes, it will appear here." />}
          columns={[
            { header: 'When', cell: r => <span className="mono">{new Date(String(r.created_at)).toLocaleString()}</span> },
            { header: 'What happened', cell: r => {
              const about = describeSubject((r.payload ?? {}) as Row);
              const to = pointsAt(String(r.kind), me.role);
              return (
                <Cell
                  title={says[String(r.kind)]?.text ?? String(r.kind)}
                  meta={<>
                    {about ? <span>{about}</span> : null}
                    {to?.open
                      ? <a href={`#/${to.route.id}`}>{to.route.nav}</a>
                      : to ? <span className="muted">On {to.route.nav}</span> : null}
                  </>}
                />
              );
            } },
            { header: 'Who', cell: r => (r.actor_name
              ? <b>{String(r.actor_name)}</b>
              // Not an em dash and not a blank: a teacher cannot read a
              // manager's staff row, so the name is genuinely not theirs to see.
              : <Unrecorded label="Not shown to you" />) },
            { header: 'Read', cell: r => (r.read_at
              ? <span className="muted">Read</span>
              : <button type="button" className="btn ghost small" onClick={() => void readOne(String(r.id))}>Mark as read</button>) },
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

      <Callout tone="info" title="What is notified, and what is not">
        EDUNEXUS notifies you about work that has moved: a class list submitted or decided, a learner’s class changed, a consolidation or an outcome sent on. It does <b>not</b> notify anyone about a learner’s absences — the school has no approved alert rule, and the system will not invent one. Nor does it notify on routine recording: a mark, a score, an opened record or a saved draft stays on its own screen and in the activity and access logs.
      </Callout>
    </>
  );
}
