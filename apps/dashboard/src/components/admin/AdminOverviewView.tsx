/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight } from 'lucide-react'
import React, { useMemo } from 'react'
import { groupBoxesByOwner, isOnlineRunner, runnerCpuPercent, selectErroringOwners } from './adminHelpers'
import { AdminSectionFrame } from './AdminPrimitives'
import { useAdminBoxes, useAdminRunners } from './useAdminData'

interface AdminOverviewViewProps {
  onJumpToOwner: (ownerName: string) => void
  onJumpToRunner: (runnerId: string) => void
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
  const boxesQuery = useAdminBoxes()
  const runnersQuery = useAdminRunners()

  const boxes = boxesQuery.data ?? []
  const erroringOwners = useMemo(() => selectErroringOwners(groupBoxesByOwner(boxes)), [boxes])

  const runners = runnersQuery.data ?? []
  const staleRunners = useMemo(() => runners.filter((r) => !isOnlineRunner(r)), [runners])
  const hotRunners = useMemo(() => runners.filter((r) => isOnlineRunner(r) && runnerCpuPercent(r) >= 0.8), [runners])

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSectionFrame
          title="Box recovery queue"
          description="Owners with boxes in error or build failed states."
          contentClassName="p-0"
        >
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
        </AdminSectionFrame>

        <AdminSectionFrame
          title="Fleet alerts"
          description="Runners outside READY or close to allocated capacity."
          contentClassName="p-0"
        >
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
        </AdminSectionFrame>
      </div>
    </div>
  )
}

export default AdminOverviewView
