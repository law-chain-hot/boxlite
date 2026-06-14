/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ClickHouseService } from '../../clickhouse/clickhouse.service'
import { LogEntryDto } from '../../sandbox-telemetry/dto/log-entry.dto'
import {
  MetricsResponseDto,
  MetricDataPointDto,
  MetricSeriesDto,
} from '../../sandbox-telemetry/dto/metrics-response.dto'
import { PaginatedLogsDto } from '../../sandbox-telemetry/dto/paginated-logs.dto'
import { PaginatedTracesDto } from '../../sandbox-telemetry/dto/paginated-traces.dto'
import { TraceSpanDto } from '../../sandbox-telemetry/dto/trace-span.dto'
import { TraceSummaryDto } from '../../sandbox-telemetry/dto/trace-summary.dto'
import { AdminBoxItemDto, AdminMachineItemDto, AdminRunnerItemDto } from '../dto/admin-overview.dto'
import {
  AdminObservabilityAuditLogDto,
  AdminObservabilityCorrelationDto,
  AdminObservabilityInvestigateQueryParamsDto,
  AdminObservabilityInvestigateResponseDto,
  AdminObservabilityS3ObjectDto,
  AdminObservabilitySourceStatusDto,
  AdminObservabilityXLogDto,
} from '../dto/observability-investigate.dto'
import {
  AdminObservabilityLogsQueryParamsDto,
  AdminObservabilityMetricsQueryParamsDto,
  AdminObservabilityQueryParamsDto,
  OBSERVABILITY_LAYERS,
  ObservabilityLayer,
} from '../dto/observability-query.dto'
import {
  AdminObservabilityLayerSignalsDto,
  AdminObservabilityLayerStatusDto,
  AdminObservabilityStatusDto,
  ObservabilityState,
} from '../dto/observability-status.dto'

export const ADMIN_AUDIT_LOG_READER = 'ADMIN_AUDIT_LOG_READER'
export const ADMIN_PLATFORM_STATE_READER = 'ADMIN_PLATFORM_STATE_READER'
export const ADMIN_CLOUDWATCH_LOG_READER = 'ADMIN_CLOUDWATCH_LOG_READER'
export const ADMIN_S3_OBJECT_READER = 'ADMIN_S3_OBJECT_READER'

interface AdminAuditLogLike {
  id: string
  actorId: string
  actorEmail: string
  organizationId?: string
  action: string
  targetType?: string
  targetId?: string
  statusCode?: number
  errorMessage?: string
  source?: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

interface AdminAuditLogReader {
  getAllLogs(
    page?: number,
    limit?: number,
    filters?: { from?: Date; to?: Date },
    nextToken?: string,
  ): Promise<{ items: AdminAuditLogLike[]; total: number; page: number; totalPages: number; nextToken?: string }>
}

interface AdminPlatformStateReader {
  listBoxes(): Promise<AdminBoxItemDto[]>
  listRunners(): Promise<AdminRunnerItemDto[]>
  listMachines(): Promise<AdminMachineItemDto[]>
}

interface AdminCloudWatchLogReader {
  getRelatedLogs(
    query: AdminObservabilityInvestigateQueryParamsDto,
    correlation: AdminObservabilityCorrelationDto,
  ): Promise<{ logs: LogEntryDto[]; status: AdminObservabilitySourceStatusDto }>
}

interface AdminS3ObjectReader {
  listRelatedObjects(
    correlation: AdminObservabilityCorrelationDto,
  ): Promise<{ objects: AdminObservabilityS3ObjectDto[]; status: AdminObservabilitySourceStatusDto }>
}

interface ClickHouseCountRow {
  count: number
}

interface ClickHouseLogRow {
  Timestamp: string
  Body: string
  SeverityText: string
  SeverityNumber: number
  ServiceName: string
  ResourceAttributes: Record<string, string>
  LogAttributes: Record<string, string>
  TraceId: string
  SpanId: string
}

interface ClickHouseTraceAggregateRow {
  TraceId: string
  startTime: string
  endTime: string
  spanCount: number
  rootSpanName: string
  totalDuration: number
  statusCode: string
}

interface ClickHouseSpanRow {
  TraceId: string
  SpanId: string
  ParentSpanId: string
  SpanName: string
  Timestamp: string
  Duration: number
  ServiceName?: string
  ResourceAttributes?: Record<string, string>
  SpanAttributes: Record<string, string>
  StatusCode: string
  StatusMessage: string
}

interface ClickHouseMetricRow {
  timestamp: string
  MetricName: string
  layer: ObservabilityLayer | ''
  value: number
}

interface StatusRow {
  layer: ObservabilityLayer
  signal: keyof AdminObservabilityLayerSignalsDto
  lastSeenMs: number | string
}

const SIGNALS: Array<keyof AdminObservabilityLayerSignalsDto> = ['logs', 'traces', 'metrics']
const STALE_AFTER_MS = 15 * 60 * 1000
const DEFAULT_OBSERVABILITY_LOOKBACK_MS = 60 * 60 * 1000
const LAYER_EXPRESSION_SQL = `
  multiIf(
    ResourceAttributes['boxlite.layer'] != '', ResourceAttributes['boxlite.layer'],
    ServiceName = 'boxlite-api', 'api',
    ServiceName = 'boxlite-runner', 'runner',
    ServiceName = 'boxlite-runner-host', 'ec2_host',
    startsWith(ServiceName, 'sandbox-'), 'box',
    ''
  )
`
const SCALAR_METRICS_SOURCE_SQL = `
  SELECT TimeUnix, MetricName, Value, ServiceName, ResourceAttributes FROM otel_metrics_gauge
  UNION ALL
  SELECT TimeUnix, MetricName, Value, ServiceName, ResourceAttributes FROM otel_metrics_sum
`

@Injectable()
export class AdminObservabilityService {
  constructor(
    private readonly clickhouseService: ClickHouseService,
    @Inject(ADMIN_PLATFORM_STATE_READER) private readonly overviewService: AdminPlatformStateReader,
    @Inject(ADMIN_AUDIT_LOG_READER) private readonly auditService: AdminAuditLogReader,
    @Inject(ADMIN_CLOUDWATCH_LOG_READER) private readonly cloudWatchLogReader: AdminCloudWatchLogReader,
    @Inject(ADMIN_S3_OBJECT_READER) private readonly s3ObjectReader: AdminS3ObjectReader,
  ) {}

