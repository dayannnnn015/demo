import { readFileSync } from 'node:fs';
import { appHtml } from './app-html.js';

/**
 * Prefer the file on disk, which is current right after a local build, and fall
 * back to the copy embedded at build time. A deployed function has no public/
 * directory: Vercel serves those assets from its CDN.
 */
let cached: string | undefined;

export function appPage() {
  const deployed = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (deployed && cached !== undefined) return cached;
  let html: string;
  try { html = readFileSync('public/index.html', 'utf8'); } catch { html = appHtml; }
  if (deployed) cached = html;
  return html;
}
