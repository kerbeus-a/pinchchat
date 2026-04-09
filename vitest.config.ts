import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/__tests__/**'],
      // Thresholds intentionally unset — coverage is tracked, not enforced yet.
    },
  },
})