  async getStatus(): Promise<AdminObservabilityStatusDto> {
    if (!this.clickhouseService.isConfigured()) {
      return {
        backend: {
          configured: false,
          state: 'missing',
          message: 'ClickHouse/ClickStack is not configured',
        },
        layers: this.buildMissingLayers(),
      }
    }

    try {
      const rows = await this.clickhouseService.query<StatusRow>(`
	        SELECT layer, signal, max(lastSeenMs) AS lastSeenMs
	        FROM (
	          SELECT ${LAYER_EXPRESSION_SQL} AS layer, 'logs' AS signal, toUnixTimestamp64Milli(max(Timestamp)) AS lastSeenMs
	          FROM otel_logs
	          WHERE layer != ''
	          GROUP BY layer
	          UNION ALL
	          SELECT ${LAYER_EXPRESSION_SQL} AS layer, 'traces' AS signal, toUnixTimestamp64Milli(max(Timestamp)) AS lastSeenMs
	          FROM otel_traces
	          WHERE layer != ''
	          GROUP BY layer
	          UNION ALL
	          SELECT ${LAYER_EXPRESSION_SQL} AS layer, 'metrics' AS signal, toUnixTimestamp64Milli(max(TimeUnix)) AS lastSeenMs
	          FROM (
	            SELECT TimeUnix, ServiceName, ResourceAttributes FROM otel_metrics_gauge
	            UNION ALL
	            SELECT TimeUnix, ServiceName, ResourceAttributes FROM otel_metrics_sum
	            UNION ALL
	            SELECT TimeUnix, ServiceName, ResourceAttributes FROM otel_metrics_summary
	            UNION ALL
	            SELECT TimeUnix, ServiceName, ResourceAttributes FROM otel_metrics_histogram
	            UNION ALL
	            SELECT TimeUnix, ServiceName, ResourceAttributes FROM otel_metrics_exponential_histogram
	          )
	          WHERE layer != ''
	          GROUP BY layer
	        )
	        GROUP BY layer, signal
      `)

      const layers = this.buildConfiguredLayers(rows)
      return {
        backend: {
          configured: true,
          state: layers.some((layer) => layer.state === 'receiving') ? 'receiving' : 'configured',
        },
        layers,
      }
    } catch (error) {
      return {
        backend: {
          configured: true,
          state: 'error',
          message: error instanceof Error ? error.message : 'ClickHouse status query failed',
        },
        layers: OBSERVABILITY_LAYERS.map((layer) => ({
          layer,
          state: 'error',
          signals: { logs: 'error', traces: 'error', metrics: 'error' },
        })),
      }
    }
  }

