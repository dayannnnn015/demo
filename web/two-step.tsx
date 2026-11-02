import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { message } from './api';
import { QrCode } from './components/qr';
import { Confirm, Sheet } from './components/overlay';
import { StatusLine, idle, type Status } from './components/primitives';

/**
 * Two-step sign-in with an authenticator app, through the sign-in service's
 * own TOTP factors. EDUNEXUS never sees the secret after it is shown once, and
 * holds no code: the service checks it. What EDUNEXUS adds is the rule that
 * an account which turned it on is refused at aal1 by the API itself
 * (`src/core/auth.ts`), so skipping this form gets nobody in.
 */
export type TwoStepAuth = { mfa: Pick<SupabaseClient['auth']['mfa'], 'enroll' | 'challengeAndVerify' | 'listFactors' | 'unenroll' | 'getAuthenticatorAssuranceLevel'> };
/** What My profile needs of the sign-in service: two-step sign-in, and ending the other sessions. */
export type SessionAuth = TwoStepAuth & Pick<SupabaseClient['auth'], 'signOut'>;

/** Whether this session still owes its second step: a verified factor, and only a password used so far. */
export async function owesSecondStep(auth: TwoStepAuth) {
  const { data, error } = await auth.mfa.getAuthenticatorAssuranceLevel();
  return !error && data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

type Problem = { code?: string | undefined; message?: string | undefined; status?: number | undefined } | null | undefined;

/** What the sign-in service's refusal means, in the words of this form. */
export function twoStepProblem(error: Problem) {
  if (!error) return '';
  const code = error.code ?? '';
  if (code === 'mfa_verification_failed' || /invalid totp|invalid code/i.test(error.message ?? '')) return 'That code is not right. Type the six digits your app shows now; they change every 30 seconds, so check the app’s clock matches this computer’s.';
  if (code === 'mfa_challenge_expired') return 'That took too long. Try again with the code your app shows now.';
  if (code === 'mfa_totp_enroll_not_enabled' || code === 'mfa_totp_verify_not_enabled') return 'Two-step sign-in is switched off for this school’s sign-in service. Ask the system operator to turn it on.';
  if (code === 'too_many_enrolled_mfa_factors') return 'This account already has as many authenticators as the sign-in service allows. Turn one off first.';
  if (code === 'insufficient_aal') return 'Sign out and sign in again with your code first, then try again.';
  if (code === 'over_request_rate_limit' || error.status === 429) return 'Too many attempts in a short time. Wait a minute and try again.';
  return error.message || 'The sign-in service did not accept that.';
}

/** The six digits, however they were typed or pasted: "123 456", "123-456" or with a trailing space. */
export const codeOf = (typed: string) => typed.replace(/[\s-]/g, '');
const wellFormed = (code: string) => /^\d{6}$/.test(code);

async function verifiedFactor(auth: TwoStepAuth) {
  const { data, error } = await auth.mfa.listFactors();
  if (error) throw new Error(twoStepProblem(error));
  return data.totp.find(f => f.status === 'verified') ?? null;
}

function CodeField({ value, onChange, id = 'two-step-code' }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>Six-digit code</label>
      <input id={id} className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={9} required value={value}
        onChange={event => onChange(event.target.value.replace(/[^\d\s-]/g, ''))} />
      <span className="hint">From the authenticator app on your phone, under EDUNEXUS.</span>
    </div>
  );
}

