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
    const overviewService = {
      listBoxes: jest.fn().mockResolvedValue([]),
      listRunners: jest.fn().mockResolvedValue([]),
      listMachines: jest.fn().mockResolvedValue([]),
    }
    const auditService = {
      getAllLogs: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 }),
    }
    const cloudWatchLogReader = {
      getRelatedLogs: jest.fn().mockResolvedValue({
        logs: [],
        status: { source: 'cloudwatch', state: 'available', count: 0 },
      }),
    }
    const s3ObjectReader = {
      listRelatedObjects: jest.fn().mockResolvedValue({
        objects: [],
        status: { source: 's3', state: 'available', count: 0 },
      }),
    }

    return {
      clickhouseService,
      overviewService,
      auditService,
      cloudWatchLogReader,
      s3ObjectReader,
      service: new AdminObservabilityService(
        clickhouseService as any,
        overviewService as any,
        auditService as any,
        cloudWatchLogReader as any,
        s3ObjectReader as any,
      ),
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

  it('uses a default time range when logs are queried without from/to', async () => {
    const { service, clickhouseService } = buildService({ configured: true })

    await service.getLogs({ limit: 5 })

    const [, params] = clickhouseService.query.mock.calls[0]
    expect(params.from).toBeInstanceOf(Date)
    expect(params.to).toBeInstanceOf(Date)
    expect(Number.isNaN(params.from.getTime())).toBe(false)
    expect(Number.isNaN(params.to.getTime())).toBe(false)
    expect(params.to.getTime() - params.from.getTime()).toBe(60 * 60 * 1000)
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

  it('derives box correlation from sandbox service names when resource attributes are not present', async () => {
    const { service, clickhouseService, overviewService, cloudWatchLogReader, s3ObjectReader } = buildService({
      configured: true,
    })
    clickhouseService.query.mockImplementation(async (query: string) => {
      if (query.includes('FROM otel_traces') && query.includes('ResourceAttributes')) {
        return [
          {
            TraceId: 'trace-box-1',
            SpanId: 'span-1',
            ParentSpanId: '',
            SpanName: 'GET /version',
            Timestamp: '2026-06-05T00:00:00.000Z',
            Duration: 1_000_000,
            ServiceName: 'sandbox-sandbox-1',
            ResourceAttributes: {},
            SpanAttributes: {},
            StatusCode: 'STATUS_CODE_OK',
            StatusMessage: '',
          },
        ]
      }
      if (query.includes('SELECT count() as count') && query.includes('FROM otel_logs')) {
        return [{ count: 0 }]
      }
      return []
    })
    overviewService.listBoxes.mockResolvedValue([
      {
        id: 'sandbox-1',
        boxId: 'public-box-1',
        organizationId: 'org-1',
        state: 'started',
        runnerId: 'runner-1',
        cpu: 2,
        memoryGiB: 4,
        createdAt: '2026-06-05T00:00:00.000Z',
      },
      {
        id: 'sandbox-2',
        boxId: 'public-box-2',
        organizationId: 'org-1',
        state: 'started',
        runnerId: 'runner-2',
        cpu: 2,
        memoryGiB: 4,
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ])
    overviewService.listRunners.mockResolvedValue([{ id: 'runner-1', state: 'ready', draining: false }])
    overviewService.listMachines.mockResolvedValue([{ host: 'runner-1', region: 'us-east-1', sandboxes: 1 }])

    const result = await service.investigate({
      from: '2026-06-05T00:00:00.000Z',
      to: '2026-06-05T01:00:00.000Z',
      traceId: 'trace-box-1',
    })

    expect(result.correlation).toMatchObject({
      traceIds: ['trace-box-1'],
      orgIds: ['org-1'],
      sandboxIds: ['sandbox-1'],
      boxIds: ['public-box-1'],
      runnerIds: ['runner-1'],
      machineIds: ['runner-1'],
      serviceNames: ['sandbox-sandbox-1'],
    })
    expect(result.boxes.map((box) => box.id)).toEqual(['sandbox-1'])
    expect(result.boxes.map((box) => box.boxId)).toEqual(['public-box-1'])
    expect(result.runners.map((runner) => runner.id)).toEqual(['runner-1'])
    expect(result.machines.map((machine) => machine.host)).toEqual(['runner-1'])
    expect(cloudWatchLogReader.getRelatedLogs).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        sandboxIds: ['sandbox-1'],
      }),
    )
    expect(s3ObjectReader.listRelatedObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxIds: ['sandbox-1'],
      }),
    )
  })

  it('investigates one trace across telemetry, platform state, CloudWatch, S3, audit, and xLog', async () => {
    const { service, clickhouseService, overviewService, auditService, cloudWatchLogReader, s3ObjectReader } =
      buildService({
        configured: true,
      })
    clickhouseService.query.mockImplementation(async (query: string) => {
      if (query.includes('FROM otel_traces') && query.includes('ResourceAttributes')) {
        return [
          {
            TraceId: 'trace-1',
            SpanId: 'span-1',
            ParentSpanId: '',
            SpanName: 'POST /api/boxes',
            Timestamp: '2026-06-05T00:00:00.000Z',
            Duration: 4_000_000,
            ServiceName: 'boxlite-api',
            ResourceAttributes: {
              'boxlite.layer': 'api',
              'boxlite.org_id': 'org-1',
              'boxlite.sandbox_id': 'sandbox-1',
              'boxlite.box_id': 'box-1',
              'boxlite.runner_id': 'runner-1',
              'boxlite.machine_id': 'machine-1',
            },
            SpanAttributes: {
              'boxlite.request_id': 'req-1',
              'boxlite.operation_id': 'op-1',
              'boxlite.execution_id': 'exec-1',
              'boxlite.job_id': 'job-1',
            },
            StatusCode: 'STATUS_CODE_OK',
            StatusMessage: '',
          },
        ]
      }
      if (query.includes('SELECT count() as count') && query.includes('FROM otel_logs')) {
        return [{ count: 1 }]
      }
      if (query.includes('FROM otel_logs')) {
        return [
          {
            Timestamp: '2026-06-05T00:00:01.000Z',
            Body: 'boxlite exec output',
            SeverityText: 'INFO',
            SeverityNumber: 9,
            ServiceName: 'boxlite-api',
            ResourceAttributes: { 'boxlite.box_id': 'box-1', 'boxlite.runner_id': 'runner-1' },
            LogAttributes: {
              'boxlite.request_id': 'req-1',
              'boxlite.execution_id': 'exec-1',
              'boxlite.job_id': 'job-1',
              'boxlite.stream': 'stdout',
              'boxlite.output': 'hello from exec\n',
            },
            TraceId: 'trace-1',
            SpanId: 'span-1',
          },
        ]
      }
      if (query.includes('FROM (') && query.includes('otel_metrics_gauge')) {
        return [
          {
            timestamp: '2026-06-05T00:01:00.000Z',
            MetricName: 'boxlite.runner.cpu.usage',
            layer: 'runner',
            value: 0.42,
          },
        ]
      }
      return []
    })
    overviewService.listBoxes.mockResolvedValue([
      {
        id: 'sandbox-1',
        organizationId: 'org-1',
        state: 'started',
        runnerId: 'runner-1',
        cpu: 2,
        memoryGiB: 4,
        createdAt: '2026-06-05T00:00:00.000Z',
      },
      {
        id: 'sandbox-2',
        organizationId: 'org-1',
        state: 'started',
        runnerId: 'runner-2',
        cpu: 2,
        memoryGiB: 4,
        createdAt: '2026-06-05T00:00:00.000Z',
      },
    ])
    overviewService.listRunners.mockResolvedValue([{ id: 'runner-1', state: 'ready', draining: false }])
    overviewService.listMachines.mockResolvedValue([{ host: 'machine-1', region: 'us-east-1', sandboxes: 1 }])
    auditService.getAllLogs.mockResolvedValue({
      items: [
        {
          id: 'audit-1',
          actorId: 'user-1',
          actorEmail: 'admin@example.com',
          organizationId: 'org-1',
          action: 'create',
          targetType: 'sandbox',
          targetId: 'sandbox-1',
          createdAt: new Date('2026-06-05T00:00:02.000Z'),
        },
      ],
      total: 1,
      page: 1,
      totalPages: 1,
    })
    cloudWatchLogReader.getRelatedLogs.mockResolvedValue({
      logs: [
        {
          timestamp: '2026-06-05T00:00:03.000Z',
          body: 'runner attach stderr',
          severityText: 'ERROR',
          serviceName: 'cloudwatch:Api',
          resourceAttributes: {
            'boxlite.source': 'cloudwatch',
            'boxlite.layer': 'api',
            'boxlite.box_id': 'box-1',
          },
          logAttributes: {
            'boxlite.execution_id': 'exec-1',
            'boxlite.job_id': 'job-1',
            'boxlite.stream': 'stderr',
          },
          traceId: 'trace-1',
          spanId: 'span-1',
        },
      ],
      status: { source: 'cloudwatch', state: 'available', count: 1 },
    })
    s3ObjectReader.listRelatedObjects.mockResolvedValue({
      objects: [
        {
          bucket: 'bucket-1',
          key: 'sandbox-1/xlog.txt',
          size: 12,
          matchedBy: 'sandbox:sandbox-1',
        },
      ],
      status: { source: 's3', state: 'available', count: 1 },
    })

    const result = await service.investigate({
      from: '2026-06-05T00:00:00.000Z',
      to: '2026-06-05T01:00:00.000Z',
      traceId: 'trace-1',
    })

    expect(result.correlation).toMatchObject({
      traceIds: expect.arrayContaining(['trace-1']),
      orgIds: expect.arrayContaining(['org-1']),
      sandboxIds: expect.arrayContaining(['sandbox-1']),
      boxIds: expect.arrayContaining(['box-1']),
      runnerIds: expect.arrayContaining(['runner-1']),
      machineIds: expect.arrayContaining(['machine-1']),
      requestIds: expect.arrayContaining(['req-1']),
      operationIds: expect.arrayContaining(['op-1']),
      executionIds: expect.arrayContaining(['exec-1']),
      jobIds: expect.arrayContaining(['job-1']),
      serviceNames: expect.arrayContaining(['boxlite-api', 'cloudwatch:Api']),
    })
    expect(result.traceSpans).toHaveLength(1)
    expect(result.logs).toHaveLength(2)
    expect(result.metrics.series).toHaveLength(1)
    expect(result.boxes.map((box) => box.id)).toEqual(['sandbox-1'])
    expect(result.runners.map((runner) => runner.id)).toEqual(['runner-1'])
    expect(result.machines.map((machine) => machine.host)).toEqual(['machine-1'])
    expect(result.auditLogs.map((log) => log.id)).toEqual(['audit-1'])
    expect(result.xlogs).toEqual([
      expect.objectContaining({
        source: 'clickhouse_logs',
        executionId: 'exec-1',
        jobId: 'job-1',
        stream: 'stdout',
        body: 'hello from exec\n',
      }),
      expect.objectContaining({
        source: 'cloudwatch_logs',
        executionId: 'exec-1',
        jobId: 'job-1',
        stream: 'stderr',
        body: 'runner attach stderr',
      }),
    ])
    expect(result.s3Objects).toEqual([
      expect.objectContaining({
        bucket: 'bucket-1',
        key: 'sandbox-1/xlog.txt',
        matchedBy: 'sandbox:sandbox-1',
      }),
    ])
    expect(cloudWatchLogReader.getRelatedLogs).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        traceIds: ['trace-1'],
        sandboxIds: ['sandbox-1'],
        boxIds: ['box-1'],
      }),
    )
    expect(s3ObjectReader.listRelatedObjects).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxIds: ['sandbox-1'],
        boxIds: ['box-1'],
        executionIds: ['exec-1'],
      }),
    )
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'clickhouse', state: 'available', count: 3 }),
        expect.objectContaining({ source: 'cloudwatch', state: 'available', count: 1 }),
        expect.objectContaining({ source: 'postgres', state: 'available', count: 3 }),
        expect.objectContaining({ source: 'audit', state: 'available', count: 1 }),
        expect.objectContaining({ source: 's3', state: 'available', count: 1 }),
        expect.objectContaining({ source: 'xlog', state: 'available', count: 2 }),
      ]),
    )
  })
})
