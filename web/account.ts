import { createClient } from '@supabase/supabase-js';
import { mountWorkspace, type Api } from './workspace.js';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const message = (text: string) => { element('message').textContent = text; };
const show = (id: string) => {
  for (const name of ['signin', 'set-password', 'mfa', 'success']) element(name).hidden = name !== id;
};
const form = (id: string, fn: () => Promise<void>) => element<HTMLFormElement>(id).addEventListener('submit', event => {
  event.preventDefault();
  const button = element<HTMLFormElement>(id).querySelector('button')!;
  button.disabled = true;
  void fn().catch(error => message(error instanceof Error ? error.message : 'The request failed. Please try again.')).finally(() => { button.disabled = false; });
});

async function main() {
  // Read fragment credentials once and immediately remove them from browser
  // history. Supabase keeps the session in memory only on this developer page.
  const fragment = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  const response = await fetch('/account/config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Account setup is temporarily unavailable.');
  const config = await response.json() as { url: string; publishableKey: string };
  const client = createClient(config.url, config.publishableKey, { auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true } });
  let factorId = '';
  let disposeWorkspace: (() => void) | undefined;
  const clearWorkspace = () => {
    disposeWorkspace?.(); disposeWorkspace = undefined;
    document.body.classList.remove('workspace-open');
    element<HTMLImageElement>('qr').removeAttribute('src');
  };
  const api: Api = async <T>(path: string, method = 'GET', payload?: Record<string, unknown>): Promise<T> => {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new Error('Please sign in again.');
    const result = await fetch(`/api/v1${path}`, {
      method, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}), cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
    const body = await result.json();
    if (!result.ok) {
      const text = [body.error?.message ?? 'The request failed.', ...(body.error?.fields ?? []).map((field: { path: string; message: string }) => `${field.path}: ${field.message}`)].join('\n');
      if (result.status === 401 || body.error?.code === 'STAFF_ACCESS_REQUIRED') { clearWorkspace(); show('signin'); message('Your session or access has ended. Please sign in again.'); }
      throw new Error(text);
    }
    return body.data as T;
  };
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { clearWorkspace(); show('signin'); element('signout').hidden = true; }
  });

  async function verifyBackend() {
    const me = await api<Record<string, unknown>>('/me');
    element('identity').textContent = `${me.display_name} — ${String(me.role).replaceAll('_', ' ')}`;
    show('success');
    message('Signed in securely. Changes you save here update the development database.');
    element('signout').hidden = false;
    disposeWorkspace?.();
    document.body.classList.add('workspace-open');
    disposeWorkspace = mountWorkspace(element('workspace'), api, me);
  }
  async function beginMfa() {
    element('signout').hidden = false;
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (assurance.data.currentLevel === 'aal2') { await verifyBackend(); return; }
    const factors = await client.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const existing = factors.data.totp.find(f => f.status === 'verified');
    element<HTMLImageElement>('qr').hidden = true;
    if (existing) {
      factorId = existing.id;
      element('mfa-help').textContent = 'Enter the current code from your authenticator app.';
    } else {
      // Remove only incomplete enrollments belonging to this signed-in user.
      for (const pending of factors.data.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
        const removed = await client.auth.mfa.unenroll({ factorId: pending.id });
        if (removed.error) throw removed.error;
      }
      const enrollment = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'EDUNEXUS authenticator' });
      if (enrollment.error) throw enrollment.error;
      factorId = enrollment.data.id;
      element<HTMLImageElement>('qr').src = enrollment.data.totp.qr_code;
      element<HTMLImageElement>('qr').hidden = false;
      element('mfa-help').textContent = 'Scan the QR code with your authenticator app, then enter its six-digit code. Keep access to this authenticator for future sign-ins.';
    }
    show('mfa');
    message('Verify your authenticator to continue.');
  }
  // Recovery uses the publishable key exactly as a browser would. The API holds
  // no privileged Auth credential, so it cannot and does not send this itself.
  element('recover').addEventListener('click', () => {
    const button = element<HTMLButtonElement>('recover');
    const address = element<HTMLInputElement>('email').value.trim();
    if (!address) { message('Enter your school email address first.'); return; }
    button.disabled = true;
    void client.auth.resetPasswordForEmail(address, { redirectTo: `${location.origin}/account/setup` })
      // The same wording regardless of outcome: whether an address is registered
      // is not something an unauthenticated visitor should be able to probe.
      .then(() => { message('If that address has an account, a recovery link is on its way. Open it on this device to set a new password.'); })
      .catch(() => { message('If that address has an account, a recovery link is on its way. Open it on this device to set a new password.'); })
      .finally(() => { button.disabled = false; });
  });
  form('signin', async () => {
    const input = element<HTMLInputElement>('password');
    const { error } = await client.auth.signInWithPassword({ email: element<HTMLInputElement>('email').value.trim(), password: input.value });
    input.value = '';
    if (error) throw error;
    await beginMfa();
  });
  form('set-password', async () => {
    const password = element<HTMLInputElement>('new-password');
    const confirmation = element<HTMLInputElement>('confirm-password');
    if (password.value !== confirmation.value) throw new Error('The passwords do not match.');
    const { error } = await client.auth.updateUser({ password: password.value });
    password.value = ''; confirmation.value = '';
    if (error) throw error;
    await beginMfa();
  });
  form('mfa', async () => {
    const code = element<HTMLInputElement>('code');
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: code.value });
    code.value = '';
    if (error) throw error;
    element<HTMLImageElement>('qr').removeAttribute('src');
    await verifyBackend();
  });
  element('signout').addEventListener('click', () => {
    void client.auth.signOut().then(({ error }) => {
      if (error) { message(error.message); return; }
      element('signout').hidden = true;
      show('signin');
      message('Signed out.');
    });
  });
  if (fragment.get('error_description')) throw new Error('This invitation is invalid or expired. Request a new invitation from your administrator.');
  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await client.auth.setSession({ access_token, refresh_token });
    fragment.delete('access_token'); fragment.delete('refresh_token');
    if (error) throw error;
    show('set-password');
    message('Invitation accepted. Set a password for future sign-ins.');
    element('signout').hidden = false;
  } else {
    show('signin');
    message('Use the staff account authorized for this development system.');
  }
}
void main().catch(error => { show('signin'); message(error instanceof Error ? error.message : 'Account setup failed.'); });