  async getLogs(query: AdminObservabilityLogsQueryParamsDto): Promise<PaginatedLogsDto> {
    this.assertConfigured()
    const params = this.buildBaseParams(query)
    const whereClause = this.buildWhereClause('Timestamp', query, params)

    if (query.severities && query.severities.length > 0) {
      whereClause.push('lower(SeverityText) IN ({severities:Array(String)})')
      params.severities = query.severities.map((severity) => severity.toLowerCase())
    }
    if (query.search) {
      whereClause.push('Body ILIKE {search:String}')
      params.search = `%${query.search}%`
    }
    this.pushTraceIdFilter(whereClause, params, query.traceId)
    this.pushAttributeFilter(whereClause, params, 'LogAttributes', 'boxlite.request_id', 'requestId', query.requestId)
    this.pushAttributeFilter(
      whereClause,
      params,
      'LogAttributes',
      'boxlite.operation_id',
      'operationId',
      query.operationId,
    )
    this.pushAttributeFilter(
      whereClause,
      params,
      'LogAttributes',
      'boxlite.execution_id',
      'executionId',
      query.executionId,
    )
    this.pushAttributeFilter(whereClause, params, 'LogAttributes', 'boxlite.job_id', 'jobId', query.jobId)

    const whereSql = whereClause.join('\n        AND ')
    const countResult = await this.clickhouseService.query<ClickHouseCountRow>(
      `
      SELECT count() as count
      FROM otel_logs
      WHERE ${whereSql}
    `,
      params,
    )
    const total = countResult[0]?.count || 0

    const rows = await this.clickhouseService.query<ClickHouseLogRow>(
      `
      SELECT Timestamp, Body, SeverityText, SeverityNumber, ServiceName,
             ResourceAttributes, LogAttributes, TraceId, SpanId
      FROM otel_logs
      WHERE ${whereSql}
      ORDER BY Timestamp DESC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `,
      params,
    )

    return {
      items: rows.map((row) => ({
        timestamp: row.Timestamp,
        body: row.Body,
        severityText: row.SeverityText,
        severityNumber: row.SeverityNumber,
        serviceName: row.ServiceName,
        resourceAttributes: row.ResourceAttributes || {},
        logAttributes: row.LogAttributes || {},
        traceId: row.TraceId || undefined,
        spanId: row.SpanId || undefined,
      })) as LogEntryDto[],
      total,
      page: query.page ?? 1,
      totalPages: Math.ceil(total / (query.limit ?? 100)),
    }
  }

  async getTraces(query: AdminObservabilityQueryParamsDto): Promise<PaginatedTracesDto> {
    this.assertConfigured()
    const params = this.buildBaseParams(query)
    const whereClause = this.buildWhereClause('Timestamp', query, params)
    this.pushTraceIdFilter(whereClause, params, query.traceId)
    this.pushAttributeFilter(whereClause, params, 'SpanAttributes', 'boxlite.request_id', 'requestId', query.requestId)
    this.pushAttributeFilter(
      whereClause,
      params,
      'SpanAttributes',
      'boxlite.operation_id',
      'operationId',
      query.operationId,
    )
    this.pushAttributeFilter(
      whereClause,
      params,
      'SpanAttributes',
      'boxlite.execution_id',
      'executionId',
      query.executionId,
    )
    this.pushAttributeFilter(whereClause, params, 'SpanAttributes', 'boxlite.job_id', 'jobId', query.jobId)
    const whereSql = whereClause.join('\n        AND ')

    const countResult = await this.clickhouseService.query<ClickHouseCountRow>(
      `
      SELECT count(DISTINCT TraceId) as count
      FROM otel_traces
      WHERE ${whereSql}
    `,
      params,
    )
    const total = countResult[0]?.count || 0

    const rows = await this.clickhouseService.query<ClickHouseTraceAggregateRow>(
      `
      SELECT
        TraceId,
        min(Timestamp) as startTime,
        max(Timestamp) as endTime,
        count() as spanCount,
        argMinIf(SpanName, Timestamp, ParentSpanId = '') as rootSpanName,
        max(Duration) as totalDuration,
        any(StatusCode) as statusCode
      FROM otel_traces
      WHERE ${whereSql}
      GROUP BY TraceId
      ORDER BY startTime DESC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `,
      params,
    )

    return {
      items: rows.map((row) => ({
        traceId: row.TraceId,
        rootSpanName: row.rootSpanName,
        startTime: row.startTime,
        endTime: row.endTime,
        durationMs: row.totalDuration / 1_000_000,
        spanCount: row.spanCount,
        statusCode: row.statusCode || undefined,
      })) as TraceSummaryDto[],
      total,
      page: query.page ?? 1,
      totalPages: Math.ceil(total / (query.limit ?? 100)),
    }
  }

  async getTraceSpans(traceId: string, query: AdminObservabilityQueryParamsDto): Promise<TraceSpanDto[]> {
    this.assertConfigured()
    const params = this.buildBaseParams(query)
    params.traceId = traceId
    const whereClause = this.buildWhereClause('Timestamp', query, params)
    whereClause.push('TraceId = {traceId:String}')

    const rows = await this.clickhouseService.query<ClickHouseSpanRow>(
      `
      SELECT TraceId, SpanId, ParentSpanId, SpanName, Timestamp, Duration,
             SpanAttributes, StatusCode, StatusMessage
      FROM otel_traces
      WHERE ${whereClause.join('\n        AND ')}
      ORDER BY Timestamp ASC
    `,
      params,
    )

    return rows.map((row) => ({
      traceId: row.TraceId,
      spanId: row.SpanId,
      parentSpanId: row.ParentSpanId || undefined,
      spanName: row.SpanName,
      timestamp: row.Timestamp,
      durationNs: row.Duration,
      spanAttributes: row.SpanAttributes || {},
      statusCode: row.StatusCode || undefined,
      statusMessage: row.StatusMessage || undefined,
    }))
  }

