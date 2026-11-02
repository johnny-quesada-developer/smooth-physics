// Vite+ configuration for the workspace: lint (Oxlint, type-aware), format (Oxfmt) and tests (Vitest).
import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    ignorePatterns: ['**/dist/**', '**/.astro/**', '**/node_modules/**', 'libs/smooth-physics/src/solver-unrounded.ts'],
    options: { typeAware: true, typeCheck: true },
    rules: {
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      'typescript/consistent-type-definitions': ['error', 'type'],
      'typescript/consistent-type-imports': 'error',
      'typescript/explicit-function-return-type': ['error', { allowExpressions: true, allowTypedFunctionExpressions: true, allowHigherOrderFunctions: true }],
      'typescript/no-floating-promises': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
    overrides: [
      {
        // The generic alias is the one sanctioned use of `any`, for constraints that do not affect logic.
        files: ['**/types/any.ts'],
        rules: { 'typescript/no-explicit-any': 'off' },
      },
      {
        // react-global-state-hooks infers a store's type from its initial value, so a store that starts empty widens
        // it with `as` (createGlobalState(null as Stats | null)) instead of passing the generic. Object literals stay
        // banned.
        files: ['**/stores/*Store.ts'],
        rules: { 'typescript/consistent-type-assertions': ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }] },
      },
    ],
  },
  fmt: {
    singleQuote: true,
    printWidth: 160,
    ignorePatterns: [
      '**/dist/**',
      'pnpm-lock.yaml',
      'libs/smooth-physics/test/golden/**',
      'libs/smooth-physics/bench/results/**',
      'libs/smooth-physics/src/solver-unrounded.ts',
    ],
  },
  test: {
    include: ['libs/smooth-physics/test/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
