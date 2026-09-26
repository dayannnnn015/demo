import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError, type Api, type Row } from './api';
import { AppShell } from './components/AppShell';
import { BrandMark } from './components/brand';
import { PageHeader, StatusLine, idle, yearName, type Status } from './components/primitives';
import { routeFor } from './routes';
import './styles/app.css';

/**
 * The workspace over `npm run demo`: the real shell and screens against a
 * local API holding only synthetic records. Sign-in is replaced by choosing a
 * synthetic staff member, whose identifier is the bearer token that API
 * accepts. This page is never part of the production build, which bundles
 * `index.html` alone, and the identifiers mean nothing to the real API.
 */
const people: [string, string, string][] = [
  ['00000000-0000-4000-8000-000000000001', 'Demo Principal', 'Manages every record'],
  ['00000000-0000-4000-8000-000000000002', 'Demo Administrative Officer', 'Manages learner records'],
  ['00000000-0000-4000-8000-000000000003', 'Demo Adviser, Grade 1', 'Has two weeks of attendance and some scores'],
  ['00000000-0000-4000-8000-000000000004', 'Demo Adviser, Grade 2', 'Has an empty register'],
];

const demoApi = (token: string): Api => async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.error ?? {};
    throw new ApiError(response.status, error.code ?? 'REQUEST_FAILED', error.message ?? 'The request failed.', error.fields ?? []);
  }
  return payload.data as T;
};

const currentHash = () => location.hash.replace(/^#\/?/, '').replace(/\?.*$/, '') || 'overview';

function Demo() {
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem('edunexus-demo-as') ?? ''; } catch { return ''; } });
  const [me, setMe] = useState<Row | null>(null);
  const [page, setPage] = useState(currentHash);
  const [status, setStatus] = useState<Status>(idle);
  const [tick, setTick] = useState(0);
  const [year, setYear] = useState<Row | null>(null);
  const [school, setSchool] = useState<Row | null>(null);
  const api = useMemo(() => demoApi(token), [token]);

  useEffect(() => {
    const sync = () => setPage(currentHash());
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => {
    try { if (token) sessionStorage.setItem('edunexus-demo-as', token); else sessionStorage.removeItem('edunexus-demo-as'); } catch { /* A private window. */ }
    if (!token) { setMe(null); return; }
    void api<Row>('/me').then(setMe).catch(() => setToken(''));
  }, [api, token]);
  useEffect(() => {
    if (!me) return;
    void api<{ items: Row[] }>('/academic-years').then(r => setYear(r.items.find(y => y.status === 'active') ?? null)).catch(() => setYear(null));
    void api<Row>('/school').then(setSchool).catch(() => setSchool(null));
  }, [api, me, tick]);

  if (!me) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="brand-mark"><BrandMark size={30} /></span>
            <span className="brand-text"><b>EDUNEXUS<span className="tag-dev">Demo</span></b><span>Synthetic records only</span></span>
          </div>
          <h1>Choose who to be</h1>
          <p className="auth-lede">This is a local demonstration. Every learner, mark and school detail in it is invented, and it disappears when the demo stops.</p>
          <div className="demo-people">
            {people.map(([id, name, note]) => (
              <button key={id} type="button" className="btn secondary demo-person" onClick={() => setToken(id)}>
                <b>{name}</b><span>{note}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const manager = me.role !== 'teacher';
  const route = routeFor(page, manager);
  const navigate = (id: string) => { location.hash = `#/${id}`; setPage(id); setStatus(idle); setTick(t => t + 1); };
  return (
    <AppShell
      me={me}
      school={school}
      current={route}
      context={year ? `${yearName(year)} school year` : 'No active school year'}
      contextTone={year ? 'active' : 'none'}
      onNavigate={navigate}
      onSignOut={() => { setToken(''); location.hash = ''; }}
    >
      {route.ownHeader ? null : <PageHeader route={route} />}
      <StatusLine status={status} />
      {route.render({ api, me, manager, setStatus, reload: () => setTick(t => t + 1), token: tick, route })}
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
