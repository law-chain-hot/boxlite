/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CopyButton } from '@/components/CopyButton'
import { PageContent, PageHeader, PageLayout, PageTitle } from '@/components/PageLayout'
import { SeverityBadge } from '@/components/telemetry/SeverityBadge'
import { buildTraceWaterfallRows, resolveSelectedTraceId } from '@/components/telemetry/traceWaterfall'
import { Badge, BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DateRangePicker, QuickRangesConfig } from '@/components/ui/date-range-picker'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AdminObservabilityBaseParams,
  AdminObservabilityLogEntry,
  AdminObservabilityMetricSeries,
  AdminObservabilityStatus,
  AdminObservabilityTraceSummary,
  OBSERVABILITY_LAYERS,
  ObservabilityLayer,
  ObservabilityState,
  useAdminObservabilityLogs,
  useAdminObservabilityMetrics,
  useAdminObservabilityStatus,
  useAdminObservabilityTraceSpans,
  useAdminObservabilityTraces,
} from '@/hooks/useAdminObservability'
import { cn } from '@/lib/utils'
import { DateRange } from 'react-day-picker'
import { format, subHours } from 'date-fns'
import {
  Activity,
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'

const OBSERVABILITY_QUICK_RANGES: QuickRangesConfig = {
  minutes: [15, 30],
  hours: [1, 3, 6, 12, 24],
  days: [3, 7],
}

const PAGE_LIMIT = 50
const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

const LAYER_LABELS: Record<ObservabilityLayer, string> = {
  api: 'API',
  runner: 'Runner',
  ec2_host: 'EC2 Host',
  box: 'Box',
}

const STATE_VARIANTS: Record<ObservabilityState, BadgeProps['variant']> = {
  missing: 'outline',
  configured: 'secondary',
  receiving: 'success',
  stale: 'warning',
  error: 'destructive',
}

interface FilterState {
  layer: ObservabilityLayer | 'all'
  serviceName: string
  orgId: string
  sandboxId: string
  boxId: string
  runnerId: string
  machineId: string
}

function createDefaultRange(): DateRange {
  const now = new Date()
  return { from: subHours(now, 1), to: now }
}

function formatTimestamp(timestamp?: string) {
  if (!timestamp) return '-'
  try {
    return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss.SSS')
  } catch {
    return timestamp
  }
}

function formatDuration(durationMs: number) {
  if (durationMs < 1) return `${(durationMs * 1000).toFixed(2)}us`
  if (durationMs < 1000) return `${durationMs.toFixed(2)}ms`
  return `${(durationMs / 1000).toFixed(2)}s`
}

function truncateMiddle(value: string, head = 8, tail = 8) {
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function StateBadge({ state }: { state: ObservabilityState }) {
  return (
    <Badge variant={STATE_VARIANTS[state]} className="capitalize">
      {state}
    </Badge>
  )
}

function getLayerFromResource(resourceAttributes?: Record<string, string>) {
  const layer = resourceAttributes?.['boxlite.layer']
  return OBSERVABILITY_LAYERS.includes(layer as ObservabilityLayer) ? LAYER_LABELS[layer as ObservabilityLayer] : '-'
}

function getErrorDescription(error: unknown) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: { message?: string } } }).response
    if (response?.status === 403) return 'System Admin access required.'
    if (response?.data?.message) return response.data.message
  }
  if (error instanceof Error) return error.message
  return 'Request failed.'
}

function buildBaseParams(dateRange: DateRange, filters: FilterState): AdminObservabilityBaseParams {
  const fallback = createDefaultRange()
  return {
    from: dateRange.from ?? fallback.from!,
    to: dateRange.to ?? fallback.to!,
    layer: filters.layer,
    serviceName: filters.serviceName.trim() || undefined,
    orgId: filters.orgId.trim() || undefined,
    sandboxId: filters.sandboxId.trim() || undefined,
    boxId: filters.boxId.trim() || undefined,
    runnerId: filters.runnerId.trim() || undefined,
    machineId: filters.machineId.trim() || undefined,
  }
}

