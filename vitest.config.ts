import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The workspace screens are rendered in tests/web-screens.test.ts, so JSX has
  // to compile here even though the backend tsconfig deliberately excludes web/.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: { testTimeout: 20000, hookTimeout: 60000, fileParallelism: false },
});
