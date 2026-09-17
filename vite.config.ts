import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Express API owns every route except the static bundle, so the app builds
// into public/ and the server hands out web/index.html for /app.
export default defineConfig({
  root: 'web',
  plugins: [
    react(),
    {
      // The bundle is same-origin, but Vite marks the tags crossorigin, which
      // puts them in CORS mode and makes the API origin allowlist reject them.
      name: 'edunexus-same-origin-assets',
      transformIndexHtml: (html: string) => html.replace(/ crossorigin(="[^"]*")?/g, ''),
    },
  ],
  build: { outDir: '../public', emptyOutDir: true, sourcemap: false },
  server: { proxy: { '/api': 'http://127.0.0.1:3001', '/account/config': 'http://127.0.0.1:3001', '/openapi.json': 'http://127.0.0.1:3001' } },
});
