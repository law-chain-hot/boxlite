// @vitest-environment jsdom
/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { type AdminBox } from './adminHelpers'
import AdminTelemetryDrawer from './AdminTelemetryDrawer'

const box: AdminBox = {
  id: 'box-test-001',
  organizationId: 'org-test',
  state: 'started',
  runnerId: 'runner-test-001',
  cpu: 2,
  memoryGiB: 4,
  createdAt: '2026-05-24T09:10:00.000Z',
  owner: {
    name: 'Brian Luo',
    email: 'brian@example.com',
    orgName: 'personal',
    personal: true,
  },
}

describe('AdminTelemetryDrawer', () => {
  let root: Root | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    document.body.innerHTML = ''
  })

  it('shows box facts and links to platform telemetry without embedding platform evidence tabs', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    act(() => {
      root = createRoot(host)
      root.render(
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <AdminTelemetryDrawer box={box} open onOpenChange={vi.fn()} onRecover={vi.fn()} onJumpToRunner={vi.fn()} />
        </MemoryRouter>,
      )
    })

    const text = document.body.textContent ?? ''

    expect(text).toContain('Box details')
    expect(text).toContain('Platform telemetry is global boxlite-api evidence.')
    expect(text).toContain('Open platform telemetry')
    expect(text).not.toContain('Logs')
    expect(text).not.toContain('Traces')
    expect(text).not.toContain('Metrics')
  })
})
