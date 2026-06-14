/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { describe, expect, it } from 'vitest'
import { getErrorDescription } from './error-handling'

describe('getErrorDescription', () => {
  it('shows messages from SDK and API errors', () => {
    expect(getErrorDescription(new Error('Organization limit reached'))).toBe('Organization limit reached')
  })

  it('falls back for unknown thrown values', () => {
    expect(getErrorDescription({})).toBe('Please try again or check the console for more details')
  })
})
