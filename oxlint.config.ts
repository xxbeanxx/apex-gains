import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc', 'import', 'react', 'jsx-a11y', 'vitest', 'promise'],
  categories: {
    correctness: 'error',
  },
  options: {
    // Type-aware rules (no-floating-promises, await-thenable, ...) run through
    // oxlint-tsgolint, which reads the same tsconfig.json as `tsc`.
    typeAware: true,
    reportUnusedDisableDirectives: 'error',
  },
  env: {
    builtin: true,
  },
  rules: {
    // This rule enforces the use of curly braces for all control statements
    'curly': 'error',
    // Explicit ARIA roles are used on purpose where the native element does not
    // fit: an SVG chart as role="img", a live region as role="status".
    'jsx-a11y/prefer-tag-over-role': 'off',
    // Radix's Checkbox renders a <button>, which the rule cannot see through.
    'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['Checkbox'] }],
    // React Compiler rules. The app does not use the compiler, and both flag
    // deliberate patterns: reading storage in a mount effect so the first
    // client render matches the server's, and the latest-callback ref.
    'react/set-state-in-effect': 'off',
    'react/refs': 'off',
    // Static factories are passed point-free (`rows.map(Athlete.fromSnapshot)`)
    // and never touch `this`.
    'typescript/unbound-method': 'off',
    // `/// <reference types="vitest/config" />` is how vite.config.ts types its
    // `test` block.
    'typescript/triple-slash-reference': ['error', { types: 'always' }],
    // `vi.fn()` doubles are typed by what they are assigned to; `test/mock.ts`
    // covers the partial-object case.
    'vitest/require-mock-type-parameters': 'off',
    // A suite generated in a loop titles itself from the loop variable.
    'vitest/valid-title': ['error', { allowArguments: true }],
  },
  overrides: [
    {
      // A Playwright fixture is requested by destructuring it, often only for
      // its side effect (the `athlete` fixture signs the page in).
      files: ['e2e/**'],
      rules: {
        'eslint/no-unused-vars': ['error', { args: 'none' }],
      },
    },
    {
      // shadcn/ui components stay close to upstream so they can be re-pulled.
      files: ['app/components/ui/**'],
      rules: {
        'typescript/restrict-template-expressions': 'off',
      },
    },
  ],
});