  async getMetrics(query: AdminObservabilityMetricsQueryParamsDto): Promise<MetricsResponseDto> {
    this.assertConfigured()
    const params = this.buildBaseParams(query)
    const whereClause = this.buildWhereClause('TimeUnix', query, params)
    if (query.metricNames && query.metricNames.length > 0) {
      whereClause.push('MetricName IN ({metricNames:Array(String)})')
      params.metricNames = query.metricNames
    }

    const rows = await this.clickhouseService.query<ClickHouseMetricRow>(
      `
	      SELECT
	        toStartOfInterval(TimeUnix, INTERVAL 1 MINUTE) as timestamp,
	        MetricName,
	        ${LAYER_EXPRESSION_SQL} as layer,
	        avg(Value) as value
	      FROM (${SCALAR_METRICS_SOURCE_SQL})
      WHERE ${whereClause.join('\n        AND ')}
      GROUP BY timestamp, MetricName, layer
      ORDER BY timestamp ASC
    `,
      params,
    )

    const seriesMap = new Map<
      string,
      { metricName: string; layer?: ObservabilityLayer; dataPoints: MetricDataPointDto[] }
    >()
    for (const row of rows) {
      const layer = OBSERVABILITY_LAYERS.includes(row.layer as ObservabilityLayer)
        ? (row.layer as ObservabilityLayer)
        : undefined
      const seriesKey = `${row.MetricName}:${layer ?? 'unknown'}`
      if (!seriesMap.has(seriesKey)) {
        seriesMap.set(seriesKey, { metricName: row.MetricName, layer, dataPoints: [] })
      }
      seriesMap.get(seriesKey)!.dataPoints.push({ timestamp: row.timestamp, value: row.value })
    }

    const series: MetricSeriesDto[] = Array.from(seriesMap.values())

    return { series }
  }

  async investigate(
    query: AdminObservabilityInvestigateQueryParamsDto,
  ): Promise<AdminObservabilityInvestigateResponseDto> {
    const correlation = this.createEmptyCorrelation()
    this.collectQueryCorrelation(correlation, query)

    const sources: AdminObservabilitySourceStatusDto[] = []
    let traceSpans: TraceSpanDto[] = []
    let logs: LogEntryDto[] = []
    let metrics: MetricsResponseDto = { series: [] }
    let xlogs: AdminObservabilityXLogDto[] = []
    let s3Objects: AdminObservabilityS3ObjectDto[] = []

    if (!this.clickhouseService.isConfigured()) {
      sources.push({
        source: 'clickhouse',
        state: 'not_configured',
        message: 'ClickHouse/ClickStack is not configured',
        count: 0,
      })
    } else {
      try {
        const traceRows = await this.getInvestigationTraceRows(query)
        traceSpans = traceRows.map((row) => this.toTraceSpan(row))
        for (const row of traceRows) {
          this.collectTraceRowCorrelation(correlation, row)
        }

        const relatedQuery = this.buildRelatedTelemetryQuery(query, correlation)
        const [logPage, metricResponse] = await Promise.all([this.getLogs(relatedQuery), this.getMetrics(relatedQuery)])
        logs = logPage.items
        metrics = metricResponse
        for (const log of logs) {
          this.collectLogCorrelation(correlation, log)
        }

        sources.push({
          source: 'clickhouse',
          state: 'available',
          count: traceSpans.length + logs.length + metrics.series.length,
        })
      } catch (error) {
        sources.push({
          source: 'clickhouse',
          state: 'error',
          message: error instanceof Error ? error.message : 'ClickHouse investigation query failed',
          count: 0,
        })
      }
    }

    const { logs: cloudWatchLogs, cloudWatchStatus } = await this.getRelatedCloudWatchLogs(query, correlation)
    logs = [...logs, ...cloudWatchLogs]
    for (const log of cloudWatchLogs) {
      this.collectLogCorrelation(correlation, log)
    }
    sources.push(cloudWatchStatus)
    xlogs = this.buildXLogs(logs)

    const { boxes, runners, machines, postgresStatus } = await this.getRelatedPlatformState(correlation)
    sources.push(postgresStatus)

    const { auditLogs, auditStatus } = await this.getRelatedAuditLogs(query, correlation)
    sources.push(auditStatus)

    const s3Result = await this.getRelatedS3Objects(correlation)
    s3Objects = s3Result.objects
    sources.push(s3Result.s3Status)

    sources.push(this.buildXLogStatus(query, correlation, xlogs))

    return {
      correlation,
      sources,
      traceSpans,
      logs,
      metrics,
      boxes,
      runners,
      machines,
      auditLogs,
      xlogs,
      s3Objects,
    }
  }

