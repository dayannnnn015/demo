import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { message } from './api';
import { BrandMark } from './components/brand';
import { Icon } from './components/icons';
import { StatusLine, type Status, idle } from './components/primitives';

type Stage = 'loading' | 'signin' | 'set-password' | 'ready';

/**
 * A password field that can be read back.
 *
 * Hiding what was typed defends against someone standing behind you, which in
 * a staffroom is a real threat — and so is mistyping a twelve-character
 * password twice on a shared keyboard. The toggle lets the person decide which
 * risk they are in, which is the only way that judgement can be made correctly.
 */
function Password({ id, label, hint, autoComplete, value, onChange }: {
  id: string;
  label: string;
  hint?: string;
  autoComplete: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <span className="password-wrap">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={autoComplete === 'new-password' ? 12 : undefined}
          required
          value={value}
          onChange={event => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-peek"
          aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'}
          onClick={() => setShown(v => !v)}
        >
          <Icon name={shown ? 'eye-off' : 'eye'} size={16} />
        </button>
      </span>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/**
 * Sign-in and invitation completion.
 * Supabase owns passwords and refresh tokens; this only drives its client.
 */
export function Account({ client, onReady }: { client: SupabaseClient; onReady: () => void }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [status, setStatus] = useState<Status>({ text: 'Connecting to the sign-in service…', kind: 'busy' });
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const fail = (error: unknown) => setStatus({ text: message(error), kind: 'error' });

  function finish() {
    setStage('ready');
    setStatus(idle);
    onReady();
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Invitation and recovery links arrive in the fragment. Read once, then
        // drop it from history so the token is not left in the address bar.
        const fragment = new URLSearchParams(location.hash.slice(1));
        const arrival = fragment.get('type');
        if (arrival) history.replaceState(null, '', location.pathname);
        const { data } = await client.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          if (arrival === 'invite' || arrival === 'recovery') {
            setStage('set-password');
            setStatus(idle);
            return;
          }
          finish();
          return;
        }
        setStage('signin');
        setStatus(idle);
      } catch (error) { if (!cancelled) { setStage('signin'); fail(error); } }
    })();
    return () => { cancelled = true; };
  }, [client]);

  const submit = (run: () => Promise<void>) => async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await run(); } catch (error) { fail(error); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><BrandMark size={30} /></span>
          <span className="brand-text">
            <b>EDUNEXUS<span className="tag-dev">Dev</span></b>
            <span>Balili Elementary School</span>
          </span>
        </div>

        {stage === 'set-password' ? (
          <>
            <h1>Choose a password</h1>
            <p className="auth-lede">This finishes setting up your account. You will use it to sign in from now on.</p>
          </>
        ) : (
          <>
            <h1>Sign in</h1>
            <p className="auth-lede">Use the school email address your account was created with.</p>
          </>
        )}

        <StatusLine status={status} />

        {stage === 'signin' ? (
          <form onSubmit={submit(async () => {
            const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
            setPassword('');
            if (error) throw error;
            finish();
          })}>
            <div className="field">
              <label className="label" htmlFor="email">School email</label>
              <input id="email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <Password id="password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
              <button type="button" className="btn ghost" disabled={busy} onClick={async () => {
                const address = email.trim();
                if (!address) { setStatus({ text: 'Enter your school email first.', kind: 'error' }); return; }
                setBusy(true);
                const result = await client.auth.resetPasswordForEmail(address, { redirectTo: `${location.origin}/account/setup` })
                  .catch(error => ({ error } as { error: { code?: string; status?: number } }));
                setBusy(false);
                // Supabase answers 200 for an unknown address but throttles a
                // registered one, so a per-address rate limit would reveal that
                // the account exists. It therefore gets the same reply as
                // success. A disabled provider is project-wide and identical
                // for every address, so that one is safe to name.
                const code = result.error?.code ?? '';
                const throttled = code === 'over_email_send_rate_limit' || result.error?.status === 429;
                if (result.error && !throttled) {
                  setStatus({ kind: 'error', text:
                    code === 'email_provider_disabled'
                      ? 'Email sign-in is switched off for this project, so no recovery link can be sent. The system operator must enable the Email provider in Supabase.'
                      : 'The recovery service did not accept the request. Tell the system operator if this keeps happening.' });
                  return;
                }
                setStatus({ kind: 'done', text: 'If that address has an account, a recovery link is on its way. Only one link is sent a minute, so check your inbox and spam folder before asking for another.' });
              }}>Email a recovery link</button>
            </div>
            <div className="auth-foot">
              <p>Accounts are created by the school, not self-registered. The reply to a recovery request is the same whether or not an account exists.</p>
            </div>
          </form>
        ) : null}

        {stage === 'set-password' ? (
          <form onSubmit={submit(async () => {
            if (newPassword !== confirmation) throw new Error('The two passwords do not match.');
            const { error } = await client.auth.updateUser({ password: newPassword });
            setNewPassword(''); setConfirmation('');
            if (error) throw error;
            finish();
          })}>
            <Password id="new-password" label="New password" hint="At least 12 characters." autoComplete="new-password" value={newPassword} onChange={setNewPassword} />
            <Password id="confirm-password" label="Confirm password" autoComplete="new-password" value={confirmation} onChange={setConfirmation} />
            <div className="form-actions">
              <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
            </div>
            <div className="auth-foot">
              <p>Your password is held by the sign-in service, never by EDUNEXUS. Nobody at the school can read it back to you.</p>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
