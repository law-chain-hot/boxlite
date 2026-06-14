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