  private assertConfigured() {
    if (!this.clickhouseService.isConfigured()) {
      throw new ServiceUnavailableException('ClickHouse/ClickStack is not configured')
    }
  }

  private buildMissingLayers(): AdminObservabilityLayerStatusDto[] {
    return OBSERVABILITY_LAYERS.map((layer) => ({
      layer,
      state: 'missing',
      signals: { logs: 'missing', traces: 'missing', metrics: 'missing' },
    }))
  }

  private buildConfiguredLayers(rows: StatusRow[]): AdminObservabilityLayerStatusDto[] {
    const now = Date.now()
    return OBSERVABILITY_LAYERS.map((layer) => {
      const signals: AdminObservabilityLayerSignalsDto = {
        logs: 'configured',
        traces: 'configured',
        metrics: 'configured',
      }
      let lastSeenMs = 0

      for (const signal of SIGNALS) {
        const row = rows.find((candidate) => candidate.layer === layer && candidate.signal === signal)
        if (row?.lastSeenMs === undefined || row.lastSeenMs === null) {
          continue
        }
        const seenAt = Number(row.lastSeenMs)
        if (!Number.isFinite(seenAt)) {
          continue
        }
        lastSeenMs = Math.max(lastSeenMs, seenAt)
        signals[signal] = now - seenAt <= STALE_AFTER_MS ? 'receiving' : 'stale'
      }

      const state = this.mergeSignalState(signals)
      return {
        layer,
        state,
        signals,
        ...(lastSeenMs > 0 ? { lastSeen: new Date(lastSeenMs).toISOString() } : {}),
      }
    })
  }

  private mergeSignalState(signals: AdminObservabilityLayerSignalsDto): ObservabilityState {
    if (SIGNALS.some((signal) => signals[signal] === 'receiving')) {
      return 'receiving'
    }
    if (SIGNALS.some((signal) => signals[signal] === 'stale')) {
      return 'stale'
    }
    return 'configured'
  }

  private async getInvestigationTraceRows(
    query: AdminObservabilityInvestigateQueryParamsDto,
  ): Promise<ClickHouseSpanRow[]> {
    const traceIds = query.traceId
      ? [query.traceId]
      : (await this.getTraces({ ...query, page: 1, limit: 5 })).items.map((trace) => trace.traceId)
    if (traceIds.length === 0) {
      return []
    }

    const rows: ClickHouseSpanRow[] = []
    for (const traceId of traceIds.slice(0, 5)) {
      const params = this.buildBaseParams(query)
      params.traceId = traceId
      const whereClause = this.buildWhereClause('Timestamp', query, params)
      whereClause.push('TraceId = {traceId:String}')

      rows.push(
        ...(await this.clickhouseService.query<ClickHouseSpanRow>(
          `
          SELECT TraceId, SpanId, ParentSpanId, SpanName, Timestamp, Duration, ServiceName,
                 ResourceAttributes, SpanAttributes, StatusCode, StatusMessage
          FROM otel_traces
          WHERE ${whereClause.join('\n        AND ')}
          ORDER BY Timestamp ASC
        `,
          params,
        )),
      )
    }

    return rows
  }

  private toTraceSpan(row: ClickHouseSpanRow): TraceSpanDto {
    return {
      traceId: row.TraceId,
      spanId: row.SpanId,
      parentSpanId: row.ParentSpanId || undefined,
      spanName: row.SpanName,
      timestamp: row.Timestamp,
      durationNs: row.Duration,
      spanAttributes: row.SpanAttributes || {},
      statusCode: row.StatusCode || undefined,
      statusMessage: row.StatusMessage || undefined,
    }
  }

  private buildRelatedTelemetryQuery(
    query: AdminObservabilityInvestigateQueryParamsDto,
    correlation: AdminObservabilityCorrelationDto,
  ): AdminObservabilityLogsQueryParamsDto & AdminObservabilityMetricsQueryParamsDto {
    return {
      ...query,
      page: 1,
      limit: Math.min(query.limit ?? 100, 100),
      traceId: query.traceId ?? correlation.traceIds[0],
      orgId: query.orgId ?? correlation.orgIds[0],
      sandboxId: query.sandboxId ?? correlation.sandboxIds[0],
      boxId: query.boxId ?? correlation.boxIds[0],
      runnerId: query.runnerId ?? correlation.runnerIds[0],
      machineId: query.machineId ?? correlation.machineIds[0],
      requestId: query.requestId ?? correlation.requestIds[0],
      operationId: query.operationId ?? correlation.operationIds[0],
      executionId: query.executionId ?? correlation.executionIds[0],
      jobId: query.jobId ?? correlation.jobIds[0],
    }
  }

