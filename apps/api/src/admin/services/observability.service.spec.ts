/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ServiceUnavailableException } from '@nestjs/common'
import { AdminObservabilityService } from './observability.service'

describe('AdminObservabilityService', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  function buildService(options: { configured: boolean; queryRows?: any[] } = { configured: true }) {
    const clickhouseService = {
      isConfigured: jest.fn().mockReturnValue(options.configured),
      query: jest.fn().mockResolvedValue(options.queryRows ?? []),
    }

    return {
      clickhouseService,
      service: new AdminObservabilityService(clickhouseService as any),
    }
  }

  it('reports missing backend without querying ClickHouse when it is not configured', async () => {
    const { service, clickhouseService } = buildService({ configured: false })

    await expect(service.getStatus()).resolves.toEqual({
      backend: {
        configured: false,
        state: 'missing',
        message: 'ClickHouse/ClickStack is not configured',
      },
      layers: [
        { layer: 'api', state: 'missing', signals: { logs: 'missing', traces: 'missing', metrics: 'missing' } },
        { layer: 'runner', state: 'missing', signals: { logs: 'missing', traces: 'missing', metrics: 'missing' } },
        { layer: 'ec2_host', state: 'missing', signals: { logs: 'missing', traces: 'missing', metrics: 'missing' } },
        { layer: 'box', state: 'missing', signals: { logs: 'missing', traces: 'missing', metrics: 'missing' } },
      ],
    })
    expect(clickhouseService.query).not.toHaveBeenCalled()
  })

  it('does not return fake empty logs when ClickHouse is not configured', async () => {
    const { service } = buildService({ configured: false })

    await expect(
      service.getLogs({
        from: '2026-06-05T00:00:00.000Z',
        to: '2026-06-05T01:00:00.000Z',
        page: 1,
        limit: 100,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('builds admin log queries with layer and resource filters', async () => {
    const { service, clickhouseService } = buildService({ configured: true })

    await service.getLogs({
      from: '2026-06-05T00:00:00.000Z',
      to: '2026-06-05T01:00:00.000Z',
      page: 2,
      limit: 25,
      layer: 'box',
      serviceName: 'boxlite-box',
      orgId: 'org-1',
      sandboxId: 'sandbox-1',
      boxId: 'box-1',
      runnerId: 'runner-1',
      machineId: 'machine-1',
      severities: ['ERROR'],
      search: 'entrypoint',
    })

    const [countQuery, countParams] = clickhouseService.query.mock.calls[0]
    const [logsQuery, logsParams] = clickhouseService.query.mock.calls[1]

    expect(countQuery).toContain('multiIf(')
    expect(countQuery).toContain("ServiceName = 'boxlite-runner', 'runner'")
    expect(countQuery).toContain('= {layer:String}')
    expect(countQuery).toContain('ServiceName = {serviceName:String}')
    expect(countQuery).toContain("ResourceAttributes['boxlite.org_id'] = {orgId:String}")
    expect(countQuery).toContain("ResourceAttributes['boxlite.sandbox_id'] = {sandboxId:String}")
    expect(countQuery).toContain("ResourceAttributes['boxlite.box_id'] = {boxId:String}")
    expect(countQuery).toContain("ResourceAttributes['boxlite.runner_id'] = {runnerId:String}")
    expect(countQuery).toContain("ResourceAttributes['boxlite.machine_id'] = {machineId:String}")
    expect(countQuery).toContain('lower(SeverityText) IN ({severities:Array(String)})')
    expect(logsQuery).toContain('ORDER BY Timestamp DESC')
    expect(countParams).toMatchObject({
      layer: 'box',
      serviceName: 'boxlite-box',
      orgId: 'org-1',
      sandboxId: 'sandbox-1',
      boxId: 'box-1',
      runnerId: 'runner-1',
      machineId: 'machine-1',
      severities: ['error'],
      search: '%entrypoint%',
      offset: 25,
      limit: 25,
    })
    expect(logsParams).toEqual(countParams)
  })

  it('checks all ClickHouse metric tables when building layer status', async () => {
    const { service, clickhouseService } = buildService({ configured: true })

    await service.getStatus()

    const [statusQuery] = clickhouseService.query.mock.calls[0]
    expect(statusQuery).toContain('otel_metrics_gauge')
    expect(statusQuery).toContain('otel_metrics_sum')
    expect(statusQuery).toContain('otel_metrics_summary')
    expect(statusQuery).toContain('otel_metrics_histogram')
    expect(statusQuery).toContain('otel_metrics_exponential_histogram')
    expect(statusQuery).not.toContain('otel_metrics_exp_histogram')
    expect(statusQuery).toContain("ServiceName = 'boxlite-runner', 'runner'")
  })

  it('uses epoch milliseconds for layer status freshness to avoid local timezone parsing', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 5, 15, 40, 0, 0))
    const { service, clickhouseService } = buildService({
      configured: true,
      queryRows: [
        {
          layer: 'api',
          signal: 'logs',
          lastSeenMs: String(Date.UTC(2026, 5, 5, 15, 39, 0, 0)),
        },
      ],
    })

    const status = await service.getStatus()
    expect(status.backend).toMatchObject({ configured: true, state: 'receiving' })
    expect(status.layers.find((layer) => layer.layer === 'api')).toMatchObject({
      layer: 'api',
      state: 'receiving',
      signals: { logs: 'receiving', traces: 'configured', metrics: 'configured' },
      lastSeen: '2026-06-05T15:39:00.000Z',
    })

    const [statusQuery] = clickhouseService.query.mock.calls[0]
    expect(statusQuery).toContain('toUnixTimestamp64Milli')
    expect(statusQuery).toContain('lastSeenMs')
  })

  it('queries scalar metrics from gauge and sum tables for charts', async () => {
    const { service, clickhouseService } = buildService({
      configured: true,
      queryRows: [
        {
          timestamp: '2026-06-05T00:00:00.000Z',
          MetricName: 'boxlite.runner.started_sandboxes',
          layer: 'runner',
          value: 3,
        },
      ],
    })

    await expect(
      service.getMetrics({
        from: '2026-06-05T00:00:00.000Z',
        to: '2026-06-05T01:00:00.000Z',
        page: 1,
        limit: 100,
        layer: 'runner',
        metricNames: ['boxlite.runner.started_sandboxes'],
      }),
    ).resolves.toEqual({
      series: [
        {
          metricName: 'boxlite.runner.started_sandboxes',
          layer: 'runner',
          dataPoints: [{ timestamp: '2026-06-05T00:00:00.000Z', value: 3 }],
        },
      ],
    })

    const [metricsQuery, metricsParams] = clickhouseService.query.mock.calls[0]
    expect(metricsQuery).toContain('FROM otel_metrics_gauge')
    expect(metricsQuery).toContain('FROM otel_metrics_sum')
    expect(metricsQuery).toContain('multiIf(')
    expect(metricsQuery).toContain('as layer')
    expect(metricsQuery).toContain('GROUP BY timestamp, MetricName, layer')
    expect(metricsQuery).toContain('MetricName IN ({metricNames:Array(String)})')
    expect(metricsParams).toMatchObject({
      layer: 'runner',
      metricNames: ['boxlite.runner.started_sandboxes'],
    })
  })
})
