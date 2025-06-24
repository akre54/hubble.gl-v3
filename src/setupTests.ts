import * as matchers from '@testing-library/jest-dom/matchers'

import { afterAll, afterEach, vi, expect } from 'vitest'

expect.extend(matchers)

vi.useFakeTimers({
  now: new Date('2025-07-01T00:00:00Z'),
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  vi.useRealTimers()
})
