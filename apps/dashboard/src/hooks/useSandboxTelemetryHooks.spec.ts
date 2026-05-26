/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '@/hooks/useApi'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { adminTelemetryPaths } from '@/hooks/telemetryScope'
import { useSandboxLogs } from './useSandboxLogs'
import { useSandboxMetrics } from './useSandboxMetrics'
import { useSandboxTraceSpans } from './useSandboxTraceSpans'
import { useSandboxTraces } from './useSandboxTraces'

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((config) => config),
}))

vi.mock('@/hooks/useApi', () => ({
  useApi: vi.fn(),
}))

vi.mock('@/hooks/useSelectedOrganization', () => ({
  useSelectedOrganization: vi.fn(),
}))

interface CapturedQuery<T> {
  enabled: boolean
  queryFn: () => Promise<T>
  queryKey: readonly unknown[]
}

const from = new Date('2026-05-25T00:00:00.000Z')
const to = new Date('2026-05-25T01:00:00.000Z')

function capturedQuery<T>(value: unknown): CapturedQuery<T> {
  return value as CapturedQuery<T>
}

describe('sandbox telemetry hooks', () => {
  const axiosGet = vi.fn()
  const sandboxApi = {
    getSandboxLogs: vi.fn(),
    getSandboxTraces: vi.fn(),
    getSandboxTraceSpans: vi.fn(),
    getSandboxMetrics: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useQuery).mockImplementation((config) => config as never)
    vi.mocked(useApi).mockReturnValue({
      axiosInstance: { get: axiosGet },
      sandboxApi,
    } as never)
    vi.mocked(useSelectedOrganization).mockReturnValue({
      selectedOrganization: { id: 'org-1' },
    } as never)
    axiosGet.mockResolvedValue({ data: { items: [], series: [] } })
    sandboxApi.getSandboxLogs.mockResolvedValue({ data: { items: [] } })
    sandboxApi.getSandboxTraces.mockResolvedValue({ data: { items: [] } })
    sandboxApi.getSandboxTraceSpans.mockResolvedValue({ data: [] })
    sandboxApi.getSandboxMetrics.mockResolvedValue({ data: { series: [] } })
  })

  it('routes admin platform logs through the admin API without sandbox or org access', async () => {
    vi.mocked(useSelectedOrganization).mockReturnValue({ selectedOrganization: undefined } as never)
    const query = capturedQuery(
      useSandboxLogs(
        undefined,
        { from, to, severities: ['ERROR'], search: 'databaseName' },
        { scope: 'admin-platform' },
      ),
    )

    await query.queryFn()

    expect(query.enabled).toBe(true)
    expect(axiosGet).toHaveBeenCalledWith(adminTelemetryPaths.logs, {
      params: expect.any(URLSearchParams),
    })
    expect(axiosGet.mock.calls[0][1].params.toString()).toContain('severities=error')
    expect(sandboxApi.getSandboxLogs).not.toHaveBeenCalled()
  })

  it('keeps sandbox logs on the generated sandbox API with selected org access', async () => {
    const query = capturedQuery(
      useSandboxLogs('sandbox-1', { from, to, page: 3, limit: 10, severities: ['WARN'], search: 'backup' }),
    )

    await query.queryFn()

    expect(query.enabled).toBe(true)
    expect(sandboxApi.getSandboxLogs).toHaveBeenCalledWith('sandbox-1', from, to, 'org-1', 3, 10, ['WARN'], 'backup')
    expect(axiosGet).not.toHaveBeenCalled()
  })

  it('routes admin platform traces and spans through admin telemetry paths', async () => {
    const tracesQuery = capturedQuery(useSandboxTraces('ignored-sandbox', { from, to }, { scope: 'admin-platform' }))
    const spansQuery = capturedQuery(
      useSandboxTraceSpans('ignored-sandbox', 'trace/id value', { scope: 'admin-platform' }),
    )

    await tracesQuery.queryFn()
    await spansQuery.queryFn()

    expect(axiosGet).toHaveBeenNthCalledWith(1, adminTelemetryPaths.traces, {
      params: expect.any(URLSearchParams),
    })
    expect(axiosGet).toHaveBeenNthCalledWith(2, adminTelemetryPaths.traceSpans('trace/id value'))
    expect(sandboxApi.getSandboxTraces).not.toHaveBeenCalled()
    expect(sandboxApi.getSandboxTraceSpans).not.toHaveBeenCalled()
  })

  it('routes admin platform metrics through the admin API with metric filters', async () => {
    const query = capturedQuery(
      useSandboxMetrics(
        'ignored-sandbox',
        { from, to, metricNames: ['nodejs.eventloop.delay.mean', 'v8js.memory.heap.used'] },
        { scope: 'admin-platform' },
      ),
    )

    await query.queryFn()

    expect(axiosGet).toHaveBeenCalledWith(adminTelemetryPaths.metrics, {
      params: expect.any(URLSearchParams),
    })
    expect(axiosGet.mock.calls[0][1].params.toString()).toContain('metricNames=nodejs.eventloop.delay.mean')
    expect(sandboxApi.getSandboxMetrics).not.toHaveBeenCalled()
  })
})
