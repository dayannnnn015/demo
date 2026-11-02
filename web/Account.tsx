import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { message } from './api';
import { BrandMark } from './components/brand';
import { Icon } from './components/icons';
import { StatusLine, type Status, idle } from './components/primitives';
import { TwoStepSignIn, owesSecondStep } from './two-step';

type Stage = 'loading' | 'signin' | 'two-step' | 'set-password' | 'ready';

/**
 * A password field that can be read back.
 *
 * Hiding what was typed defends against someone standing behind you, which in
 * a staffroom is a real threat — and so is mistyping a twelve-character
 * password twice on a shared keyboard. The toggle lets the person decide which
 * risk they are in, which is the only way that judgement can be made correctly.
 */
function Password({ id, name = id, label, hint, autoComplete, value, onChange }: {
  id: string;
  /** What a password manager files the value under; it needs a name as well as an id. */
  name?: string;
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
          name={name}
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
 * Tells the browser that this email and password just worked, so its own
 * password manager offers to save them, or to update the one it holds (decision
 * D1a). Chrome and Edge are told directly; Firefox and Safari find out from the
 * named fields and the submitted form. EDUNEXUS keeps nothing: the password goes
 * only to the browser's store, and the session still ends with the tab.
 */
export function offerToSave(email: string, password: string) {
  const Credential = (globalThis as { PasswordCredential?: new (data: { id: string; password: string }) => globalThis.Credential }).PasswordCredential;
  if (!Credential || !email || !password || !globalThis.navigator?.credentials?.store) return;
  // A refusal or a dismissed prompt changes nothing about the sign-in.
  void globalThis.navigator.credentials.store(new Credential({ id: email, password })).catch(() => undefined);
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
          setEmail(data.session.user?.email ?? '');
          if (arrival === 'invite' || arrival === 'recovery') {
            setStage('set-password');
            setStatus(idle);
            return;
          }
          // A refresh, or the API's TWO_STEP_REQUIRED, with only the password given so far: ask for the code.
          if (await owesSecondStep(client.auth)) { if (!cancelled) { setStage('two-step'); setStatus(idle); } return; }
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
      {/* The front page's painted hillside, from this origin. It shows no person; the words are the school's. */}
      <section className="auth-art">
        <picture>
          <source media="(max-width: 760px)" srcSet="/images/hero-balili-v1-phone.webp" type="image/webp" />
          <img src="/images/hero-balili-v1-1200.webp" width="1200" height="533" alt="" decoding="async" />
        </picture>
        <div className="auth-art-copy">
          <p className="auth-gov">Republic of the Philippines · Department of Education</p>
          <p className="auth-school">Balili Elementary School</p>
          <p className="auth-place">La Trinidad, Benguet</p>
        </div>
      </section>
      <main className="auth-panel">
      <a className="auth-back" href="/">← The school’s front page</a>
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><BrandMark size={30} /></span>
          <span className="brand-text">
            <b>EDUNEXUS<span className="tag-dev">Dev</span></b>
            <span>Balili Elementary School</span>
          </span>
        </div>

        {stage === 'two-step' ? (
          <>
            <h1>Enter your code</h1>
            <p className="auth-lede">Your account uses two-step sign-in. Open the authenticator app on your phone and type the code it shows for EDUNEXUS.</p>
          </>
        ) : stage === 'set-password' ? (
          <>
            <h1>Choose a password</h1>
            <p className="auth-lede">This finishes setting up your account. You will use it to sign in from now on.</p>
          </>
        ) : (
          <>
            <h1>Sign in to EDUNEXUS</h1>
            <p className="auth-lede">Use the school email address your account was created with.</p>
          </>
        )}

        <StatusLine status={status} />

        {stage === 'signin' ? (
          <form method="post" onSubmit={submit(async () => {
            const address = email.trim();
            const { error } = await client.auth.signInWithPassword({ email: address, password });
            if (error) { setPassword(''); throw error; }
            // The password was right, so the browser may keep it, even before a two-step code is asked for.
            offerToSave(address, password);
            setPassword('');
            if (await owesSecondStep(client.auth)) { setStage('two-step'); setStatus(idle); return; }
            finish();
          })}>
            <div className="field">
              <label className="label" htmlFor="email">School email</label>
              <input id="email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={e => setEmail(e.target.value)} />
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
              <p>Your browser can save your password. You stay signed in until this tab is closed, so on a shared computer, close the tab when you are done.</p>
              <p>Accounts are created by the school, not self-registered.</p>
            </div>
          </form>
        ) : null}

        {stage === 'two-step' ? (
          <TwoStepSignIn auth={client.auth} onDone={finish}
            onCancel={() => { void client.auth.signOut().finally(() => { setStage('signin'); setStatus(idle); }); }} />
        ) : null}

        {stage === 'set-password' ? (
          <form onSubmit={submit(async () => {
            if (newPassword !== confirmation) throw new Error('The two passwords do not match.');
            const { error } = await client.auth.updateUser({ password: newPassword });
            if (error) { setNewPassword(''); setConfirmation(''); throw error; }
            offerToSave(email, newPassword);
            setNewPassword(''); setConfirmation('');
            finish();
          })}>
            {/* Whose password this is, for the browser's password manager; the person need not type it. */}
            <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
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
      </main>
    </div>
  );
}

/** The three Supabase calls a password change needs, so a test can stand in for the service. */
export type PasswordAuth = Pick<SupabaseClient['auth'], 'getUser' | 'signInWithPassword' | 'updateUser'>;

/** What the sign-in service's refusal means, in the words of this form. */
export function passwordProblem(error: { code?: string | undefined; message?: string | undefined } | null | undefined) {
  if (!error) return '';
  if (error.code === 'same_password') return 'The new password must be different from the one you use now.';
  if (error.code === 'weak_password') return 'The sign-in service found that password too easy to guess. Choose a longer one, or one that is not a common word or phrase.';
  if (error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit') return 'Too many attempts in a short time. Wait a minute and try again.';
  return error.message || 'The sign-in service did not accept the change.';
}

/**
 * Changing the password of the account already signed in.
 *
 * The project does not make Supabase ask for the current password — secure
 * password change is off — so anyone who finds a staffroom machine left signed
 * in could otherwise replace it and lock its owner out. The form therefore
 * signs in again with the current password before it changes anything. That
 * is a check in the browser, not a control: the operator should also switch on
 * secure password change, which is recorded in the status.
 */
export function PasswordChange({ auth, onDone }: { auth: PasswordAuth; onDone: (text: string) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(idle);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next.length < 12) { setStatus({ kind: 'error', text: 'The new password needs at least 12 characters.' }); return; }
    if (next !== confirmation) { setStatus({ kind: 'error', text: 'The two new passwords do not match.' }); return; }
    if (next === current) { setStatus({ kind: 'error', text: 'The new password must be different from the one you use now.' }); return; }
    setBusy(true);
    setStatus({ kind: 'busy', text: 'Checking your current password…' });
    try {
      const { data, error } = await auth.getUser();
      const email = data.user?.email;
      if (error || !email) throw new Error('Your session could not be read. Sign out, sign in again, then retry.');
      const check = await auth.signInWithPassword({ email, password: current });
      setCurrent('');
      if (check.error) { setStatus({ kind: 'error', text: check.error.code === 'invalid_credentials' ? 'That is not your current password.' : passwordProblem(check.error) }); return; }
      const changed = await auth.updateUser({ password: next });
      if (changed.error) { setStatus({ kind: 'error', text: passwordProblem(changed.error) }); return; }
      // So the browser's saved password follows the change, rather than filling the old one next time.
      offerToSave(email, next);
      setNext(''); setConfirmation('');
      onDone('Password changed. Use the new one the next time you sign in.');
    } catch (error) {
      setStatus({ kind: 'error', text: message(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      <StatusLine status={status} />
      <Password id="current-password" label="Current password" autoComplete="current-password" value={current} onChange={setCurrent} />
      <Password id="changed-password" label="New password" hint="At least 12 characters." autoComplete="new-password" value={next} onChange={setNext} />
      <Password id="changed-confirmation" label="Confirm new password" autoComplete="new-password" value={confirmation} onChange={setConfirmation} />
      <div className="form-actions">
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </div>
      <p className="muted">Your password is held by the sign-in service, never by EDUNEXUS. Other devices stay signed in until their session ends.</p>
    </form>
  );
}
