import { useState } from 'react';
import type { Api, Row } from './api';
import { StatusLine, idle, sentence, type Status } from './ui';
import { School, Years, YearScoped } from './screens/Setup';
import { Activity, Invitations, Staff } from './screens/Staff';
import { Learners } from './screens/Learners';

const managerTabs = ['School', 'School years', 'Reporting periods', 'Sections', 'Learners', 'Staff', 'Invitations', 'Activity'] as const;
const teacherTabs = ['School', 'School years', 'Reporting periods', 'Sections', 'Learners'] as const;

export function Workspace({ api, me, onSignOut }: { api: Api; me: Row; onSignOut: () => void }) {
  const manager = me.role !== 'teacher';
  const tabs = manager ? managerTabs : teacherTabs;
  const [page, setPage] = useState<string>('School');
  const [status, setStatus] = useState<Status>(idle);
  // Bumping this refetches the active screen after a save.
  const [token, setToken] = useState(0);
  const reload = () => setToken(t => t + 1);
  const select = (tab: string) => { setPage(tab); setStatus(idle); reload(); };

  const shared = { api, setStatus, reload, token };
  return (
    <main className="wide">
      <div className="card">
        <small>Balili Elementary School · Development system</small>
        <h1>EDUNEXUS</h1>
        <p>{String(me.display_name)} — {sentence(String(me.role))}</p>
        <nav aria-label="Workspace">
          {tabs.map(tab => (
            <button key={tab} type="button" aria-current={tab === page ? 'page' : 'false'} onClick={() => select(tab)}>{tab}</button>
          ))}
        </nav>
        <h2>{page}</h2>
        <StatusLine status={status} />
        {page === 'School' ? <School {...shared} manager={manager} /> : null}
        {page === 'School years' ? <Years {...shared} manager={manager} /> : null}
        {page === 'Reporting periods' || page === 'Sections'
          ? <YearScoped {...shared} manager={manager} page={page as 'Reporting periods' | 'Sections'} /> : null}
        {page === 'Learners' ? <Learners {...shared} manager={manager} /> : null}
        {page === 'Staff' && manager ? <Staff {...shared} me={me} /> : null}
        {page === 'Invitations' && manager ? <Invitations {...shared} /> : null}
        {page === 'Activity' && manager ? <Activity api={api} token={token} /> : null}
        <div className="actions">
          <button type="button" className="inline secondary" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </main>
  );
}
