import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    include: ['tests/browser/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        {
          name: 'chromium',
          browser: 'chromium',
          headless: true
        }
      ]
    }
  }
})
