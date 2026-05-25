/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import React, { useMemo } from 'react'
import { getBoxBreakdown } from './adminHelpers'
import { BreakdownBar, BreakdownLegend } from './AdminPrimitives'
import { useAdminBoxes, useAdminOverview } from './useAdminData'

function KpiCard({ children }: { children: React.ReactNode }) {
  return <Card className="p-0">{children}</Card>
}

const AdminStatusStrip: React.FC = () => {
  const overviewQuery = useAdminOverview()
  const boxesQuery = useAdminBoxes()
  const boxes = boxesQuery.data ?? []
  const breakdown = useMemo(() => getBoxBreakdown(boxes), [boxes])
  const overview = overviewQuery.data

  if (overviewQuery.isPending || !overview) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
            <span className="text-sm font-normal text-muted-foreground">active · {overview.boxes.total} total</span>
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
    </div>
  )
}

export default AdminStatusStrip