  private createEmptyCorrelation(): AdminObservabilityCorrelationDto {
    return {
      traceIds: [],
      orgIds: [],
      sandboxIds: [],
      boxIds: [],
      runnerIds: [],
      machineIds: [],
      requestIds: [],
      operationIds: [],
      executionIds: [],
      jobIds: [],
      serviceNames: [],
    }
  }

  private collectQueryCorrelation(
    correlation: AdminObservabilityCorrelationDto,
    query: AdminObservabilityInvestigateQueryParamsDto,
  ) {
    this.addUnique(correlation.traceIds, query.traceId)
    this.addUnique(correlation.orgIds, query.orgId)
    this.addUnique(correlation.sandboxIds, query.sandboxId)
    this.addUnique(correlation.boxIds, query.boxId)
    this.addUnique(correlation.runnerIds, query.runnerId)
    this.addUnique(correlation.machineIds, query.machineId)
    this.addUnique(correlation.requestIds, query.requestId)
    this.addUnique(correlation.operationIds, query.operationId)
    this.addUnique(correlation.executionIds, query.executionId)
    this.addUnique(correlation.jobIds, query.jobId)
    this.addUnique(correlation.serviceNames, query.serviceName)
  }

  private collectTraceRowCorrelation(correlation: AdminObservabilityCorrelationDto, row: ClickHouseSpanRow) {
    this.addUnique(correlation.traceIds, row.TraceId)
    this.collectServiceNameCorrelation(correlation, row.ServiceName)
    this.collectAttributeCorrelation(correlation, row.ResourceAttributes)
    this.collectAttributeCorrelation(correlation, row.SpanAttributes)
  }

  private collectLogCorrelation(correlation: AdminObservabilityCorrelationDto, log: LogEntryDto) {
    this.addUnique(correlation.traceIds, log.traceId)
    this.collectServiceNameCorrelation(correlation, log.serviceName)
    this.collectAttributeCorrelation(correlation, log.resourceAttributes)
    this.collectAttributeCorrelation(correlation, log.logAttributes)
  }

  private buildXLogs(logs: LogEntryDto[]): AdminObservabilityXLogDto[] {
    return logs
      .map((log): AdminObservabilityXLogDto | null => {
        const attributes = {
          ...(log.resourceAttributes ?? {}),
          ...(log.logAttributes ?? {}),
        }
        const executionId = this.readAttribute(attributes, [
          'boxlite.execution_id',
          'execution_id',
          'execution.id',
          'exec_id',
        ])
        const jobId = this.readAttribute(attributes, ['boxlite.job_id', 'job_id', 'job.id'])

        if (!executionId && !jobId) {
          return null
        }

        return {
          source: attributes['boxlite.source'] === 'cloudwatch' ? 'cloudwatch_logs' : 'clickhouse_logs',
          timestamp: log.timestamp,
          serviceName: log.serviceName,
          body: this.resolveXLogBody(log.body, attributes),
          severityText: log.severityText,
          traceId: log.traceId,
          spanId: log.spanId,
          executionId,
          jobId,
          stream: this.readAttribute(attributes, ['boxlite.stream', 'stream', 'log.stream']),
          attributes,
        }
      })
      .filter((entry): entry is AdminObservabilityXLogDto => entry !== null)
  }

  private resolveXLogBody(body: string, attributes: Record<string, unknown>): string {
    return this.readOutputAttribute(attributes, ['boxlite.output', 'xlog.output', 'exec.output']) ?? body
  }

  private readOutputAttribute(attributes: Record<string, unknown>, names: string[]): string | undefined {
    for (const name of names) {
      const value = attributes[name]
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }
    return undefined
  }

  private buildXLogStatus(
    query: AdminObservabilityInvestigateQueryParamsDto,
    correlation: AdminObservabilityCorrelationDto,
    xlogs: AdminObservabilityXLogDto[],
  ): AdminObservabilitySourceStatusDto {
    if (xlogs.length > 0) {
      return { source: 'xlog', state: 'available', count: xlogs.length }
    }

    const hasExecutionContext =
      Boolean(query.executionId || query.jobId) || correlation.executionIds.length > 0 || correlation.jobIds.length > 0

    return {
      source: 'xlog',
      state: 'missing',
      message: hasExecutionContext
        ? 'No ClickHouse logs with execution/job attributes were found for this investigation'
        : 'No execution_id/job_id correlation was discovered; runner attach output is not persisted as historical xLog yet',
      count: 0,
    }
  }

  private collectAttributeCorrelation(
    correlation: AdminObservabilityCorrelationDto,
    attributes?: Record<string, unknown>,
  ) {
    if (!attributes) {
      return
    }
    this.addUnique(correlation.orgIds, attributes['boxlite.org_id'])
    this.addUnique(correlation.sandboxIds, attributes['boxlite.sandbox_id'])
    this.addUnique(correlation.boxIds, attributes['boxlite.box_id'])
    this.addUnique(correlation.runnerIds, attributes['boxlite.runner_id'])
    this.addUnique(correlation.machineIds, attributes['boxlite.machine_id'])
    this.addUnique(correlation.requestIds, attributes['boxlite.request_id'])
    this.addUnique(correlation.operationIds, attributes['boxlite.operation_id'])
    this.addUnique(correlation.executionIds, attributes['boxlite.execution_id'])
    this.addUnique(correlation.jobIds, attributes['boxlite.job_id'])
  }

