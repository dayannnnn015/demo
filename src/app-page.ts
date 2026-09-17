import { readFileSync } from 'node:fs';

/**
 * The workspace is a Vite bundle built into public/. Cache it in a deployed
 * process, where a new build means a new process, but re-read it in development
 * so a rebuild does not need a server restart.
 */
let cached: string | undefined;
const missing = '<!doctype html><title>EDUNEXUS</title><p>The workspace bundle is missing. Run <code>npm run build</code>.</p>';

export function appPage() {
  const deployed = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (deployed && cached !== undefined) return cached;
  let html: string;
  try { html = readFileSync('public/index.html', 'utf8'); } catch { html = missing; }
  if (deployed) cached = html;
  return html;
}
