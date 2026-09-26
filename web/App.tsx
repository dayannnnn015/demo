import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApi, message, type Page, type Row } from './api';
import { Account } from './Account';
import { AppShell } from './components/AppShell';
import { BrandMark } from './components/brand';
import { PageHeader, StatusLine, idle, yearName, type Status } from './components/primitives';
import { routeFor } from './routes';

// A screen may carry its own filter after `?`, as the access log does; the route is what precedes it.
const currentHash = () => location.hash.replace(/^#\/?/, '').replace(/\?.*$/, '') || 'overview';

export function App() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [me, setMe] = useState<Row | null>(null);
  const [fatal, setFatal] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [page, setPage] = useState(currentHash);
  const [status, setStatus] = useState<Status>(idle);
  const [token, setToken] = useState(0);
  const [year, setYear] = useState<Row | null>(null);
  const [school, setSchool] = useState<Row | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/account/config', { cache: 'no-store' });
        if (!response.ok) throw new Error('The sign-in service is unavailable. Try again shortly.');
        const config = await response.json() as { url: string; publishableKey: string };
        setClient(createClient(config.url, config.publishableKey, {
          auth: {
            // sessionStorage survives a refresh but dies with the tab, so a shared
            // staffroom browser does not leave a session behind after closing it.
            persistSession: true,
            storage: window.sessionStorage,
            storageKey: 'edunexus-session',
            detectSessionInUrl: true,
            autoRefreshToken: true,
          },
        }));
      } catch (error) { setFatal(message(error)); }
    })();
  }, []);

  // The address bar follows the screen, so a refresh lands where you were.
  useEffect(() => {
    const sync = () => setPage(currentHash());
    addEventListener('hashchange', sync);
    return () => removeEventListener('hashchange', sync);
  }, []);

  const lost = useCallback(() => { setMe(null); setSignedIn(false); }, []);
  const api = useMemo(() => (client ? createApi(client, lost) : null), [client, lost]);

  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') lost(); });
    return () => data.subscription.unsubscribe();
  }, [client, lost]);

  useEffect(() => {
    if (!signedIn || !api) return;
    void api<Row>('/me').then(setMe).catch(error => { setFatal(message(error)); lost(); });
  }, [signedIn, api, lost]);

  // The shell's own furniture: the year the top bar names, and the school the
  // rail names. Both are read here rather than by every screen that mentions
  // them, and both are named from their records rather than from a literal —
  // this is the same school name printed on every official form, and activating
  // a year or renaming the school must not leave the wrong one in the frame.
  //
  // Keyed on `token`, which also advances on navigation, so these re-read more
  // often than they change. That is the cheaper mistake: two small reads
  // against a stale name sitting above every screen until a reload.
  useEffect(() => {
    if (!me || !api) return;
    void api<Page>('/academic-years')
      .then(r => setYear(r.items.find(y => y.status === 'active') ?? null))
      .catch(() => setYear(null));
    void api<Row>('/school').then(setSchool).catch(() => setSchool(null));
  }, [me, api, token]);

  if (!client || !api) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="brand-mark"><BrandMark size={28} /></span>
            <span className="brand-text">
              <b>EDUNEXUS<span className="tag-dev">Dev</span></b>
              <span>Balili Elementary School</span>
            </span>
          </div>
          <StatusLine status={{ text: fatal || 'Connecting to the sign-in service…', kind: fatal ? 'error' : 'busy' }} />
        </div>
      </div>
    );
  }
  if (!me) return <Account client={client} onReady={() => { setFatal(''); setSignedIn(true); }} />;

  const manager = me.role !== 'teacher';
  const route = routeFor(page, manager);
  const navigate = (id: string) => {
    location.hash = `#/${id}`;
    setPage(id);
    setStatus(idle);
    setToken(t => t + 1);
  };

  return (
    <AppShell
      me={me}
      school={school}
      current={route}
      context={year ? `${yearName(year)} school year` : 'No active school year'}
      contextTone={year ? 'active' : 'none'}
      onNavigate={navigate}
      onSignOut={() => void client.auth.signOut()}
    >
      {route.ownHeader ? null : <PageHeader route={route} />}
      <StatusLine status={status} />
      {route.render({ api, me, manager, setStatus, reload: () => setToken(t => t + 1), token, route })}
    </AppShell>
  );
}
