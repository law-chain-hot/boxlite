/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { describe, expect, it } from 'vitest'
import { adminTelemetryPaths, buildTelemetrySearchParams } from './telemetryScope'

describe('telemetryScope', () => {
  it('serializes admin telemetry query params with repeated array keys', () => {
    const params = buildTelemetrySearchParams({
      from: new Date('2026-05-25T00:00:00.000Z'),
      to: new Date('2026-05-25T01:00:00.000Z'),
      page: 2,
      limit: 25,
      severities: ['ERROR', 'WARN'],
      metricNames: ['nodejs.eventloop.delay.mean', 'v8js.memory.heap.used'],
      search: 'databaseName',
    })

    expect(params.toString()).toBe(
      'from=2026-05-25T00%3A00%3A00.000Z&to=2026-05-25T01%3A00%3A00.000Z&page=2&limit=25&search=databaseName&severities=ERROR&severities=WARN&metricNames=nodejs.eventloop.delay.mean&metricNames=v8js.memory.heap.used',
    )
  })

  it('centralizes admin platform telemetry paths', () => {
    expect(adminTelemetryPaths.logs).toBe('/admin/telemetry/logs')
    expect(adminTelemetryPaths.traces).toBe('/admin/telemetry/traces')
    expect(adminTelemetryPaths.metrics).toBe('/admin/telemetry/metrics')
    expect(adminTelemetryPaths.traceSpans('trace/id value')).toBe('/admin/telemetry/traces/trace%2Fid%20value')
  })
})
