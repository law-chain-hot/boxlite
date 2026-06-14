/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import React, { useState, useCallback } from 'react'
import { useSandboxMetrics, MetricsQueryParams } from '@/hooks/useSandboxMetrics'
import { TelemetryScope } from '@/hooks/telemetryScope'
import { TimeRangeSelector } from './TimeRangeSelector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/components/ui/chart'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts'
import { RefreshCw, BarChart3, AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { format } from 'date-fns'
import { subHours } from 'date-fns'
import { MetricSeries } from '@boxlite-ai/api-client'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getMetricDisplayName, groupPlatformMetricSeries, PlatformMetricGroup } from './platformMetrics'

interface MetricsTabProps {
  sandboxId?: string
  scope?: TelemetryScope
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

const BYTES_TO_GIB = 1024 * 1024 * 1024

const IMPORTANT_EVENT_LOOP_DELAY_METRICS = [
  'nodejs.eventloop.delay.p99',
  'nodejs.eventloop.delay.p90',
  'nodejs.eventloop.delay.mean',
  'nodejs.eventloop.delay.max',
]

type ViewMode = '%' | 'GiB'

const METRIC_GROUPS = [
  { key: 'cpu', title: 'CPU', prefix: '.cpu.', hasToggle: false },
  { key: 'memory', title: 'Memory', prefix: '.memory.', hasToggle: true },
  { key: 'filesystem', title: 'Filesystem', prefix: '.filesystem.', hasToggle: true },
]

function isByteMetric(metricName: string): boolean {
  return !metricName.endsWith('.utilization')
}

function buildChartData(series: MetricSeries[], convertToGiB: boolean): Record<string, unknown>[] {
  const timestampSet = new Set<string>()
  series.forEach((s) => {
    s.dataPoints.forEach((point) => {
      timestampSet.add(point.timestamp)
    })
  })

  const timestamps = Array.from(timestampSet).sort()

  return timestamps.map((timestamp) => {
    const point: Record<string, unknown> = { timestamp }
    series.forEach((s) => {
      const dp = s.dataPoints.find((p) => p.timestamp === timestamp)
      if (dp?.value == null) {
        point[s.metricName] = null
      } else if (convertToGiB && isByteMetric(s.metricName)) {
        point[s.metricName] = Math.round((dp.value / BYTES_TO_GIB) * 100) / 100
      } else {
        point[s.metricName] = dp.value
      }
    })
    return point
  })
}

function buildChartConfig(series: MetricSeries[]): ChartConfig {
  const config: ChartConfig = {}
  series.forEach((s, index) => {
    config[s.metricName] = {
      label: getMetricDisplayName(s.metricName.replace(/^boxlite\.sandbox\./, '')),
      color: CHART_COLORS[index % CHART_COLORS.length],
    }
  })
  return config
}

const formatXAxis = (timestamp: string) => {
  try {
    return format(new Date(timestamp), 'HH:mm')
  } catch {
    return timestamp
  }
}

interface MetricGroupChartProps {
  title: string
  series: MetricSeries[]
  convertToGiB: boolean
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  description?: string
  watchFirst?: boolean
}

const MetricGroupChart: React.FC<MetricGroupChartProps> = ({
  title,
  series,
  convertToGiB,
  viewMode,
  onViewModeChange,
  description,
  watchFirst,
}) => {
  const chartData = React.useMemo(() => buildChartData(series, convertToGiB), [series, convertToGiB])
  const chartConfig = React.useMemo(() => buildChartConfig(series), [series])

  const displayTitle = viewMode ? `${title} (${viewMode})` : title

  return (
    <div className="min-h-[250px] rounded-md border border-border bg-background/50 p-3">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{displayTitle}</h3>
            {watchFirst && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                Watch first
              </Badge>
            )}
          </div>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        {viewMode && onViewModeChange && (
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) onViewModeChange(value as ViewMode)
            }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="%" className="text-xs px-2 h-6">
              %
            </ToggleGroupItem>
            <ToggleGroupItem value="GiB" className="text-xs px-2 h-6">
              GiB
            </ToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
      <ChartContainer config={chartConfig} className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatXAxis}
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={convertToGiB ? (value: number) => value.toFixed(2) : undefined}
              domain={viewMode === '%' ? [0, 100] : undefined}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => {
                    try {
                      return format(new Date(label as string), 'yyyy-MM-dd HH:mm:ss')
                    } catch {
                      return String(label)
                    }
                  }}
                />
              }
            />
            <Legend />
            {series.map((s, index) => (
              <Line
                key={s.metricName}
                type="monotone"
                dataKey={s.metricName}
                name={getMetricDisplayName(s.metricName.replace(/^boxlite\.sandbox\./, ''))}
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  )
}

function getLatestValue(series?: MetricSeries): number | null {
  const point = series?.dataPoints.at(-1)
  return point?.value ?? null
}

function getAverageValue(series?: MetricSeries): number | null {
  if (!series?.dataPoints.length) return null
  const total = series.dataPoints.reduce((sum, point) => sum + point.value, 0)
  return total / series.dataPoints.length
}

function getMaxValue(series?: MetricSeries): number | null {
  if (!series?.dataPoints.length) return null
  return Math.max(...series.dataPoints.map((point) => point.value))
}

function findSeries(series: MetricSeries[], metricName: string): MetricSeries | undefined {
  return series.find((item) => item.metricName === metricName)
}

function formatDurationLikeValue(value: number): string {
  if (value < 0.001) return `${(value * 1_000_000).toFixed(1)}us`
  if (value < 10) return `${(value * 1000).toFixed(value < 0.1 ? 1 : 0)}ms`
  if (value < 1000) return `${value.toFixed(value < 100 ? 1 : 0)}ms`
  return `${(value / 1000).toFixed(2)}s`
}

function formatMetricValue(metricName: string, value: number | null, options?: { convertToGiB?: boolean }) {
  if (value == null || Number.isNaN(value)) return '-'

  if (options?.convertToGiB || metricName.startsWith('v8js.memory.')) {
    return `${(value / BYTES_TO_GIB).toFixed(2)} GiB`
  }

  if (metricName.endsWith('.utilization')) {
    const percent = value <= 1 ? value * 100 : value
    return `${percent.toFixed(percent < 10 ? 1 : 0)}%`
  }

  if (metricName.includes('duration') || metricName.includes('delay') || metricName.endsWith('.time')) {
    return formatDurationLikeValue(value)
  }

  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

interface MetricStatCardProps {
  label: string
  value: string
  detail: string
  tone?: 'good' | 'watch' | 'critical' | 'neutral'
}

const MetricStatCard: React.FC<MetricStatCardProps> = ({ label, value, detail, tone = 'neutral' }) => {
  const toneClass =
    tone === 'critical'
      ? 'border-destructive/30 bg-destructive/5'
      : tone === 'watch'
        ? 'border-amber-500/30 bg-amber-500/5'
        : tone === 'good'
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'bg-background/50'

  return (
    <div className={`min-h-[7rem] rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {tone !== 'neutral' && (
          <Badge variant="outline" className="h-5 text-[10px] font-normal capitalize">
            {tone}
          </Badge>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{detail}</p>
    </div>
  )
}

function getMetricTone(metricName: string, value: number | null): MetricStatCardProps['tone'] {
  if (value == null) return 'neutral'

  if (metricName.endsWith('.utilization')) {
    const percent = value <= 1 ? value * 100 : value
    if (percent >= 80) return 'critical'
    if (percent >= 60) return 'watch'
    return 'good'
  }

  if (metricName === 'db.client.connection.pending_requests') {
    if (value >= 10) return 'critical'
    if (value >= 3) return 'watch'
    return 'good'
  }

  if (metricName.startsWith('v8js.memory.')) {
    return 'good'
  }

  if (metricName.includes('duration') || metricName.includes('delay')) {
    if (value >= 1) return 'watch'
    return 'good'
  }

  return 'neutral'
}

function buildPlatformSummaryCards(series: MetricSeries[]): MetricStatCardProps[] {
  const httpServer = findSeries(series, 'http.server.duration')
  const dbDuration = findSeries(series, 'db.client.operation.duration')
  const eventLoopDelay =
    findSeries(series, 'nodejs.eventloop.delay.p99') ??
    findSeries(series, 'nodejs.eventloop.delay.p90') ??
    findSeries(series, 'nodejs.eventloop.delay.mean')
  const heapUsed = findSeries(series, 'v8js.memory.heap.used')
  const heapLimit = findSeries(series, 'v8js.memory.heap.limit')
  const heapUsedValue = getLatestValue(heapUsed)
  const heapLimitValue = getLatestValue(heapLimit)
  const heapPercent =
    heapUsedValue != null && heapLimitValue != null && heapLimitValue > 0
      ? (heapUsedValue / heapLimitValue) * 100
      : null

  return [
    {
      label: 'Request path',
      value: formatMetricValue(httpServer?.metricName ?? 'http.server.duration', getLatestValue(httpServer)),
      detail: 'HTTP server duration, closest to user-visible API latency.',
      tone: getMetricTone(httpServer?.metricName ?? 'http.server.duration', getLatestValue(httpServer)),
    },
    {
      label: 'Dependency pressure',
      value: formatMetricValue(dbDuration?.metricName ?? 'db.client.operation.duration', getLatestValue(dbDuration)),
      detail: 'DB operation duration; pair it with pending requests below.',
      tone: getMetricTone(dbDuration?.metricName ?? 'db.client.operation.duration', getLatestValue(dbDuration)),
    },
    {
      label: 'Runtime responsiveness',
      value: formatMetricValue(
        eventLoopDelay?.metricName ?? 'nodejs.eventloop.delay.p99',
        getLatestValue(eventLoopDelay),
      ),
      detail: 'Event loop delay shows whether Node.js can schedule work promptly.',
      tone: getMetricTone(eventLoopDelay?.metricName ?? 'nodejs.eventloop.delay.p99', getLatestValue(eventLoopDelay)),
    },
    {
      label: 'Memory pressure',
      value:
        heapPercent == null
          ? formatMetricValue(heapUsed?.metricName ?? 'v8js.memory.heap.used', heapUsedValue)
          : `${heapPercent.toFixed(0)}%`,
      detail:
        heapUsedValue != null && heapLimitValue != null
          ? `${formatMetricValue('v8js.memory.heap.used', heapUsedValue)} of ${formatMetricValue(
              'v8js.memory.heap.limit',
              heapLimitValue,
            )}`
          : 'Heap used and limit from V8 runtime metrics.',
      tone: heapPercent == null ? 'neutral' : heapPercent >= 85 ? 'critical' : heapPercent >= 70 ? 'watch' : 'good',
    },
  ]
}

interface MetricSnapshotPanelProps {
  title: string
  description: string
  series: MetricSeries[]
}

const MetricSnapshotPanel: React.FC<MetricSnapshotPanelProps> = ({ title, description, series }) => {
  if (!series.length) return null

  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <div className="mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {series.map((item) => {
          const latest = getLatestValue(item)
          return (
            <div key={item.metricName} className="rounded-md border border-border bg-card/70 p-3">
              <p className="truncate text-xs text-muted-foreground">{getMetricDisplayName(item.metricName)}</p>
              <p className="mt-2 text-lg font-semibold tabular-nums">{formatMetricValue(item.metricName, latest)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                avg {formatMetricValue(item.metricName, getAverageValue(item))} · max{' '}
                {formatMetricValue(item.metricName, getMaxValue(item))}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const BackgroundJobsTable: React.FC<{ series: MetricSeries[] }> = ({ series }) => {
  if (!series.length) return null

  const rows = series
    .map((item) => ({
      metricName: item.metricName,
      latest: getLatestValue(item),
      avg: getAverageValue(item),
      max: getMaxValue(item),
    }))
    .sort((a, b) => (b.max ?? 0) - (a.max ?? 0))
    .slice(0, 10)

  const largestMax = Math.max(...rows.map((row) => row.max ?? 0), 0)

  return (
    <div className="rounded-md border border-border bg-background/50 p-3 xl:col-span-2">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Background work</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Scheduled job durations are ranked, because many duration series in one chart hide the slow job.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] font-normal">
          top {rows.length} of {series.length}
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead className="text-right">Latest</TableHead>
              <TableHead className="text-right">Avg</TableHead>
              <TableHead className="text-right">Max</TableHead>
              <TableHead className="min-w-[8rem]">Relative max</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const width = largestMax > 0 && row.max != null ? Math.max(4, (row.max / largestMax) * 100) : 0
              return (
                <TableRow key={row.metricName}>
                  <TableCell className="max-w-[18rem] truncate text-xs">
                    {getMetricDisplayName(row.metricName)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatMetricValue(row.metricName, row.latest)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatMetricValue(row.metricName, row.avg)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatMetricValue(row.metricName, row.max)}
                  </TableCell>
                  <TableCell>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

const PlatformMetricsDashboard: React.FC<{ groups: PlatformMetricGroup[]; allSeries: MetricSeries[] }> = ({
  groups,
  allSeries,
}) => {
  const groupMap = React.useMemo(() => new Map(groups.map((group) => [group.key, group])), [groups])
  const requestSeries = groupMap.get('request')?.series ?? []
  const dependencySeries = groupMap.get('dependencies')?.series ?? []
  const runtimeSeries = groupMap.get('runtime')?.series ?? []
  const memorySeries = groupMap.get('memory')?.series ?? []
  const backgroundSeries = groupMap.get('background')?.series ?? []
  const unclassifiedSeries = groupMap.get('unclassified')?.series ?? []

  const dbLatencySeries = dependencySeries.filter((item) => item.metricName === 'db.client.operation.duration')
  const dbPoolSeries = dependencySeries.filter((item) => item.metricName !== 'db.client.operation.duration')
  const eventLoopDelaySeries = IMPORTANT_EVENT_LOOP_DELAY_METRICS.flatMap((metricName) => {
    const metric = findSeries(runtimeSeries, metricName)
    return metric ? [metric] : []
  })
  const runtimeSnapshotSeries = runtimeSeries.filter((item) => !eventLoopDelaySeries.includes(item))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {buildPlatformSummaryCards(allSeries).map((card) => (
          <MetricStatCard key={card.label} {...card} />
        ))}
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
        <div className="font-medium">Triage order</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Request path tells whether users feel latency; dependency pressure explains downstream waiting; runtime and
          memory show whether the Node.js control plane is saturated; background work highlights lifecycle jobs.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {requestSeries.length > 0 && (
          <MetricGroupChart
            title="Request path"
            description="HTTP server/client duration. This is the closest platform metric to user-visible slowness."
            watchFirst
            series={requestSeries}
            convertToGiB={false}
          />
        )}

        {dbLatencySeries.length > 0 && (
          <MetricGroupChart
            title="Dependency latency"
            description="DB operation duration. If this rises before request latency, the bottleneck is below the API."
            watchFirst
            series={dbLatencySeries}
            convertToGiB={false}
          />
        )}

        <MetricSnapshotPanel
          title="Dependency queue and pool"
          description="Pending requests and connection count are capacity signals, so they stay out of the duration chart."
          series={dbPoolSeries}
        />

        {eventLoopDelaySeries.length > 0 && (
          <MetricGroupChart
            title="Runtime responsiveness"
            description="Event loop delay percentiles. This answers whether Node.js can schedule work promptly."
            watchFirst
            series={eventLoopDelaySeries}
            convertToGiB={false}
          />
        )}

        <MetricSnapshotPanel
          title="Runtime saturation"
          description="Utilization, event-loop time, and GC duration are related signals, but not the same y-axis."
          series={runtimeSnapshotSeries}
        />

        {memorySeries.length > 0 && (
          <MetricGroupChart
            title="Memory pressure"
            description="V8 heap usage and limits. Values are shown in GiB to keep the chart readable."
            watchFirst
            series={memorySeries}
            convertToGiB
          />
        )}

        <BackgroundJobsTable series={backgroundSeries} />

        {unclassifiedSeries.length > 0 && (
          <MetricSnapshotPanel
            title="Unclassified signals"
            description="Visible raw metrics that need a product meaning before they deserve a primary chart."
            series={unclassifiedSeries}
          />
        )}
      </div>
    </div>
  )
}

export const MetricsTab: React.FC<MetricsTabProps> = ({ sandboxId, scope = 'sandbox' }) => {
  const [timeRange, setTimeRange] = useState(() => {
    const now = new Date()
    return { from: subHours(now, 1), to: now }
  })

  const queryParams: MetricsQueryParams = {
    from: timeRange.from,
    to: timeRange.to,
  }

  const { data, isLoading, isError, refetch } = useSandboxMetrics(sandboxId, queryParams, { scope })
  const targetLabel = scope === 'admin-platform' ? 'platform' : 'this box'

  const [viewModes, setViewModes] = useState<Record<string, ViewMode>>({
    memory: '%',
    filesystem: '%',
  })

  const handleTimeRangeChange = useCallback((from: Date, to: Date) => {
    setTimeRange({ from, to })
  }, [])

  const handleViewModeChange = useCallback((groupKey: string, mode: ViewMode) => {
    setViewModes((prev) => ({ ...prev, [groupKey]: mode }))
  }, [])

  const groupedSeries = React.useMemo(() => {
    if (!data?.series?.length) return []

    return METRIC_GROUPS.map((group) => {
      const allSeries = data.series.filter((s) => s.metricName.includes(group.prefix))
      const mode = group.hasToggle ? viewModes[group.key] : undefined

      let filteredSeries = allSeries.filter((s) => s.metricName !== 'system.memory.utilization')
      if (mode === '%') {
        filteredSeries = filteredSeries.filter((s) => s.metricName.endsWith('.utilization'))
      } else if (mode === 'GiB') {
        filteredSeries = filteredSeries.filter((s) => !s.metricName.endsWith('.utilization'))
      }

      return {
        key: group.key,
        title: group.title,
        series: filteredSeries,
        convertToGiB: mode === 'GiB',
        hasToggle: group.hasToggle,
        viewMode: mode,
      }
    }).filter((group) => group.series.length > 0)
  }, [data, viewModes])

  // Platform telemetry needs operational groups; sandbox telemetry keeps the
  // original CPU/memory/filesystem grouping.
  const platformMetricGroups = React.useMemo(() => {
    if (scope !== 'admin-platform' || !data?.series?.length) return []
    return groupPlatformMetricSeries(data.series)
  }, [data, scope])

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <TimeRangeSelector onChange={handleTimeRangeChange} className="w-auto" />

        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea fade="mask" className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <Spinner className="w-6 h-6" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground gap-2">
            <AlertCircle className="w-8 h-8" />
            <span className="text-sm">Unable to load metrics for {targetLabel}.</span>
          </div>
        ) : !data?.series?.length ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground gap-2">
            <BarChart3 className="w-8 h-8" />
            <span className="text-sm">No metrics found</span>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {scope === 'admin-platform' ? (
              <PlatformMetricsDashboard groups={platformMetricGroups} allSeries={data.series} />
            ) : (
              groupedSeries.map((group) => (
                <MetricGroupChart
                  key={group.key}
                  title={group.title}
                  series={group.series}
                  convertToGiB={group.convertToGiB}
                  viewMode={group.hasToggle ? group.viewMode : undefined}
                  onViewModeChange={group.hasToggle ? (mode) => handleViewModeChange(group.key, mode) : undefined}
                />
              ))
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