function QueryError({ error, icon: Icon = AlertCircle }: { error: unknown; icon?: React.ElementType }) {
  return (
    <Empty variant="warning" className="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="size-4" />
        </EmptyMedia>
        <EmptyTitle>Unable to load data</EmptyTitle>
        <EmptyDescription>{getErrorDescription(error)}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function StatusPanel({
  status,
  isLoading,
  onRefresh,
}: {
  status?: AdminObservabilityStatus
  isLoading: boolean
  onRefresh: () => void
}) {
  const layerStatuses: AdminObservabilityStatus['layers'] =
    status?.layers ??
    OBSERVABILITY_LAYERS.map((layer) => ({
      layer,
      state: 'missing' as ObservabilityState,
      signals: {
        logs: 'missing' as ObservabilityState,
        traces: 'missing' as ObservabilityState,
        metrics: 'missing' as ObservabilityState,
      },
    }))

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,2.25fr)]">
      <div className="rounded-md border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Backend
            </div>
            <div className="mt-3">
              {isLoading ? <Spinner className="size-4" /> : <StateBadge state={status?.backend.state ?? 'missing'} />}
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" onClick={onRefresh} aria-label="Refresh status">
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh status</TooltipContent>
          </Tooltip>
        </div>
        {status?.backend.message && (
          <p className="mt-3 break-words text-xs leading-5 text-muted-foreground">{status.backend.message}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {layerStatuses.map((layerStatus) => (
          <div key={layerStatus.layer} className="rounded-md border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{LAYER_LABELS[layerStatus.layer]}</div>
              <StateBadge state={layerStatus.state} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              {(['logs', 'traces', 'metrics'] as const).map((signal) => (
                <div key={signal} className="min-w-0 rounded-sm bg-muted/40 px-2 py-1.5">
                  <div className="truncate text-muted-foreground">{signal}</div>
                  <div className="truncate font-medium capitalize">{layerStatus.signals?.[signal] ?? 'missing'}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 truncate font-mono text-xs text-muted-foreground">
              {formatTimestamp(layerStatus.lastSeen)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FilterBar({
  dateRange,
  filters,
  onDateRangeChange,
  onFilterChange,
}: {
  dateRange: DateRange
  filters: FilterState
  onDateRangeChange: (range: DateRange) => void
  onFilterChange: (next: Partial<FilterState>) => void
}) {
  return (
    <section className="grid gap-3 rounded-md border border-border bg-background p-3 lg:grid-cols-[minmax(17rem,0.9fr)_minmax(0,2.1fr)]">
      <DateRangePicker
        value={dateRange}
        onChange={onDateRangeChange}
        quickRangesEnabled
        quickRanges={OBSERVABILITY_QUICK_RANGES}
        timeSelection
        className="min-w-0 justify-start"
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        <Select
          value={filters.layer}
          onValueChange={(value) => onFilterChange({ layer: value as FilterState['layer'] })}
        >
          <SelectTrigger className="h-9" aria-label="Layer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All layers</SelectItem>
            {OBSERVABILITY_LAYERS.map((layer) => (
              <SelectItem key={layer} value={layer}>
                {LAYER_LABELS[layer]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={filters.serviceName}
          placeholder="service.name"
          onChange={(event) => onFilterChange({ serviceName: event.target.value })}
        />
        <Input
          value={filters.orgId}
          placeholder="org id"
          onChange={(event) => onFilterChange({ orgId: event.target.value })}
        />
        <Input
          value={filters.sandboxId}
          placeholder="sandbox id"
          onChange={(event) => onFilterChange({ sandboxId: event.target.value })}
        />
        <Input
          value={filters.boxId}
          placeholder="box id"
          onChange={(event) => onFilterChange({ boxId: event.target.value })}
        />
        <Input
          value={filters.runnerId}
          placeholder="runner id"
          onChange={(event) => onFilterChange({ runnerId: event.target.value })}
        />
        <Input
          value={filters.machineId}
          placeholder="machine id"
          onChange={(event) => onFilterChange({ machineId: event.target.value })}
        />
      </div>
    </section>
  )
}

function LogsPanel({ baseParams }: { baseParams: AdminObservabilityBaseParams }) {
  const [page, setPage] = useState(1)
  const [severity, setSeverity] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  useEffect(() => {
    setPage(1)
    setExpandedRow(null)
  }, [
    baseParams.from,
    baseParams.to,
    baseParams.layer,
    baseParams.serviceName,
    baseParams.orgId,
    baseParams.sandboxId,
    baseParams.boxId,
    baseParams.runnerId,
    baseParams.machineId,
    severity,
    search,
  ])

  const queryParams = useMemo(
    () => ({
      ...baseParams,
      page,
      limit: PAGE_LIMIT,
      severities: severity === 'all' ? undefined : [severity],
      search: search || undefined,
    }),
    [baseParams, page, search, severity],
  )
  const { data, error, isError, isLoading, isRefetching, refetch } = useAdminObservabilityLogs(queryParams)

  const runSearch = useCallback(() => {
    setSearch(searchInput.trim())
    setPage(1)
  }, [searchInput])

  return (
    <div className="flex min-h-[34rem] flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 gap-2 sm:w-[24rem]">
          <Input
            value={searchInput}
            placeholder="Search logs"
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && runSearch()}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={runSearch} aria-label="Search logs">
                <Search className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search logs</TooltipContent>
          </Tooltip>
        </div>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="h-9 sm:w-36" aria-label="Severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {['DEBUG', 'INFO', 'WARN', 'ERROR'].map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="sm:ml-auto"
              onClick={() => refetch()}
              aria-label="Refresh logs"
            >
              <RefreshCw className={cn('size-4', isRefetching && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh logs</TooltipContent>
        </Tooltip>
      </div>

      {isError ? (
        <QueryError error={error} icon={FileText} />
      ) : (
        <ScrollArea fade="mask" horizontal className="min-h-[28rem] rounded-md border border-border">
          {isLoading ? (
            <div className="flex h-56 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : !data?.items?.length ? (
            <Empty variant="neutral" className="h-56 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText className="size-4" />
                </EmptyMedia>
                <EmptyTitle>No logs found</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-52">Time</TableHead>
                  <TableHead className="w-28">Layer</TableHead>
                  <TableHead className="w-36">Severity</TableHead>
                  <TableHead className="w-48">Service</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-44">Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((log: AdminObservabilityLogEntry, index: number) => {
                  const isExpanded = expandedRow === index
                  return (
                    <React.Fragment key={`${log.timestamp}-${index}-${log.spanId ?? log.traceId ?? log.body}`}>
                      <TableRow className="cursor-pointer" onClick={() => setExpandedRow(isExpanded ? null : index)}>
                        <TableCell>
                          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{formatTimestamp(log.timestamp)}</TableCell>
                        <TableCell>{getLayerFromResource(log.resourceAttributes)}</TableCell>
                        <TableCell>
                          <SeverityBadge severity={log.severityText || 'INFO'} />
                        </TableCell>
                        <TableCell className="max-w-48 truncate font-mono text-xs">{log.serviceName}</TableCell>
                        <TableCell className="max-w-[34rem] truncate font-mono text-xs">{log.body}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.traceId ? (
                            <div className="group/copy-button flex items-center gap-1">
                              <span>{truncateMiddle(log.traceId)}</span>
                              <CopyButton value={log.traceId} tooltipText="Copy Trace ID" size="icon-xs" autoHide />
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30 p-4">
                            <div className="grid gap-3 lg:grid-cols-2">
                              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs">
                                {log.body}
                              </pre>
                              <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                                {JSON.stringify(
                                  {
                                    resourceAttributes: log.resourceAttributes,
                                    logAttributes: log.logAttributes,
                                    traceId: log.traceId,
                                    spanId: log.spanId,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      )}

      <PaginationBar
        page={page}
        totalPages={data?.totalPages ?? 0}
        total={data?.total ?? 0}
        entity="logs"
        onPageChange={setPage}
      />
    </div>
  )
}

function TracesPanel({ baseParams }: { baseParams: AdminObservabilityBaseParams }) {
  const [page, setPage] = useState(1)
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
    setSelectedTraceId(null)
  }, [
    baseParams.from,
    baseParams.to,
    baseParams.layer,
    baseParams.serviceName,
    baseParams.orgId,
    baseParams.sandboxId,
    baseParams.boxId,
    baseParams.runnerId,
    baseParams.machineId,
  ])

  const queryParams = useMemo(() => ({ ...baseParams, page, limit: PAGE_LIMIT }), [baseParams, page])
  const { data, error, isError, isLoading, isRefetching, refetch } = useAdminObservabilityTraces(queryParams)
  const { data: spans, isLoading: spansLoading } = useAdminObservabilityTraceSpans(
    selectedTraceId ?? undefined,
    baseParams,
    {
      enabled: !!selectedTraceId,
    },
  )

  useEffect(() => {
    const nextTraceId = resolveSelectedTraceId(data?.items ?? [], selectedTraceId)
    if (nextTraceId !== selectedTraceId) {
      setSelectedTraceId(nextTraceId)
    }
  }, [data?.items, selectedTraceId])

  const selectedTrace = data?.items.find((trace) => trace.traceId === selectedTraceId)
  const waterfallRows = useMemo(() => buildTraceWaterfallRows(spans), [spans])

  return (
    <div className="flex min-h-[34rem] flex-col gap-3">
      <div className="flex justify-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh traces">
              <RefreshCw className={cn('size-4', isRefetching && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh traces</TooltipContent>
        </Tooltip>
      </div>

      {isError ? (
        <QueryError error={error} icon={Activity} />
      ) : isLoading ? (
        <div className="flex h-56 items-center justify-center rounded-md border border-border">
          <Spinner className="size-6" />
        </div>
      ) : !data?.items?.length ? (
        <Empty variant="neutral" className="min-h-56">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Activity className="size-4" />
            </EmptyMedia>
            <EmptyTitle>No traces found</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(28rem,0.95fr)]">
          <ScrollArea fade="mask" horizontal className="min-h-[28rem] min-w-0 rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Trace ID</TableHead>
                  <TableHead>Root Span</TableHead>
                  <TableHead className="w-52">Start</TableHead>
                  <TableHead className="w-28">Duration</TableHead>
                  <TableHead className="w-20 text-center">Spans</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((trace: AdminObservabilityTraceSummary) => (
                  <TableRow
                    key={trace.traceId}
                    className={cn('cursor-pointer', trace.traceId === selectedTraceId && 'bg-muted/70')}
                    onClick={() => setSelectedTraceId(trace.traceId)}
                  >
                    <TableCell className="font-mono text-xs">
                      <div className="group/copy-button flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{truncateMiddle(trace.traceId)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <code className="font-mono text-xs">{trace.traceId}</code>
                          </TooltipContent>
                        </Tooltip>
                        <CopyButton value={trace.traceId} tooltipText="Copy Trace ID" size="icon-xs" autoHide />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-sm truncate">{trace.rootSpanName || '(root)'}</TableCell>
                    <TableCell className="font-mono text-xs">{formatTimestamp(trace.startTime)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatDuration(trace.durationMs)}</TableCell>
                    <TableCell className="text-center">{trace.spanCount}</TableCell>
                    <TableCell>{trace.statusCode || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <section className="min-h-[28rem] min-w-0 rounded-md border border-border bg-background">
            <div className="border-b border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{selectedTrace?.rootSpanName || 'Trace detail'}</div>
                  <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{selectedTraceId ?? '-'}</div>
                </div>
                {selectedTraceId && <CopyButton value={selectedTraceId} tooltipText="Copy Trace ID" size="icon-xs" />}
              </div>
            </div>
            <ScrollArea fade="mask" className="h-[27rem]">
              {spansLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Spinner className="size-6" />
                </div>
              ) : !waterfallRows.length ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  No spans found
                </div>
              ) : (
                <div className="space-y-2 p-3">
                  {waterfallRows.map((span) => (
                    <details key={span.spanId} className="group rounded-md border border-border bg-card/60 p-2">
                      <summary className="cursor-pointer list-none">
                        <div
                          className="flex min-w-0 items-center gap-2"
                          style={{ paddingLeft: `${span.depth * 14}px` }}
                        >
                          <div className="w-44 shrink-0 truncate text-sm">{span.spanName}</div>
                          <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded bg-muted">
                            <div
                              className="absolute h-full rounded bg-primary/70"
                              style={{
                                left: `${Math.min(span.offsetPercent, 99)}%`,
                                width: `${Math.max(span.widthPercent, 1)}%`,
                              }}
                            />
                          </div>
                          <div className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground">
                            {formatDuration(span.durationMs)}
                          </div>
                        </div>
                      </summary>
                      <pre className="mt-3 max-h-52 overflow-auto rounded-md bg-muted/50 p-2 text-xs">
                        {JSON.stringify(
                          {
                            spanId: span.spanId,
                            parentSpanId: span.parentSpanId,
                            statusCode: span.statusCode,
                            statusMessage: span.statusMessage,
                            spanAttributes: span.spanAttributes,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ))}
                </div>
              )}
            </ScrollArea>
          </section>
        </div>
      )}

      <PaginationBar
        page={page}
        totalPages={data?.totalPages ?? 0}
        total={data?.total ?? 0}
        entity="traces"
        onPageChange={setPage}
      />
    </div>
  )
}

function MetricsPanel({ baseParams }: { baseParams: AdminObservabilityBaseParams }) {
  const [metricInput, setMetricInput] = useState('')
  const [metricNames, setMetricNames] = useState<string[]>([])
  const queryParams = useMemo(() => ({ ...baseParams, metricNames }), [baseParams, metricNames])
  const { data, error, isError, isLoading, isRefetching, refetch } = useAdminObservabilityMetrics(queryParams)

  const applyMetricFilter = useCallback(() => {
    setMetricNames(
      metricInput
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    )
  }, [metricInput])

  return (
    <div className="flex min-h-[34rem] flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 gap-2 sm:w-[28rem]">
          <Input
            value={metricInput}
            placeholder="metric names, comma separated"
            onChange={(event) => setMetricInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && applyMetricFilter()}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={applyMetricFilter} aria-label="Apply metric filter">
                <Search className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Apply metric filter</TooltipContent>
          </Tooltip>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="sm:ml-auto"
              onClick={() => refetch()}
              aria-label="Refresh metrics"
            >
              <RefreshCw className={cn('size-4', isRefetching && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh metrics</TooltipContent>
        </Tooltip>
      </div>

      {isError ? (
        <QueryError error={error} icon={BarChart3} />
      ) : isLoading ? (
        <div className="flex h-56 items-center justify-center rounded-md border border-border">
          <Spinner className="size-6" />
        </div>
      ) : !data?.series?.length ? (
        <Empty variant="neutral" className="min-h-56">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BarChart3 className="size-4" />
            </EmptyMedia>
            <EmptyTitle>No metrics found</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {data.series.map((series, index) => (
            <MetricChart
              key={`${series.metricName}-${series.layer ?? 'unknown'}`}
              series={series}
              color={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MetricChart({ series, color }: { series: AdminObservabilityMetricSeries; color: string }) {
  const latest = series.dataPoints.at(-1)
  const chartData = series.dataPoints.map((point) => ({
    timestamp: point.timestamp,
    value: point.value,
  }))

  return (
    <section className="min-h-[18rem] rounded-md border border-border bg-background p-3">
      <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate font-mono text-sm font-medium">{series.metricName}</div>
            {series.layer && (
              <Badge variant="outline" className="shrink-0">
                {LAYER_LABELS[series.layer]}
              </Badge>
            )}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {latest ? `${latest.value} @ ${formatTimestamp(latest.timestamp)}` : '-'}
          </div>
        </div>
        <CopyButton value={series.metricName} tooltipText="Copy metric name" size="icon-xs" />
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => {
                try {
                  return format(new Date(value), 'HH:mm')
                } catch {
                  return value
                }
              }}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
            />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} width={56} />
            <RechartsTooltip
              labelFormatter={(value) => formatTimestamp(String(value))}
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 6,
                color: 'hsl(var(--foreground))',
              }}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function PaginationBar({
  page,
  totalPages,
  total,
  entity,
  onPageChange,
}: {
  page: number
  totalPages: number
  total: number
  entity: string
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages} ({total} {entity})
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

const AdminObservability: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>(() => createDefaultRange())
  const [filters, setFilters] = useState<FilterState>({
    layer: 'all',
    serviceName: '',
    orgId: '',
    sandboxId: '',
    boxId: '',
    runnerId: '',
    machineId: '',
  })
  const {
    data: status,
    error: statusError,
    isError: statusIsError,
    isLoading: statusLoading,
    refetch,
  } = useAdminObservabilityStatus()

  const baseParams = useMemo(() => buildBaseParams(dateRange, filters), [dateRange, filters])
  const telemetryReady = status?.backend.configured && status.backend.state !== 'missing'

  const handleFilterChange = useCallback((next: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...next }))
  }, [])

  return (
    <PageLayout>
      <PageHeader size="full">
        <PageTitle>Observability</PageTitle>
      </PageHeader>

      <PageContent size="full">
        {statusIsError ? (
          <QueryError error={statusError} icon={ShieldCheck} />
        ) : (
          <>
            <StatusPanel status={status} isLoading={statusLoading} onRefresh={() => refetch()} />
            <FilterBar
              dateRange={dateRange}
              filters={filters}
              onDateRangeChange={setDateRange}
              onFilterChange={handleFilterChange}
            />

            {telemetryReady ? (
              <Tabs defaultValue="logs" className="min-h-0 rounded-md border border-border bg-background">
                <TabsList variant="underline">
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                  <TabsTrigger value="traces">Traces</TabsTrigger>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
                </TabsList>
                <TabsContent value="logs" className="p-3">
                  <LogsPanel baseParams={baseParams} />
                </TabsContent>
                <TabsContent value="traces" className="p-3">
                  <TracesPanel baseParams={baseParams} />
                </TabsContent>
                <TabsContent value="metrics" className="p-3">
                  <MetricsPanel baseParams={baseParams} />
                </TabsContent>
              </Tabs>
            ) : (
              <Empty variant="neutral" className="min-h-64">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <AlertCircle className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>Telemetry backend unavailable</EmptyTitle>
                  <EmptyDescription>{status?.backend.message ?? 'ClickHouse is not configured.'}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </>
        )}
      </PageContent>
    </PageLayout>
  )
}

export default AdminObservability
