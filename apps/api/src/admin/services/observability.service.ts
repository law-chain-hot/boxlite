/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, ServiceUnavailableException } from '@nestjs/common'
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
  constructor(private readonly clickhouseService: ClickHouseService) {}

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
    const whereSql = this.buildWhereClause('Timestamp', query, params).join('\n        AND ')

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

    const seriesMap = new Map<string, { metricName: string; layer?: ObservabilityLayer; dataPoints: MetricDataPointDto[] }>()
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

  private buildBaseParams(query: AdminObservabilityQueryParamsDto): Record<string, unknown> {
    const page = query.page ?? 1
    const limit = query.limit ?? 100
    return {
      from: new Date(query.from),
      to: new Date(query.to),
      limit,
      offset: (page - 1) * limit,
    }
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
    this.pushResourceAttributeFilter(whereClause, params, 'boxlite.sandbox_id', 'sandboxId', query.sandboxId)
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
}
