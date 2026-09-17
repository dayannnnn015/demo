import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { message } from './api';
import { StatusLine, type Status, idle } from './ui';

type Stage = 'loading' | 'signin' | 'set-password' | 'mfa' | 'ready';

/**
 * Sign-in, invitation completion and authenticator verification.
 * Supabase owns passwords, refresh tokens and MFA; this only drives its client.
 */
export function Account({ client, onReady }: { client: SupabaseClient; onReady: () => void }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [status, setStatus] = useState<Status>({ text: 'Connecting to the identity service…', kind: 'busy' });
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
      setHelp('Enter the current code from your authenticator app.');
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
      setHelp('Scan this code with your authenticator app, then enter the six digits it shows.');
    }
    setStage('mfa');
    setStatus({ text: 'Verify your authenticator to continue.', kind: 'idle' });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Invitation and recovery links arrive in the fragment. Read once, then
        // drop it from history so the token is not left in the address bar.
        const fragment = new URLSearchParams(location.hash.slice(1));
        const recovery = fragment.get('type');
        history.replaceState(null, '', location.pathname);
        const { data } = await client.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          if (recovery === 'invite' || recovery === 'recovery') {
            setStage('set-password');
            setStatus({ text: 'Set a password to finish setting up your account.', kind: 'idle' });
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

  return (
    <main>
      <div className="card">
        <small>Balili Elementary School · Development system</small>
        <h1>EDUNEXUS account setup</h1>
        {stage === 'signin' || stage === 'loading'
          ? <p>Sign in or finish your invitation, then verify your authenticator to open your school workspace.</p>
          : null}
        <StatusLine status={status} />

        {stage === 'signin' ? (
          <form onSubmit={submit(async () => {
            const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
            setPassword('');
            if (error) throw error;
            await beginMfa();
          })}>
            <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
            <button type="submit" disabled={busy}>Sign in</button>
            <button type="button" className="secondary" disabled={busy} onClick={async () => {
              const address = email.trim();
              if (!address) { setStatus({ text: 'Enter your school email address first.', kind: 'error' }); return; }
              setBusy(true);
              // Recovery runs from the browser with the publishable key; the API
              // holds no credential that could send it.
              const result = await client.auth.resetPasswordForEmail(address, { redirectTo: `${location.origin}/account/setup` })
                .catch(error => ({ error } as { error: { code?: string; status?: number } }));
              setBusy(false);
              // Supabase answers 200 even for an unknown address, so a failure
              // here is never about the address and can be shown. Anything
              // unrecognized still falls back to a generic line, which keeps the
              // form useless for discovering which addresses are registered.
              if (result.error) {
                const code = result.error.code ?? '';
                setStatus({ kind: 'error', text:
                  code === 'email_provider_disabled'
                    ? 'Email sign-in is switched off for this project, so no recovery link can be sent. The system operator must enable the Email provider in Supabase.'
                    : code === 'over_email_send_rate_limit' || result.error.status === 429
                      ? 'Too many recovery requests from this project. Wait a few minutes and try again.'
                      : 'The recovery service did not accept the request. Tell the system operator if this keeps happening.' });
                return;
              }
              // Identical for any address that reaches this point, so the form
              // cannot be used to discover which addresses are registered.
              setStatus({ text: 'If that address has an account, a recovery link is on its way. Open it on this device to set a new password.', kind: 'done' });
            }}>Email me a recovery link</button>
            <small>Enter your school email above first. The reply is the same whether or not the account exists.</small>
          </form>
        ) : null}

        {stage === 'set-password' ? (
          <form onSubmit={submit(async () => {
            if (newPassword !== confirmation) throw new Error('The passwords do not match.');
            const { error } = await client.auth.updateUser({ password: newPassword });
            setNewPassword(''); setConfirmation('');
            if (error) throw error;
            await beginMfa();
          })}>
            <h2>Set your password</h2>
            <label>New password<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
            <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
            <small>Use at least 12 characters. You will enroll an authenticator next.</small>
            <button type="submit" disabled={busy}>Save password</button>
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
            <h2>Authenticator verification</h2>
            {qr ? <img className="qr" src={qr} alt="Scan this QR code using your authenticator app" /> : null}
            <p>{help}</p>
            <label>Six-digit code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} /></label>
            <button type="submit" disabled={busy}>Verify account</button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
