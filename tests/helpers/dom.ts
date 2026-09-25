import { act, createElement, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import request from 'supertest';
import { ApiError, type Api } from '../../web/api';
import type { Route } from '../../web/routes';
import type { Status } from '../../web/components/primitives';

/**
 * Drives a workspace screen in a real DOM against the real API.
 *
 * `tests/web-screens.test.ts` renders every route to a string, where effects
 * never run, so every fetch, review and confirmation behind a screen went
 * untested. A file using these helpers declares the happy-dom environment and
 * talks to an in-process API over a PGlite database, so what it proves is the
 * screen and the server agreeing — not the screen agreeing with a mock of the
 * server somebody wrote to match it.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The workspace's own API client, with the Supabase session replaced by the
 * synthetic bearer the test server accepts. Everything else — the `/api/v1`
 * prefix, the unwrapped `data`, the `ApiError` carrying the server's code and
 * field list — matches `web/api.ts`, because screens branch on exactly those.
 */
export function serverApi(app: Parameters<typeof request>[0], actor: string, log: string[] = []): Api {
  return async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
    log.push(`${method} ${path}`);
    const verb = method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    let call = request(app)[verb](`/api/v1${path}`).set('Authorization', `Bearer ${actor}`);
    if (body !== undefined) call = call.send(body as object);
    const response = await call;
    if (response.status >= 400) {
      const error = response.body?.error ?? {};
      throw new ApiError(response.status, error.code ?? 'REQUEST_FAILED', error.message ?? 'The request failed.', error.fields ?? []);
    }
    return response.body.data as T;
  };
}

export async function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(node); });
  return {
    host,
    async rerender(next: ReactNode) { await act(async () => { root.render(next); }); },
    async unmount() { await act(async () => { root.unmount(); }); host.remove(); },
  };
}

/**
 * A route rendered the way the shell renders it: one API client for the life
 * of the screen, and a `reload` that advances the token every fetch is keyed
 * on. A client rebuilt on each render would change identity every time and
 * re-run every effect that depends on it. Statuses the screen reports are
 * collected so a test can read what the page's own status line would say.
 */
export async function showRoute(app: Parameters<typeof request>[0], route: Route, { actor, manager, log = [] }: { actor: string; manager: boolean; log?: string[] }) {
  const statuses: Status[] = [];
  function Host() {
    const [token, setToken] = useState(0);
    const api = useMemo(() => serverApi(app, actor, log), []);
    return route.render({
      api, me: { user_id: actor, role: manager ? 'principal' : 'teacher', display_name: 'Synthetic staff' }, manager,
      setStatus: status => { statuses.push(status); }, reload: () => setToken(t => t + 1), token, route,
    });
  }
  const view = await mount(createElement(Host));
  return { ...view, statuses, lastStatus: () => statuses[statuses.length - 1] };
}

/** Lets pending fetches land and React commit what they set. */
export const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });

/** Polls until `check` returns something truthy, letting React and the server move in between. */
export async function waitFor<T>(check: () => T | null | undefined | false, what = 'the expected state', timeout = 8000): Promise<T> {
  const until = Date.now() + timeout;
  for (;;) {
    const found = check();
    if (found) return found;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}.\n\n${document.body.textContent?.slice(0, 2000)}`);
    await settle();
  }
}

const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The innermost element matching `selector` whose whole text is `label`. */
export const byText = (root: ParentNode, label: string | RegExp, selector = 'button') =>
  [...root.querySelectorAll(selector)].find(element => (typeof label === 'string' ? text(element) === label : label.test(text(element)))) as HTMLElement | undefined;

/** A control found through the label that names it, the way a person finds it. */
export const byLabel = <T extends HTMLElement = HTMLInputElement>(root: ParentNode, label: string | RegExp) => {
  const found = [...root.querySelectorAll('label')].find(l => (typeof label === 'string' ? text(l).startsWith(label) : label.test(text(l))));
  const target = found?.htmlFor ? (root.querySelector(`[id="${found.htmlFor}"]`) ?? document.getElementById(found.htmlFor)) : found?.querySelector('input, select, textarea');
  return (target ?? undefined) as T | undefined;
};

export async function click(element: Element | undefined | null) {
  if (!element) throw new Error(`Nothing to click.\n\n${document.body.textContent?.slice(0, 2000)}`);
  await act(async () => { (element as HTMLElement).click(); });
  await settle();
}

/**
 * Sets a control's value the way typing does. React tracks the value it last
 * rendered, so assigning `.value` directly is invisible to it; the native
 * setter moves the underlying value and the events make React read it.
 */
export async function fill(element: Element | undefined | null, value: string) {
  if (!element) throw new Error(`No control to fill with "${value}".\n\n${document.body.textContent?.slice(0, 2000)}`);
  const proto = Object.getPrototypeOf(element);
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

/** Picks an option by value once it exists — a select rendered before its list loads has nothing to pick yet. */
export async function choose(root: ParentNode, label: string | RegExp, value: string) {
  const select = await waitFor(() => {
    const found = byLabel<HTMLSelectElement>(root, label);
    return found && [...found.options].some(o => o.value === value) && found;
  }, `the option ${value} under ${label}`);
  if (select.value !== value) await fill(select, value);
  return select;
}

export async function check(element: Element | undefined | null) {
  if (!element) throw new Error('No checkbox or radio to choose.');
  await act(async () => { (element as HTMLInputElement).click(); });
  await settle();
}