  private collectServiceNameCorrelation(correlation: AdminObservabilityCorrelationDto, serviceName?: string) {
    this.addUnique(correlation.serviceNames, serviceName)
    this.addUnique(correlation.sandboxIds, this.sandboxIdFromServiceName(serviceName))
  }

  private sandboxIdFromServiceName(serviceName?: string): string | undefined {
    if (!serviceName?.startsWith('sandbox-')) {
      return undefined
    }
    const sandboxId = serviceName.slice('sandbox-'.length).trim()
    return sandboxId || undefined
  }

  private readAttribute(attributes: Record<string, unknown>, names: string[]): string | undefined {
    for (const name of names) {
      const value = attributes[name]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return undefined
  }

  private async getRelatedPlatformState(correlation: AdminObservabilityCorrelationDto): Promise<{
    boxes: AdminBoxItemDto[]
    runners: AdminRunnerItemDto[]
    machines: AdminMachineItemDto[]
    postgresStatus: AdminObservabilitySourceStatusDto
  }> {
    try {
      const [allBoxes, allRunners, allMachines] = await Promise.all([
        this.overviewService.listBoxes(),
        this.overviewService.listRunners(),
        this.overviewService.listMachines(),
      ])

      const boxes = allBoxes.filter((box) => this.matchesBox(box, correlation))
      for (const box of boxes) {
        this.addUnique(correlation.orgIds, box.organizationId)
        this.addUnique(correlation.sandboxIds, box.id)
        this.addUnique(correlation.boxIds, box.boxId)
        this.addUnique(correlation.runnerIds, box.runnerId)
      }

      const runners = allRunners.filter((runner) => correlation.runnerIds.includes(runner.id))
      for (const runner of runners) {
        this.addUnique(correlation.machineIds, runner.id)
      }

      const machines = allMachines.filter(
        (machine) => correlation.machineIds.includes(machine.host) || correlation.runnerIds.includes(machine.host),
      )
      for (const machine of machines) {
        this.addUnique(correlation.machineIds, machine.host)
      }

      return {
        boxes,
        runners,
        machines,
        postgresStatus: {
          source: 'postgres',
          state: 'available',
          count: boxes.length + runners.length + machines.length,
        },
      }
    } catch (error) {
      return {
        boxes: [],
        runners: [],
        machines: [],
        postgresStatus: {
          source: 'postgres',
          state: 'error',
          message: error instanceof Error ? error.message : 'Postgres platform state query failed',
          count: 0,
        },
      }
    }
  }

  private async getRelatedAuditLogs(
    query: AdminObservabilityInvestigateQueryParamsDto,
    correlation: AdminObservabilityCorrelationDto,
  ): Promise<{ auditLogs: AdminObservabilityAuditLogDto[]; auditStatus: AdminObservabilitySourceStatusDto }> {
    try {
      const result = await this.auditService.getAllLogs(1, 50, {
        ...this.buildTimeRange(query),
      })
      const targetIds = new Set([
        ...correlation.orgIds,
        ...correlation.sandboxIds,
        ...correlation.boxIds,
        ...correlation.runnerIds,
        ...correlation.machineIds,
      ])
      const auditLogs = result.items
        .filter((log) => {
          return (
            (log.organizationId && correlation.orgIds.includes(log.organizationId)) ||
            (log.targetId && targetIds.has(log.targetId))
          )
        })
        .map((log) => ({
          id: log.id,
          actorId: log.actorId,
          actorEmail: log.actorEmail,
          organizationId: log.organizationId,
          action: log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          statusCode: log.statusCode,
          errorMessage: log.errorMessage,
          source: log.source,
          metadata: log.metadata,
          createdAt: log.createdAt,
        }))

      return {
        auditLogs,
        auditStatus: { source: 'audit', state: 'available', count: auditLogs.length },
      }
    } catch (error) {
      return {
        auditLogs: [],
        auditStatus: {
          source: 'audit',
          state: 'error',
          message: error instanceof Error ? error.message : 'AuditLog query failed',
          count: 0,
        },
      }
    }
  }

  private async getRelatedCloudWatchLogs(
    query: AdminObservabilityInvestigateQueryParamsDto,
    correlation: AdminObservabilityCorrelationDto,
  ): Promise<{ logs: LogEntryDto[]; cloudWatchStatus: AdminObservabilitySourceStatusDto }> {
    try {
      const result = await this.cloudWatchLogReader.getRelatedLogs(query, correlation)
      return { logs: result.logs, cloudWatchStatus: result.status }
    } catch (error) {
      return {
        logs: [],
        cloudWatchStatus: {
          source: 'cloudwatch',
          state: 'error',
          message: error instanceof Error ? error.message : 'CloudWatch log lookup failed',
          count: 0,
        },
      }
    }
  }

  private async getRelatedS3Objects(
    correlation: AdminObservabilityCorrelationDto,
  ): Promise<{ objects: AdminObservabilityS3ObjectDto[]; s3Status: AdminObservabilitySourceStatusDto }> {
    try {
      const result = await this.s3ObjectReader.listRelatedObjects(correlation)
      return { objects: result.objects, s3Status: result.status }
    } catch (error) {
      return {
        objects: [],
        s3Status: {
          source: 's3',
          state: 'error',
          message: error instanceof Error ? error.message : 'S3 object lookup failed',
          count: 0,
        },
      }
    }
  }

  private matchesBox(box: AdminBoxItemDto, correlation: AdminObservabilityCorrelationDto): boolean {
    if (
      correlation.sandboxIds.includes(box.id) ||
      correlation.boxIds.includes(box.id) ||
      (box.boxId && correlation.boxIds.includes(box.boxId))
    ) {
      return true
    }

    if (correlation.sandboxIds.length > 0 || correlation.boxIds.length > 0) {
      return false
    }

    if (box.runnerId && correlation.runnerIds.includes(box.runnerId)) {
      return true
    }

    return correlation.orgIds.includes(box.organizationId)
  }

  private addUnique(target: string[], value: unknown) {
    if (typeof value !== 'string') {
      return
    }
    const trimmed = value.trim()
    if (trimmed && !target.includes(trimmed)) {
      target.push(trimmed)
    }
  }

  private buildBaseParams(query: AdminObservabilityQueryParamsDto): Record<string, unknown> {
    const page = query.page ?? 1
    const limit = query.limit ?? 100
    return {
      ...this.buildTimeRange(query),
      limit,
      offset: (page - 1) * limit,
    }
  }

  private buildTimeRange(query: AdminObservabilityQueryParamsDto): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date()
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - DEFAULT_OBSERVABILITY_LOOKBACK_MS)
    return { from, to }
  }

