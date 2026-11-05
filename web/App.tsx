import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError, createApi, message, rememberMe, sessionStore, type Page, type Row } from './api';
import { Account, PasswordChange } from './Account';
import { AppShell } from './components/AppShell';
import { BrandMark } from './components/brand';
import { Sheet } from './components/overlay';
import { PageHeader, StatusLine, idle, yearName, type Status } from './components/primitives';
import { available, hiddenByAssignment, routeFor, routes } from './routes';
import { applyPreferences, followDevice, startScreen, type Preferences } from './preferences';

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
  /** The address and last sign-in on the open session, for My profile to show. */
  const [signedInAs, setSignedInAs] = useState<{ email: string | null; lastSignIn: string | null }>();
  const [school, setSchool] = useState<Row | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/account/config', { cache: 'no-store' });
        if (!response.ok) throw new Error('The sign-in service is unavailable. Try again shortly.');
        const config = await response.json() as { url: string; publishableKey: string };
        setClient(createClient(config.url, config.publishableKey, {
          auth: {
            // The tab's own store by default, so a shared staffroom browser leaves no
            // session behind; "Keep me signed in" on the sign-in page is what moves it
            // somewhere that outlives the tab. See `sessionStore` in web/api.ts.
            persistSession: true,
            storage: sessionStore,
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
    // A link in a sentence changes the address directly; the last screen's message must not follow it to the next.
    let shown = currentHash();
    const sync = () => { const next = currentHash(); if (next !== shown) setStatus(idle); shown = next; setPage(next); };
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
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (attempt: number) => void api<Row>('/me').then(row => {
      if (stopped) return;
      setFatal('');
      setMe(row);
      // Signing in with nothing in the address opens the screen chosen on My profile.
      const start = startScreen((row.profile as Row | null)?.landing, location.hash, id => routes.some(r => r.id === id && available(r, row.role)));
      if (start) { location.hash = `#/${start}`; setPage(start); }
    }).catch(error => {
      if (stopped) return;
      // A busy minute, a server hiccup or a dropped connection is not a lost
      // session: try again rather than sending the person back to sign in.
      const passing = !(error instanceof ApiError) || error.status === 429 || error.status >= 500;
      if (passing && attempt < 4) { setFatal(`${message(error)} Trying again…`); timer = setTimeout(() => read(attempt + 1), 5000 * (attempt + 1)); return; }
      setFatal(message(error)); lost();
    });
    read(0);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [signedIn, api, lost]);

  // What the person chose on My profile, applied to the whole page; signing out puts the defaults back,
  // so a shared machine does not show the next person someone else's dark theme or large text.
  const profile = me?.profile as Preferences | null | undefined;
  useEffect(() => { applyPreferences(profile ?? null); }, [profile]);
  useEffect(() => followDevice(), []);

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
    // From the session already open in this tab: nothing is fetched and
    // nothing is kept.
    void client?.auth.getSession()
      .then(({ data }) => setSignedInAs({
        email: data.session?.user.email ?? null,
        lastSignIn: data.session?.user.last_sign_in_at ?? null,
      }))
      .catch(() => setSignedInAs(undefined));
  }, [me, api, client, token]);

  // Screens this person's own classes rule out; `hiddenByAssignment` holds
  // the rule and why. Only a teacher is read for, so nothing else costs a request.
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (!me || !api || me.role !== 'teacher') { setHidden([]); return; }
    let live = true;
    void api<Page<{ grade_level: number }>>('/sections?limit=100')
      .then(page => { if (live) setHidden(hiddenByAssignment(me.role, page.items.map(s => Number(s.grade_level)))); })
      .catch(() => { if (live) setHidden([]); });
    return () => { live = false; };
  }, [me, api, token]);

  // Retrying the staff record after a passing failure shows why, rather than a sign-in form.
  if (!client || !api || (signedIn && !me && fatal)) {
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
  const route = routeFor(page, me.role);
  const account = {
    updateMe: (patch: Row) => setMe(current => (current ? { ...current, ...patch } : current)),
    changePassword: () => setChangingPassword(true), auth: client.auth, signedInAs,
  };
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
      hidden={hidden}
      current={route}
      context={year ? `${yearName(year)} school year` : 'No active school year'}
      contextTone={year ? 'active' : 'none'}
      onNavigate={navigate}
      // Signing out leaves the workspace for the school's front page; the session is ended first, so the way back is a fresh sign-in.
      // Signing out forgets the choice too, so the next person at this computer starts
      // with the box unticked rather than inheriting somebody else's.
      onSignOut={() => { rememberMe(false); void client.auth.signOut().finally(() => location.assign('/')); }}
      onChangePassword={() => setChangingPassword(true)}
    >
      {route.ownHeader ? null : <PageHeader route={route} />}
      <StatusLine status={status} />
      {route.render({ api, me, manager, setStatus, reload: () => setToken(t => t + 1), token, route, account })}
      {changingPassword ? (
        <Sheet title="Change your password" note="You will be asked for the one you use now." onClose={() => setChangingPassword(false)}>
          <PasswordChange auth={client.auth} onDone={text => { setChangingPassword(false); setStatus({ text, kind: 'done' }); }} />
        </Sheet>
      ) : null}
    </AppShell>
  );
}
