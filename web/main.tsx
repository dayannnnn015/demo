import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createApi, message, type Row } from './api';
import { Account } from './Account';
import { Workspace } from './Workspace';
import { StatusLine } from './ui';
import './styles.css';

function App() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [me, setMe] = useState<Row | null>(null);
  const [fatal, setFatal] = useState('');
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/account/config', { cache: 'no-store' });
        if (!response.ok) throw new Error('Account setup is temporarily unavailable.');
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

  if (fatal && !client) return <main><div className="card"><h1>EDUNEXUS</h1><StatusLine status={{ text: fatal, kind: 'error' }} /></div></main>;
  if (!client || !api) return <main><div className="card"><h1>EDUNEXUS</h1><StatusLine status={{ text: 'Connecting to the identity service…', kind: 'busy' }} /></div></main>;
  if (!me) return <Account client={client} onReady={() => { setFatal(''); setSignedIn(true); }} />;
  return <Workspace api={api} me={me} onSignOut={() => void client.auth.signOut()} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
