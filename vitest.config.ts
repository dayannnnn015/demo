import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // The workspace screens are rendered in tests/web-screens.test.ts, so JSX has
  // to compile here even though the backend tsconfig deliberately excludes web/.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  // .local/ holds scratch probes and credentials, never part of the suite; a probe left there must not run with it.
  test: { testTimeout: 20000, hookTimeout: 60000, fileParallelism: false, exclude: [...configDefaults.exclude, '.local/**', 'output/**'] },
});
