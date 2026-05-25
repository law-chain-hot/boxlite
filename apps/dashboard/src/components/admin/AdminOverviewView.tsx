/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight } from 'lucide-react'
import React, { useMemo } from 'react'
import {
  getBoxBreakdown,
  groupBoxesByOwner,
  isOnlineRunner,
  runnerCpuPercent,
  selectErroringOwners,
} from './adminHelpers'
import { BreakdownBar, BreakdownLegend } from './AdminPrimitives'
import { useAdminBoxes, useAdminOverview, useAdminRunners } from './useAdminData'

interface AdminOverviewViewProps {
  onJumpToOwner: (ownerName: string) => void
  onJumpToRunner: (runnerId: string) => void
}

function KpiCard({ children }: { children: React.ReactNode }) {
  return <Card className="p-0">{children}</Card>
}

function AttentionRow({
  color,
  title,
  subtitle,
  action,
  onClick,
}: {
  color: string
  title: React.ReactNode
  subtitle: string
  action: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-left transition-colors first:border-t-0 hover:bg-muted/40"
    >
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-primary">
        {action}
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({ onJumpToOwner, onJumpToRunner }) => {
  const overviewQuery = useAdminOverview()
  const boxesQuery = useAdminBoxes()
  const runnersQuery = useAdminRunners()

  const boxes = boxesQuery.data ?? []
  const breakdown = useMemo(() => getBoxBreakdown(boxes), [boxes])
  const erroringOwners = useMemo(() => selectErroringOwners(groupBoxesByOwner(boxes)), [boxes])

  const runners = runnersQuery.data ?? []
  const staleRunners = useMemo(() => runners.filter((r) => !isOnlineRunner(r)), [runners])
  const hotRunners = useMemo(() => runners.filter((r) => isOnlineRunner(r) && runnerCpuPercent(r) >= 0.8), [runners])

  const overview = overviewQuery.data

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {overviewQuery.isPending || !overview ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          <>
            <KpiCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Users</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-medium tabular-nums">{overview.users}</p>
                <p className="mt-1 text-xs text-muted-foreground">across all orgs</p>
              </CardContent>
            </KpiCard>

            <KpiCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Boxes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-3xl font-medium tabular-nums">
                  {overview.activeBoxes}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    active · {overview.boxes.total} total
                  </span>
                </p>
                {boxes.length > 0 && (
                  <>
                    <BreakdownBar segments={breakdown} total={boxes.length} className="h-2" />
                    <BreakdownLegend segments={breakdown} />
                  </>
                )}
              </CardContent>
            </KpiCard>

            <KpiCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Runners</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-medium tabular-nums">
                  {overview.runners.online}{' '}
                  <span className="text-sm font-normal text-muted-foreground">/ {overview.runners.total} online</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overview.runners.draining > 0 ? `${overview.runners.draining} draining` : 'none draining'}
                </p>
              </CardContent>
            </KpiCard>

            <KpiCard>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Cluster CPU</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-medium tabular-nums">{(overview.cluster.cpuUtil * 100).toFixed(1)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overview.cluster.oversell.toFixed(1)}x oversell · online runners
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(overview.cluster.cpuUtil * 100, 100)}%` }}
                  />
                </div>
              </CardContent>
            </KpiCard>
          </>
        )}
      </div>

      {/* Needs attention */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">Needs attention</h2>
          <span className="text-xs text-muted-foreground">problems surfaced first — click to jump</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
              Erroring boxes by owner
            </div>
            {boxesQuery.isPending ? (
              <Skeleton className="m-4 h-16" />
            ) : erroringOwners.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No boxes in error. </p>
            ) : (
              erroringOwners.map(({ group, errorBoxes }) => (
                <AttentionRow
                  key={group.organizationId}
                  color="#dd7d70"
                  title={group.owner.name}
                  subtitle={`${errorBoxes.length} box(es) need recovery · ${errorBoxes.map((b) => b.id).join(', ')}`}
                  action="view"
                  onClick={() => onJumpToOwner(group.owner.name)}
                />
              ))
            )}
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
              Fleet alerts
            </div>
            {runnersQuery.isPending ? (
              <Skeleton className="m-4 h-16" />
            ) : staleRunners.length === 0 && hotRunners.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Fleet healthy.</p>
            ) : (
              <>
                {staleRunners.map((r) => (
                  <AttentionRow
                    key={r.id}
                    color="#838b97"
                    title={<span className="font-mono">{r.id}</span>}
                    subtitle={`${r.state} · outside READY state`}
                    action="drain"
                    onClick={() => onJumpToRunner(r.id)}
                  />
                ))}
                {hotRunners.map((r) => (
                  <AttentionRow
                    key={r.id}
                    color="#d6a84f"
                    title={<span className="font-mono">{r.id}</span>}
                    subtitle={`${Math.round(runnerCpuPercent(r) * 100)}% CPU · nearly full`}
                    action="view"
                    onClick={() => onJumpToRunner(r.id)}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default AdminOverviewView
