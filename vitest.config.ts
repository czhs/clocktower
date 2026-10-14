import { defineConfig } from 'vitest/config';

// Unit tests live next to each package (packages/*/test, apps/*/test) plus cross-cutting
// suites under tests/{unit,integration,security}. E2E (Playwright) and load tests run separately.
export default defineConfig({
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/security/**/*.test.ts',
    ],
    testTimeout: 20000,
    pool: 'forks',
  },
});
