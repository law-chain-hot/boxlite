/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { describe, expect, it } from 'vitest'
import { ADMIN_VIEWS } from './adminNavigation'

describe('admin navigation scope', () => {
  it('promotes platform telemetry to a top-level admin view', () => {
    expect(ADMIN_VIEWS.map((view) => view.label)).toEqual(['Overview', 'People & Boxes', 'Fleet', 'Platform Telemetry'])
  })
})
