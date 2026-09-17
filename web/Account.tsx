import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { message } from './api';
import { StatusLine, type Status, idle } from './components/primitives';

type Stage = 'loading' | 'signin' | 'set-password' | 'mfa' | 'ready';

const steps: [Stage, string][] = [['signin', 'Sign in'], ['set-password', 'Password'], ['mfa', 'Authenticator']];

/**
 * Sign-in, invitation completion and authenticator verification.
 * Supabase owns passwords, refresh tokens and MFA; this only drives its client.
 */
export function Account({ client, onReady }: { client: SupabaseClient; onReady: () => void }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [status, setStatus] = useState<Status>({ text: 'Connecting to the sign-in service…', kind: 'busy' });
  const [qr, setQr] = useState('');
  const [help, setHelp] = useState('');
  const [busy, setBusy] = useState(false);
  const factor = useRef('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');

  const fail = (error: unknown) => setStatus({ text: message(error), kind: 'error' });

  async function beginMfa() {
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (assurance.data.currentLevel === 'aal2') { setStage('ready'); onReady(); return; }
    const factors = await client.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const existing = factors.data.totp.find(f => f.status === 'verified');
    if (existing) {
      factor.current = existing.id;
      setQr('');
      setHelp('Enter the current six-digit code from your authenticator app.');
    } else {
      // Remove only this user's own incomplete enrollments before starting again.
      for (const pending of factors.data.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
        const removed = await client.auth.mfa.unenroll({ factorId: pending.id });
        if (removed.error) throw removed.error;
      }
      const enrollment = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'EDUNEXUS authenticator' });
      if (enrollment.error) throw enrollment.error;
      factor.current = enrollment.data.id;
      setQr(enrollment.data.totp.qr_code);
      setHelp('Scan this with your authenticator app, then enter the six digits it shows.');
    }
    setStage('mfa');
    setStatus(idle);
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
            setStatus({ text: 'Choose a password to finish setting up your account.', kind: 'idle' });
            return;
          }
          await beginMfa();
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

  const index = steps.findIndex(([id]) => id === stage);
  return (
    <div className="entry">
      <div className="entry-card">
        <div className="entry-head">
          <strong>EDUNEXUS</strong>
          <span>Balili Elementary School · Development system</span>
        </div>
        <div className="entry-body">
          {stage !== 'loading' ? (
            <ol className="entry-steps">
              {steps.map(([id, label], i) => (
                <li key={id} data-state={index === i ? 'current' : index > i ? 'done' : 'ahead'}>
                  {label}{i < steps.length - 1 ? <span className="sep">›</span> : null}
                </li>
              ))}
            </ol>
          ) : null}

          <StatusLine status={status} />

          {stage === 'signin' ? (
            <form onSubmit={submit(async () => {
              const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
              setPassword('');
              if (error) throw error;
              await beginMfa();
            })}>
              <div className="field">
                <label className="label" htmlFor="email">School email</label>
                <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="password">Password</label>
                <input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
              </div>
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
              <p className="hint" style={{ marginTop: 'var(--s4)', color: 'var(--ink-500)', fontSize: 'var(--text-xs)' }}>
                Accounts are created by the school, not self-registered. Recovery links are limited to one a minute, and the reply is the same whether or not an account exists.
              </p>
            </form>
          ) : null}

          {stage === 'set-password' ? (
            <form onSubmit={submit(async () => {
              if (newPassword !== confirmation) throw new Error('The two passwords do not match.');
              const { error } = await client.auth.updateUser({ password: newPassword });
              setNewPassword(''); setConfirmation('');
              if (error) throw error;
              await beginMfa();
            })}>
              <div className="field">
                <label className="label" htmlFor="new-password">New password</label>
                <input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                <span className="hint">At least 12 characters.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="confirm-password">Confirm password</label>
                <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={e => setConfirmation(e.target.value)} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
              </div>
            </form>
          ) : null}

          {stage === 'mfa' ? (
            <form onSubmit={submit(async () => {
              const challenge = await client.auth.mfa.challenge({ factorId: factor.current });
              if (challenge.error) throw challenge.error;
              const verified = await client.auth.mfa.verify({ factorId: factor.current, challengeId: challenge.data.id, code });
              setCode('');
              if (verified.error) throw verified.error;
              setStage('ready');
              onReady();
            })}>
              {qr ? <img className="qr" src={qr} alt="Set-up code for your authenticator app" /> : null}
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-700)' }}>{help}</p>
              <div className="field">
                <label className="label" htmlFor="code">Six-digit code</label>
                <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn" disabled={busy}>{busy ? 'Checking…' : 'Verify and continue'}</button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
