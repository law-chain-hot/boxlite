/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { SandboxTelemetryService } from './sandbox-telemetry.service'

describe('SandboxTelemetryService', () => {
  const from = '2026-05-25T00:00:00.000Z'
  const to = '2026-05-25T01:00:00.000Z'

  function buildService() {
    const clickhouseService = {
      query: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
    }

    return {
      clickhouseService,
      service: new SandboxTelemetryService(clickhouseService as any),
    }
  }

  it('queries platform logs with filters and maps ClickHouse rows', async () => {
    const { service, clickhouseService } = buildService()
    clickhouseService.query.mockResolvedValueOnce([{ count: 26 }]).mockResolvedValueOnce([
      {
        Timestamp: '2026-05-25T00:30:00.000Z',
        Body: 'Cannot read properties of undefined',
        SeverityText: 'ERROR',
        SeverityNumber: 17,
        ServiceName: 'boxlite-api',
        ResourceAttributes: { host: 'api' },
        LogAttributes: { job: 'autostopCheck' },
        TraceId: 'trace-1',
        SpanId: 'span-1',
      },
    ])

    const result = await service.getLogs('sandbox-id-is-ignored-for-plan-b', from, to, 2, 25, ['ERROR'], 'databaseName')

    expect(clickhouseService.query).toHaveBeenCalledTimes(2)
    expect(clickhouseService.query.mock.calls[0][0]).toContain('FROM otel_logs')
    expect(clickhouseService.query.mock.calls[0][0]).toContain('SeverityText IN')
    expect(clickhouseService.query.mock.calls[0][0]).toContain('Body ILIKE')
    expect(clickhouseService.query.mock.calls[0][1]).toMatchObject({
      serviceName: 'boxlite-api',
      limit: 25,
      offset: 25,
      severities: ['ERROR'],
      search: '%databaseName%',
    })
    expect(result).toEqual({
      items: [
        {
          timestamp: '2026-05-25T00:30:00.000Z',
          body: 'Cannot read properties of undefined',
          severityText: 'ERROR',
          severityNumber: 17,
          serviceName: 'boxlite-api',
          resourceAttributes: { host: 'api' },
          logAttributes: { job: 'autostopCheck' },
          traceId: 'trace-1',
          spanId: 'span-1',
        },
      ],
      total: 26,
      page: 2,
      totalPages: 2,
    })
  })

  it('aggregates platform traces and converts durations to milliseconds', async () => {
    const { service, clickhouseService } = buildService()
    clickhouseService.query.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([
      {
        TraceId: 'trace-1',
        startTime: '2026-05-25T00:00:00.000Z',
        endTime: '2026-05-25T00:00:01.000Z',
        spanCount: 3,
        rootSpanName: 'GET /api/admin/telemetry/traces',
        totalDuration: 15_000_000,
        statusCode: 'STATUS_CODE_OK',
      },
    ])

    const result = await service.getPlatformTraces(from, to, 1, 10)

    expect(clickhouseService.query).toHaveBeenCalledTimes(2)
    expect(clickhouseService.query.mock.calls[0][0]).toContain('count(DISTINCT TraceId)')
    expect(clickhouseService.query.mock.calls[1][0]).toContain('GROUP BY TraceId')
    expect(clickhouseService.query.mock.calls[1][1]).toMatchObject({
      serviceName: 'boxlite-api',
      limit: 10,
      offset: 0,
    })
    expect(result.items).toEqual([
      {
        traceId: 'trace-1',
        rootSpanName: 'GET /api/admin/telemetry/traces',
        startTime: '2026-05-25T00:00:00.000Z',
        endTime: '2026-05-25T00:00:01.000Z',
        durationMs: 15,
        spanCount: 3,
        statusCode: 'STATUS_CODE_OK',
      },
    ])
  })

  it('queries platform trace spans by trace id and normalizes optional fields', async () => {
    const { service, clickhouseService } = buildService()
    clickhouseService.query.mockResolvedValueOnce([
      {
        TraceId: 'trace-1',
        SpanId: 'span-1',
        ParentSpanId: '',
        SpanName: 'root',
        Timestamp: '2026-05-25T00:00:00.000Z',
        Duration: 1_000_000,
        SpanAttributes: { route: '/api/admin/telemetry/traces' },
        StatusCode: '',
        StatusMessage: '',
      },
    ])

    const result = await service.getTraceSpans('sandbox-id-is-ignored-for-plan-b', 'trace-1')

    expect(clickhouseService.query).toHaveBeenCalledWith(expect.stringContaining('FROM otel_traces'), {
      traceId: 'trace-1',
      serviceName: 'boxlite-api',
    })
    expect(result).toEqual([
      {
        traceId: 'trace-1',
        spanId: 'span-1',
        parentSpanId: undefined,
        spanName: 'root',
        timestamp: '2026-05-25T00:00:00.000Z',
        durationNs: 1_000_000,
        spanAttributes: { route: '/api/admin/telemetry/traces' },
        statusCode: undefined,
        statusMessage: undefined,
      },
    ])
  })

  it('merges gauge, sum, and histogram metric tables into one response', async () => {
    const { service, clickhouseService } = buildService()
    clickhouseService.query
      .mockResolvedValueOnce([
        { timestamp: '2026-05-25T00:00:00.000Z', MetricName: 'nodejs.eventloop.utilization', value: 0.4 },
      ])
      .mockResolvedValueOnce([{ timestamp: '2026-05-25T00:00:00.000Z', MetricName: 'process.cpu.time', value: 12 }])
      .mockResolvedValueOnce([
        { timestamp: '2026-05-25T00:00:00.000Z', MetricName: 'http.server.duration', value: 125 },
      ])

    const result = await service.getMetrics('sandbox-id-is-ignored-for-plan-b', from, to, [
      'nodejs.eventloop.utilization',
      'http.server.duration',
    ])

    expect(clickhouseService.query).toHaveBeenCalledTimes(3)
    expect(clickhouseService.query.mock.calls[0][0]).toContain('FROM otel_metrics_gauge')
    expect(clickhouseService.query.mock.calls[1][0]).toContain('FROM otel_metrics_sum')
    expect(clickhouseService.query.mock.calls[2][0]).toContain('FROM otel_metrics_histogram')
    expect(clickhouseService.query.mock.calls[2][0]).toContain('HAVING isNotNull(value)')
    for (const [, params] of clickhouseService.query.mock.calls) {
      expect(params).toMatchObject({
        serviceName: 'boxlite-api',
        metricNames: ['nodejs.eventloop.utilization', 'http.server.duration'],
      })
    }
    expect(result.series).toEqual([
      {
        metricName: 'nodejs.eventloop.utilization',
        dataPoints: [{ timestamp: '2026-05-25T00:00:00.000Z', value: 0.4 }],
      },
      {
        metricName: 'process.cpu.time',
        dataPoints: [{ timestamp: '2026-05-25T00:00:00.000Z', value: 12 }],
      },
      {
        metricName: 'http.server.duration',
        dataPoints: [{ timestamp: '2026-05-25T00:00:00.000Z', value: 125 }],
      },
    ])
  })

  it('reports whether ClickHouse telemetry is configured', () => {
    const { service, clickhouseService } = buildService()

    expect(service.isConfigured()).toBe(true)
    expect(clickhouseService.isConfigured).toHaveBeenCalled()
  })

  it('exposes platform-specific methods that do not require a sandbox id', async () => {
    const { service, clickhouseService } = buildService()
    clickhouseService.query.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([])

    await service.getPlatformLogs(from, to, 1, 100)

    expect(clickhouseService.query.mock.calls[0][1]).toMatchObject({
      serviceName: 'boxlite-api',
    })
  })
})
