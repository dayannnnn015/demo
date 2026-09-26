// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { byLabel, byText, click, fill, mount } from './helpers/dom';
import { PasswordChange, passwordProblem, type PasswordAuth } from '../web/Account';
import { AppShell } from '../web/components/AppShell';
import { routes } from '../web/routes';

/**
 * Supabase owns the password, so these stand in for its three calls and
 * record what the form asked of them. What matters is the order: nothing is
 * changed until the current password has been accepted, and a form that
 * refuses its own input spends no request at all.
 */
function fakeAuth({ current = 'current-password-1', update = null as { code: string; message: string } | null } = {}) {
  const calls: string[] = [];
  const auth = {
    async getUser() { calls.push('getUser'); return { data: { user: { email: 'synthetic@example.test' } }, error: null }; },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      calls.push(`signIn ${email}`);
      return password === current
        ? { data: {}, error: null }
        : { data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } };
    },
    async updateUser({ password }: { password: string }) { calls.push(`update ${password}`); return { data: {}, error: update }; },
  } as unknown as PasswordAuth;
  return { auth, calls };
}

describe('changing the signed-in password', () => {
  let unmount: (() => Promise<void>) | null = null;
  afterEach(async () => { await unmount?.(); unmount = null; document.body.innerHTML = ''; });

  const show = async (auth: PasswordAuth, done: string[] = []) => {
    const view = await mount(createElement(PasswordChange, { auth, onDone: text => { done.push(text); } }));
    unmount = view.unmount;
    return view.host;
  };
  const submit = async (host: HTMLElement, current: string, next: string, confirmation = next) => {
    await fill(byLabel(host, 'Current password'), current);
    await fill(byLabel(host, 'New password'), next);
    await fill(byLabel(host, 'Confirm new password'), confirmation);
    await click(byText(host, 'Change password'));
  };

  it('checks the current password, then changes it', async () => {
    const { auth, calls } = fakeAuth();
    const done: string[] = [];
    const host = await show(auth, done);
    await submit(host, 'current-password-1', 'a-longer-new-password');
    expect(calls).toEqual(['getUser', 'signIn synthetic@example.test', 'update a-longer-new-password']);
    expect(done[0]).toContain('Password changed');
  });

  it('changes nothing when the current password is wrong', async () => {
    const { auth, calls } = fakeAuth();
    const done: string[] = [];
    const host = await show(auth, done);
    await submit(host, 'not-the-password', 'a-longer-new-password');
    expect(calls.some(c => c.startsWith('update'))).toBe(false);
    expect(done).toEqual([]);
    expect(host.textContent).toContain('That is not your current password.');
    expect(byLabel(host, 'Current password')?.value, 'the rejected password is not kept on screen').toBe('');
  });

  it('refuses a short, mismatched or unchanged password without asking the service', async () => {
    const { auth, calls } = fakeAuth();
    const host = await show(auth);
    // The browser's own minLength stops this one before the form's check runs.
    await submit(host, 'current-password-1', 'short');
    expect(host.textContent).not.toContain('Password changed');
    await submit(host, 'current-password-1', 'a-longer-new-password', 'a-different-password');
    expect(host.textContent).toContain('do not match');
    await submit(host, 'current-password-1', 'current-password-1');
    expect(host.textContent).toContain('must be different');
    expect(calls).toEqual([]);
  });

  it('says what the service refused, in the form’s own words', async () => {
    const { auth } = fakeAuth({ update: { code: 'weak_password', message: 'Password is known to be weak' } });
    const host = await show(auth);
    await submit(host, 'current-password-1', 'password1234');
    expect(host.textContent).toContain('too easy to guess');
    expect(passwordProblem({ code: 'same_password' })).toContain('must be different');
    expect(passwordProblem({ code: 'something_new', message: 'Raw service text' })).toBe('Raw service text');
    expect(passwordProblem(null)).toBe('');
  });

  it('is offered from the profile menu', async () => {
    let asked = 0;
    const view = await mount(createElement(AppShell, {
      me: { user_id: 'u', display_name: 'Synthetic Staff', role: 'teacher' },
      current: routes[0]!,
      onNavigate: () => {},
      onSignOut: () => {},
      onChangePassword: () => { asked++; },
      children: null,
    }));
    unmount = view.unmount;
    await click(view.host.querySelector('.profile-trigger'));
    await click(byText(view.host, 'Change password'));
    expect(asked).toBe(1);
  });
});