  private buildWhereClause(
    timestampColumn: 'Timestamp' | 'TimeUnix',
    query: AdminObservabilityQueryParamsDto,
    params: Record<string, unknown>,
  ): string[] {
    const whereClause = [`${timestampColumn} >= {from:DateTime64}`, `${timestampColumn} <= {to:DateTime64}`]

    if (query.layer) {
      whereClause.push(`${LAYER_EXPRESSION_SQL} = {layer:String}`)
      params.layer = query.layer
    }
    if (query.serviceName) {
      whereClause.push('ServiceName = {serviceName:String}')
      params.serviceName = query.serviceName
    }
    this.pushResourceAttributeFilter(whereClause, params, 'boxlite.org_id', 'orgId', query.orgId)
    this.pushSandboxIdFilter(whereClause, params, query.sandboxId)
    this.pushResourceAttributeFilter(whereClause, params, 'boxlite.box_id', 'boxId', query.boxId)
    this.pushResourceAttributeFilter(whereClause, params, 'boxlite.runner_id', 'runnerId', query.runnerId)
    this.pushResourceAttributeFilter(whereClause, params, 'boxlite.machine_id', 'machineId', query.machineId)

    return whereClause
  }

  private pushResourceAttributeFilter(
    whereClause: string[],
    params: Record<string, unknown>,
    attributeName: string,
    paramName: string,
    value?: string,
  ) {
    if (!value) {
      return
    }
    whereClause.push(`ResourceAttributes['${attributeName}'] = {${paramName}:String}`)
    params[paramName] = value
  }

  private pushSandboxIdFilter(whereClause: string[], params: Record<string, unknown>, sandboxId?: string) {
    if (!sandboxId) {
      return
    }
    whereClause.push(
      `(ResourceAttributes['boxlite.sandbox_id'] = {sandboxId:String} OR ServiceName = {sandboxServiceName:String})`,
    )
    params.sandboxId = sandboxId
    params.sandboxServiceName = `sandbox-${sandboxId}`
  }

  private pushTraceIdFilter(whereClause: string[], params: Record<string, unknown>, traceId?: string) {
    if (!traceId) {
      return
    }
    whereClause.push('TraceId = {traceId:String}')
    params.traceId = traceId
  }

  private pushAttributeFilter(
    whereClause: string[],
    params: Record<string, unknown>,
    columnName: 'LogAttributes' | 'SpanAttributes',
    attributeName: string,
    paramName: string,
    value?: string,
  ) {
    if (!value) {
      return
    }
    whereClause.push(
      `(${columnName}['${attributeName}'] = {${paramName}:String} OR ResourceAttributes['${attributeName}'] = {${paramName}:String})`,
    )
    params[paramName] = value
  }
}