/** The second step of signing in, after the password was accepted. */
export function TwoStepSignIn({ auth, onDone, onCancel }: { auth: TwoStepAuth; onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(idle);
  // A ref, not the busy state: Enter pressed twice submits twice before React re-renders, and each would spend an attempt.
  const sending = useRef(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = codeOf(code);
    if (!wellFormed(clean)) { setStatus({ kind: 'error', text: 'Type the six digits your authenticator app shows.' }); return; }
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setStatus({ kind: 'busy', text: 'Checking the code…' });
    try {
      const factor = await verifiedFactor(auth);
      if (!factor) { onDone(); return; }
      const { error } = await auth.mfa.challengeAndVerify({ factorId: factor.id, code: clean });
      if (error) { setCode(''); setStatus({ kind: 'error', text: twoStepProblem(error) }); return; }
      onDone();
    } catch (error) { setStatus({ kind: 'error', text: message(error) }); }
    finally { sending.current = false; setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <StatusLine status={status} />
      <CodeField value={code} onChange={setCode} />
      <div className="form-actions">
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>Use another account</button>
      </div>
      <div className="auth-foot">
        <p>Lost your phone or deleted the app? The system operator can reset your two-step sign-in so you can sign in with your password and set it up again.</p>
      </div>
    </form>
  );
}

const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

/**
 * The setting on My profile: whether two-step sign-in is on, and turning it on
 * or off. Turning it on enrols a factor, shows its QR code and key once, and
 * keeps it only when a code from the app proves it was set up.
 */
export function TwoStepSetting({ auth, onChange }: { auth: TwoStepAuth | undefined; onChange?: (on: boolean) => void }) {
  const [state, setState] = useState<'loading' | 'off' | 'on' | 'unavailable'>('loading');
  const [since, setSince] = useState<string | null>(null);
  const [setting, setSetting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [status, setStatus] = useState<Status>(idle);
  const [busy, setBusy] = useState(false);

  const read = async () => {
    if (!auth) { setState('unavailable'); return; }
    try {
      const factor = await verifiedFactor(auth);
      setState(factor ? 'on' : 'off');
      setSince(factor?.created_at ?? null);
    } catch (error) { setState('unavailable'); setStatus({ kind: 'error', text: message(error) }); }
  };
  useEffect(() => { void read(); }, [auth]);

  const turnOff = async () => {
    if (!auth) return;
    setBusy(true);
    try {
      const factor = await verifiedFactor(auth);
      if (factor) {
        const { error } = await auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw new Error(twoStepProblem(error));
      }
      setStopping(false);
      setStatus({ kind: 'done', text: 'Two-step sign-in is off. You sign in with your password alone.' });
      await read();
      onChange?.(false);
    } catch (error) { setStopping(false); setStatus({ kind: 'error', text: message(error) }); }
    finally { setBusy(false); }
  };

  return (
    <div className="setting" data-tour="profile-two-step">
      <div>
        <b>Two-step sign-in</b>
        <StatusLine status={status} />
        <p className="muted">
          {state === 'on' ? `On${since ? ` since ${new Date(since).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}. Signing in asks for a code from your phone after your password, so a password someone else learns is not enough.`
            : state === 'off' ? 'Off. Turn it on so that a password someone else learns is not enough to sign in as you: you will also type a code from an app on your phone.'
            : state === 'unavailable' ? 'Not available in this view.' : 'Reading…'}
        </p>
      </div>
      {state === 'off' ? <button type="button" className="btn secondary" onClick={() => { setStatus(idle); setSetting(true); }}>Turn on two-step sign-in</button> : null}
      {state === 'on' ? <button type="button" className="btn ghost danger-text" disabled={busy} onClick={() => setStopping(true)}>Turn off</button> : null}
      {setting && auth ? <TwoStepSetup auth={auth} onClose={() => setSetting(false)}
        onDone={() => { setSetting(false); setStatus({ kind: 'done', text: 'Two-step sign-in is on. Next time you sign in, have your phone with you.' }); void read(); onChange?.(true); }} /> : null}
      {stopping ? (
        <Confirm title="Turn off two-step sign-in?" confirmLabel="Turn off" busy={busy} onClose={() => setStopping(false)} onConfirm={() => void turnOff()}
          body="Your password alone will sign you in again. Anyone who learns it could then open the learner records you can see. You can turn it back on at any time." />
      ) : null}
    </div>
  );
}

type Pending = { id: string; uri: string; secret: string };

function TwoStepSetup({ auth, onDone, onClose }: { auth: TwoStepAuth; onDone: () => void; onClose: () => void }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'busy', text: 'Preparing…' });
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const finished = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        // A setup abandoned earlier leaves an unverified factor behind; it is cleared rather than left to collide with this one.
        const listed = await auth.mfa.listFactors();
        for (const stale of listed.data?.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified') ?? []) await auth.mfa.unenroll({ factorId: stale.id });
        const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: `EDUNEXUS ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`, issuer: 'EDUNEXUS' });
        if (error) { setStatus({ kind: 'error', text: twoStepProblem(error) }); return; }
        setPending({ id: data.id, uri: data.totp.uri, secret: data.totp.secret });
        setStatus(idle);
      } catch (error) { setStatus({ kind: 'error', text: message(error) }); }
    })();
  }, [auth]);

  // Closed before the code proved it: the half-made factor is removed, so it never counts as on.
  const close = () => {
    if (pending && !finished.current) void auth.mfa.unenroll({ factorId: pending.id }).catch(() => undefined);
    onClose();
  };

  const sending = useRef(false);
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pending || sending.current) return;
    const clean = codeOf(code);
    if (!wellFormed(clean)) { setStatus({ kind: 'error', text: 'Type the six digits the app shows for EDUNEXUS.' }); return; }
    sending.current = true;
    setBusy(true);
    setStatus({ kind: 'busy', text: 'Checking the code…' });
    try {
      const { error } = await auth.mfa.challengeAndVerify({ factorId: pending.id, code: clean });
      if (error) { setCode(''); setStatus({ kind: 'error', text: twoStepProblem(error) }); return; }
      finished.current = true;
      onDone();
    } catch (error) { setStatus({ kind: 'error', text: message(error) }); }
    finally { sending.current = false; setBusy(false); }
  };

  return (
    <Sheet title="Turn on two-step sign-in" note="You need a phone with an authenticator app, such as Google Authenticator or Microsoft Authenticator. Both are free." onClose={close}>
      <StatusLine status={status} />
      {pending ? (
        <form onSubmit={verify}>
          <ol className="steps">
            <li>Open the authenticator app and add an account. Choose to scan a QR code.</li>
            <li>Scan this code with the phone’s camera.
              <div className="qr-box"><QrCode text={pending.uri} label="QR code to scan with your authenticator app" /></div>
              <button type="button" className="btn ghost small" onClick={() => setShowKey(v => !v)} aria-expanded={showKey}>{showKey ? 'Hide the key' : 'Can’t scan it? Type a key instead'}</button>
              {showKey ? <p className="secret-key"><span className="sr-only">Key: </span><code>{grouped(pending.secret)}</code></p> : null}
            </li>
            <li>Type the six-digit code the app now shows for EDUNEXUS.</li>
          </ol>
          <CodeField id="two-step-setup-code" value={code} onChange={setCode} />
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>{busy ? 'Checking…' : 'Turn on'}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={close}>Cancel</button>
          </div>
          <p className="muted">Keep the key private, like a password. It is shown only now; EDUNEXUS does not keep it.</p>
        </form>
      ) : null}
    </Sheet>
  );
}
