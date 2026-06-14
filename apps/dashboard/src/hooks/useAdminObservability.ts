/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { useApi } from '@/hooks/useApi'
import { useQuery, UseQueryOptions } from '@tanstack/react-query'

export const OBSERVABILITY_LAYERS = ['api', 'runner', 'ec2_host', 'box'] as const
export type ObservabilityLayer = (typeof OBSERVABILITY_LAYERS)[number]

export const OBSERVABILITY_STATES = ['missing', 'configured', 'receiving', 'stale', 'error'] as const
export type ObservabilityState = (typeof OBSERVABILITY_STATES)[number]

export interface AdminObservabilityBackendStatus {
  configured: boolean
  state: ObservabilityState
  message?: string
}

export interface AdminObservabilityLayerStatus {
  layer: ObservabilityLayer
  state: ObservabilityState
  signals: Record<'logs' | 'traces' | 'metrics', ObservabilityState>
  lastSeen?: string
}

export interface AdminObservabilityStatus {
  backend: AdminObservabilityBackendStatus
  layers: AdminObservabilityLayerStatus[]
}

export interface AdminObservabilityBaseParams {
  from: Date
  to: Date
  page?: number
  limit?: number
  layer?: ObservabilityLayer | 'all'
  serviceName?: string
  orgId?: string
  sandboxId?: string
  boxId?: string
  runnerId?: string
  machineId?: string
  traceId?: string
  requestId?: string
  operationId?: string
  executionId?: string
  jobId?: string
}

export interface AdminObservabilityLogsParams extends AdminObservabilityBaseParams {
  severities?: string[]
  search?: string
}

export interface AdminObservabilityMetricsParams extends AdminObservabilityBaseParams {
  metricNames?: string[]
}

export interface AdminObservabilityLogEntry {
  timestamp: string
  body: string
  severityText: string
  severityNumber?: number
  serviceName: string
  resourceAttributes: Record<string, string>
  logAttributes: Record<string, string>
  traceId?: string
  spanId?: string
}

export interface AdminObservabilityTraceSummary {
  traceId: string
  rootSpanName: string
  startTime: string
  endTime: string
  durationMs: number
  spanCount: number
  statusCode?: string
}

export interface AdminObservabilityTraceSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  spanName: string
  timestamp: string
  durationNs: number
  spanAttributes: Record<string, string>
  statusCode?: string
  statusMessage?: string
}

export interface AdminObservabilityMetricDataPoint {
  timestamp: string
  value: number
}

export interface AdminObservabilityMetricSeries {
  metricName: string
  layer?: ObservabilityLayer
  dataPoints: AdminObservabilityMetricDataPoint[]
}

export interface AdminObservabilityMetricsResponse {
  series: AdminObservabilityMetricSeries[]
}

export type AdminObservabilitySourceState = 'available' | 'missing' | 'not_configured' | 'error'
export type AdminObservabilitySource = 'clickhouse' | 'postgres' | 'audit' | 'cloudwatch' | 's3' | 'xlog'

export interface AdminObservabilitySourceStatus {
  source: AdminObservabilitySource
  state: AdminObservabilitySourceState
  message?: string
  count?: number
}

export interface AdminObservabilityCorrelation {
  traceIds: string[]
  orgIds: string[]
  sandboxIds: string[]
  boxIds: string[]
  runnerIds: string[]
  machineIds: string[]
  requestIds: string[]
  operationIds: string[]
  executionIds: string[]
  jobIds: string[]
  serviceNames: string[]
}

export interface AdminObservabilityAuditLog {
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
  createdAt: string
}

export interface AdminObservabilityXLog {
  source: string
  timestamp: string
  serviceName: string
  body: string
  severityText?: string
  traceId?: string
  spanId?: string
  executionId?: string
  jobId?: string
  stream?: string
  attributes?: Record<string, unknown>
}

