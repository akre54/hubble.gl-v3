import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    setupFiles: ['src/setupTests.ts'],
    browser: {
      provider: 'playwright',
      enabled: true,
      headless: true,
      screenshotFailures: false,
      instances: [
        { browser: 'chromium' },
      ],
    }
  }
})
