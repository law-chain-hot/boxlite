/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { describe, expect, it } from 'vitest'
import { buildAdminObservabilitySearchParams } from './useAdminObservability'

describe('buildAdminObservabilitySearchParams', () => {
  it('serializes admin observability filters without leaking all-layer sentinel values', () => {
    const params = buildAdminObservabilitySearchParams({
      from: new Date('2026-06-05T10:00:00.000Z'),
      to: new Date('2026-06-05T11:00:00.000Z'),
      page: 2,
      limit: 25,
      layer: 'all',
      serviceName: 'boxlite-api',
      orgId: 'org-1',
      sandboxId: 'sandbox-1',
      boxId: 'box-1',
      runnerId: 'runner-1',
      machineId: 'machine-1',
      traceId: 'trace-1',
      requestId: 'req-1',
      operationId: 'op-1',
      executionId: 'exec-1',
      jobId: 'job-1',
      severities: ['ERROR', 'WARN'],
      search: 'timeout',
    })

    expect(params.get('from')).toBe('2026-06-05T10:00:00.000Z')
    expect(params.get('to')).toBe('2026-06-05T11:00:00.000Z')
    expect(params.get('layer')).toBeNull()
    expect(params.get('serviceName')).toBe('boxlite-api')
    expect(params.get('orgId')).toBe('org-1')
    expect(params.get('traceId')).toBe('trace-1')
    expect(params.get('requestId')).toBe('req-1')
    expect(params.get('operationId')).toBe('op-1')
    expect(params.get('executionId')).toBe('exec-1')
    expect(params.get('jobId')).toBe('job-1')
    expect(params.getAll('severities')).toEqual(['ERROR', 'WARN'])
    expect(params.get('search')).toBe('timeout')
  })

  it('serializes metric name filters as repeated query params', () => {
    const params = buildAdminObservabilitySearchParams({
      from: new Date('2026-06-05T10:00:00.000Z'),
      to: new Date('2026-06-05T11:00:00.000Z'),
      layer: 'runner',
      metricNames: ['boxlite.runner.cpu.usage', 'db.client.operation.duration'],
    })

    expect(params.get('layer')).toBe('runner')
    expect(params.getAll('metricNames')).toEqual(['boxlite.runner.cpu.usage', 'db.client.operation.duration'])
  })
})