export interface AdminObservabilityS3Object {
  bucket: string
  key: string
  size?: number
  lastModified?: string
  etag?: string
  matchedBy?: string
}

export interface AdminObservabilityInvestigateResponse {
  correlation: AdminObservabilityCorrelation
  sources: AdminObservabilitySourceStatus[]
  traceSpans: AdminObservabilityTraceSpan[]
  logs: AdminObservabilityLogEntry[]
  metrics: AdminObservabilityMetricsResponse
  boxes: Array<Record<string, unknown>>
  runners: Array<Record<string, unknown>>
  machines: Array<Record<string, unknown>>
  auditLogs: AdminObservabilityAuditLog[]
  xlogs: AdminObservabilityXLog[]
  s3Objects: AdminObservabilityS3Object[]
}

export interface AdminObservabilityPage<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
}

export const adminObservabilityQueryKeys = {
  all: ['admin-observability'] as const,
  status: () => [...adminObservabilityQueryKeys.all, 'status'] as const,
  logs: (params: AdminObservabilityLogsParams) =>
    [...adminObservabilityQueryKeys.all, 'logs', stableParams(params)] as const,
  traces: (params: AdminObservabilityBaseParams) =>
    [...adminObservabilityQueryKeys.all, 'traces', stableParams(params)] as const,
  traceSpans: (traceId: string, params: AdminObservabilityBaseParams) =>
    [...adminObservabilityQueryKeys.all, 'traces', traceId, stableParams(params)] as const,
  metrics: (params: AdminObservabilityMetricsParams) =>
    [...adminObservabilityQueryKeys.all, 'metrics', stableParams(params)] as const,
  investigate: (params: AdminObservabilityBaseParams) =>
    [...adminObservabilityQueryKeys.all, 'investigate', stableParams(params)] as const,
}

function stableParams(
  params: AdminObservabilityBaseParams | AdminObservabilityLogsParams | AdminObservabilityMetricsParams,
) {
  return {
    ...params,
    from: params.from.toISOString(),
    to: params.to.toISOString(),
  }
}

export function buildAdminObservabilitySearchParams(
  params: AdminObservabilityBaseParams | AdminObservabilityLogsParams | AdminObservabilityMetricsParams,
): URLSearchParams {
  const searchParams = new URLSearchParams()
  searchParams.set('from', params.from.toISOString())
  searchParams.set('to', params.to.toISOString())

  appendIfPresent(searchParams, 'page', params.page)
  appendIfPresent(searchParams, 'limit', params.limit)
  appendIfPresent(searchParams, 'layer', params.layer === 'all' ? undefined : params.layer)
  appendIfPresent(searchParams, 'serviceName', params.serviceName)
  appendIfPresent(searchParams, 'orgId', params.orgId)
  appendIfPresent(searchParams, 'sandboxId', params.sandboxId)
  appendIfPresent(searchParams, 'boxId', params.boxId)
  appendIfPresent(searchParams, 'runnerId', params.runnerId)
  appendIfPresent(searchParams, 'machineId', params.machineId)
  appendIfPresent(searchParams, 'traceId', params.traceId)
  appendIfPresent(searchParams, 'requestId', params.requestId)
  appendIfPresent(searchParams, 'operationId', params.operationId)
  appendIfPresent(searchParams, 'executionId', params.executionId)
  appendIfPresent(searchParams, 'jobId', params.jobId)

  for (const severity of (params as AdminObservabilityLogsParams).severities ?? []) {
    searchParams.append('severities', severity)
  }
  for (const metricName of (params as AdminObservabilityMetricsParams).metricNames ?? []) {
    searchParams.append('metricNames', metricName)
  }
  appendIfPresent(searchParams, 'search', (params as AdminObservabilityLogsParams).search)

  return searchParams
}

function appendIfPresent(searchParams: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null || value === '') {
    return
  }
  searchParams.set(key, String(value))
}

