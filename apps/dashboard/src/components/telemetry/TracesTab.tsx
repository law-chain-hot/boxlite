/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSandboxTraces, TracesQueryParams } from '@/hooks/useSandboxTraces'
import { useSandboxTraceSpans } from '@/hooks/useSandboxTraceSpans'
import { TelemetryScope } from '@/hooks/telemetryScope'
import { TimeRangeSelector } from './TimeRangeSelector'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronLeft, ChevronRight, RefreshCw, Activity, ExternalLink, AlertCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CopyButton } from '@/components/CopyButton'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { subHours } from 'date-fns'
import { TraceSummary } from '@boxlite-ai/api-client'
import { buildTraceWaterfallRows, resolveSelectedTraceId, TraceWaterfallRow } from './traceWaterfall'

interface TracesTabProps {
  sandboxId?: string
  getTraceHref?: (traceId: string) => string
  scope?: TelemetryScope
}

function formatTimestamp(timestamp: string) {
  try {
    return format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss.SSS')
  } catch {
    return timestamp
  }
}

function formatDuration(durationMs: number) {
  if (durationMs < 1) {
    return `${(durationMs * 1000).toFixed(2)}us`
  }
  if (durationMs < 1000) {
    return `${durationMs.toFixed(2)}ms`
  }
  return `${(durationMs / 1000).toFixed(2)}s`
}

function truncateTraceId(traceId: string) {
  if (traceId.length > 16) {
    return `${traceId.slice(0, 8)}...${traceId.slice(-8)}`
  }
  return traceId
}

function TraceWaterfallPanel({
  trace,
  traceId,
  rows,
  isLoading,
}: {
  trace?: TraceSummary
  traceId: string | null
  rows: TraceWaterfallRow[]
  isLoading: boolean
}) {
  return (
    <section className="flex min-h-[24rem] min-w-0 flex-col rounded-md border border-border bg-background/60">
      <div className="border-b border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">Trace waterfall</h3>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {traceId ?? 'Select a trace to inspect spans'}
            </p>
          </div>
          {traceId && <CopyButton value={traceId} tooltipText="Copy Trace ID" size="icon-xs" />}
        </div>
        {trace && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">root</p>
              <p className="truncate">{trace.rootSpanName || '(unnamed root)'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">duration</p>
              <p className="font-mono">{formatDuration(trace.durationMs)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">spans</p>
              <p className="font-mono">{trace.spanCount}</p>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner className="h-6 w-6" />
          </div>
        ) : !traceId ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No trace selected</div>
        ) : !rows.length ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No spans found</div>
        ) : (
          <div className="space-y-2 p-3">
            {rows.map((span) => (
              <details key={span.spanId} className="group rounded-md border border-border bg-card/60 p-2">
                <summary className="cursor-pointer list-none">
                  <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${span.depth * 14}px` }}>
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

                <div className="mt-3 space-y-2 text-xs" style={{ marginLeft: `${span.depth * 14}px` }}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Span ID:</span>
                      <code className="ml-1 font-mono">{span.spanId}</code>
                    </div>
                    {span.parentSpanId && (
                      <div>
                        <span className="text-muted-foreground">Parent:</span>
                        <code className="ml-1 font-mono">{span.parentSpanId}</code>
                      </div>
                    )}
                    {span.statusCode && (
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <span className="ml-1">{span.statusCode}</span>
                      </div>
                    )}
                  </div>
                  {Object.keys(span.spanAttributes || {}).length > 0 && (
                    <pre className="overflow-x-auto rounded bg-muted/50 p-2">
                      {JSON.stringify(span.spanAttributes, null, 2)}
                    </pre>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

export const TracesTab: React.FC<TracesTabProps> = ({ sandboxId, getTraceHref, scope = 'sandbox' }) => {
  const [timeRange, setTimeRange] = useState(() => {
    const now = new Date()
    return { from: subHours(now, 1), to: now }
  })
  const [page, setPage] = useState(1)
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const limit = 50

  const queryParams: TracesQueryParams = {
    from: timeRange.from,
    to: timeRange.to,
    page,
    limit,
  }

  const { data, isLoading, isError, refetch } = useSandboxTraces(sandboxId, queryParams, { scope })
  const { data: spans, isLoading: isSpansLoading } = useSandboxTraceSpans(sandboxId, selectedTraceId ?? undefined, {
    scope,
    enabled: !!selectedTraceId,
  })
  const targetLabel = scope === 'admin-platform' ? 'platform' : 'this box'

  useEffect(() => {
    const nextTraceId = resolveSelectedTraceId(data?.items ?? [], selectedTraceId)
    if (nextTraceId !== selectedTraceId) {
      setSelectedTraceId(nextTraceId)
    }
  }, [data?.items, selectedTraceId])

  const selectedTrace = data?.items?.find((trace) => trace.traceId === selectedTraceId)
  const spanRows = useMemo(() => buildTraceWaterfallRows(spans), [spans])

  const handleTimeRangeChange = useCallback((from: Date, to: Date) => {
    setTimeRange({ from, to })
    setPage(1)
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <TimeRangeSelector onChange={handleTimeRangeChange} className="w-auto" />

        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-border">
          <Spinner className="h-6 w-6" />
        </div>
      ) : isError ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-border text-muted-foreground">
          <AlertCircle className="h-8 w-8" />
          <span className="text-sm">Unable to load traces for {targetLabel}.</span>
        </div>
      ) : !data?.items?.length ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-border text-muted-foreground">
          <Activity className="h-8 w-8" />
          <span className="text-sm">No traces found</span>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(26rem,0.95fr)]">
          <ScrollArea fade="mask" className="min-h-[24rem] min-w-0 rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trace ID</TableHead>
                  <TableHead>Root Span</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-center">Spans</TableHead>
                  {getTraceHref && <TableHead className="text-right">Jaeger</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((trace: TraceSummary) => (
                  <TableRow
                    key={trace.traceId}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50',
                      trace.traceId === selectedTraceId && 'bg-muted/70',
                    )}
                    onClick={() => setSelectedTraceId(trace.traceId)}
                  >
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{truncateTraceId(trace.traceId)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <code className="font-mono text-xs">{trace.traceId}</code>
                          </TooltipContent>
                        </Tooltip>
                        <CopyButton
                          value={trace.traceId}
                          tooltipText="Copy Trace ID"
                          size="icon-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {trace.rootSpanName || <span className="text-muted-foreground">(unnamed root)</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{formatTimestamp(trace.startTime)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatDuration(trace.durationMs)}</TableCell>
                    <TableCell className="text-center">{trace.spanCount}</TableCell>
                    {getTraceHref && (
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="icon-xs">
                          <a
                            href={getTraceHref(trace.traceId)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <TraceWaterfallPanel
            trace={selectedTrace}
            traceId={selectedTraceId}
            rows={spanRows}
            isLoading={isSpansLoading}
          />
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {data.totalPages} ({data.total} total traces)
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