export function useAdminObservabilityStatus(
  options?: Omit<UseQueryOptions<AdminObservabilityStatus>, 'queryKey' | 'queryFn'>,
) {
  const api = useApi()

  return useQuery<AdminObservabilityStatus>({
    queryKey: adminObservabilityQueryKeys.status(),
    queryFn: async () => {
      const response = await api.axiosInstance.get('/admin/observability/status')
      return response.data
    },
    staleTime: 30_000,
    retry: false,
    ...options,
  })
}

export function useAdminObservabilityLogs(
  params: AdminObservabilityLogsParams,
  options?: Omit<UseQueryOptions<AdminObservabilityPage<AdminObservabilityLogEntry>>, 'queryKey' | 'queryFn'>,
) {
  const api = useApi()

  return useQuery<AdminObservabilityPage<AdminObservabilityLogEntry>>({
    queryKey: adminObservabilityQueryKeys.logs(params),
    queryFn: async () => {
      const response = await api.axiosInstance.get('/admin/observability/logs', {
        params: buildAdminObservabilitySearchParams(params),
      })
      return response.data
    },
    staleTime: 10_000,
    ...options,
  })
}

export function useAdminObservabilityTraces(
  params: AdminObservabilityBaseParams,
  options?: Omit<UseQueryOptions<AdminObservabilityPage<AdminObservabilityTraceSummary>>, 'queryKey' | 'queryFn'>,
) {
  const api = useApi()

  return useQuery<AdminObservabilityPage<AdminObservabilityTraceSummary>>({
    queryKey: adminObservabilityQueryKeys.traces(params),
    queryFn: async () => {
      const response = await api.axiosInstance.get('/admin/observability/traces', {
        params: buildAdminObservabilitySearchParams(params),
      })
      return response.data
    },
    staleTime: 10_000,
    ...options,
  })
}

export function useAdminObservabilityTraceSpans(
  traceId: string | undefined,
  params: AdminObservabilityBaseParams,
  options?: Omit<UseQueryOptions<AdminObservabilityTraceSpan[]>, 'queryKey' | 'queryFn'>,
) {
  const api = useApi()

  return useQuery<AdminObservabilityTraceSpan[]>({
    queryKey: adminObservabilityQueryKeys.traceSpans(traceId ?? '', params),
    queryFn: async () => {
      if (!traceId) {
        throw new Error('Missing trace ID')
      }
      const response = await api.axiosInstance.get(`/admin/observability/traces/${encodeURIComponent(traceId)}`, {
        params: buildAdminObservabilitySearchParams(params),
      })
      return response.data
    },
    enabled: !!traceId,
    staleTime: 30_000,
    ...options,
  })
}

export function useAdminObservabilityMetrics(
  params: AdminObservabilityMetricsParams,
  options?: Omit<UseQueryOptions<AdminObservabilityMetricsResponse>, 'queryKey' | 'queryFn'>,
) {
  const api = useApi()

  return useQuery<AdminObservabilityMetricsResponse>({
    queryKey: adminObservabilityQueryKeys.metrics(params),
    queryFn: async () => {
      const response = await api.axiosInstance.get('/admin/observability/metrics', {
        params: buildAdminObservabilitySearchParams(params),
      })
      return response.data
    },
    staleTime: 10_000,
    ...options,
  })
}

export function useAdminObservabilityInvestigate(
  params: AdminObservabilityBaseParams,
  options?: Omit<UseQueryOptions<AdminObservabilityInvestigateResponse>, 'queryKey' | 'queryFn'>,
) {
  const api = useApi()

  return useQuery<AdminObservabilityInvestigateResponse>({
    queryKey: adminObservabilityQueryKeys.investigate(params),
    queryFn: async () => {
      const response = await api.axiosInstance.get('/admin/observability/investigate', {
        params: buildAdminObservabilitySearchParams(params),
      })
      return response.data
    },
    staleTime: 10_000,
    ...options,
  })
}
