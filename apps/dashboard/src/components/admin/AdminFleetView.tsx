/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import React, { useEffect, useMemo, useState } from 'react'
import { type AdminRunner, isOnlineRunner, runnerCpuPercent } from './adminHelpers'
import { AdminStateBadge } from './AdminPrimitives'
import { useAdminMachines, useAdminRunners, useAdminActions } from './useAdminData'

interface AdminFleetViewProps {
  highlightRunnerId: string | null
  onShowRunnerBoxes: (runnerId: string) => void
}

interface ConfirmState {
  title: string
  description: string
  onConfirm: () => void
}

const AdminFleetView: React.FC<AdminFleetViewProps> = ({ highlightRunnerId, onShowRunnerBoxes }) => {
  const runnersQuery = useAdminRunners()
  const machinesQuery = useAdminMachines()
  const { cordon, drain } = useAdminActions()
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const runners = runnersQuery.data ?? []
  const online = useMemo(() => runners.filter(isOnlineRunner), [runners])
  const stale = useMemo(() => runners.filter((r) => !isOnlineRunner(r)), [runners])

  useEffect(() => {
    if (!highlightRunnerId) return
    const el = document.getElementById(`admin-runner-${highlightRunnerId}`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightRunnerId, runners])

  const renderRunnerRows = (rows: AdminRunner[], emptyText: string) =>
    rows.length > 0 ? (
      rows.map((r) => {
        const pct = Math.round(runnerCpuPercent(r) * 100)
        return (
          <TableRow
            key={r.id}
            id={`admin-runner-${r.id}`}
            className={cn(highlightRunnerId === r.id && 'bg-primary/10 transition-colors')}
          >
            <TableCell className="max-w-[8rem] truncate font-mono text-xs text-muted-foreground">{r.id}</TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <AdminStateBadge state={r.state} />
                {r.draining && (
                  <Badge variant="warning" className="w-fit">
                    draining
                  </Badge>
                )}
                {r.unschedulable && (
                  <Badge variant="secondary" className="w-fit">
                    cordoned
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="font-mono">
              {r.currentAllocatedCpu}/{r.cpu}
              <span className={cn('ml-1 text-xs', pct >= 80 ? 'text-destructive' : 'text-muted-foreground')}>
                {pct}%
              </span>
            </TableCell>
            <TableCell className="font-mono">
              {r.currentAllocatedMemoryGiB.toFixed(1)}/{r.memory.toFixed(1)} GiB
            </TableCell>
            <TableCell>
              {r.currentStartedSandboxes > 0 ? (
                <button
                  type="button"
                  className="font-mono text-primary hover:underline"
                  onClick={() => onShowRunnerBoxes(r.id)}
                >
                  {r.currentStartedSandboxes}
                </button>
              ) : (
                <span className="font-mono text-muted-foreground">0</span>
              )}
            </TableCell>
            <TableCell className="font-mono">{r.availabilityScore?.toFixed(2) ?? '—'}</TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setConfirm({
                      title: r.unschedulable ? 'Un-cordon runner' : 'Cordon runner',
                      description: r.unschedulable
                        ? `Allow runner ${r.id} to accept new sandboxes again?`
                        : `Prevent runner ${r.id} from accepting new sandboxes? Existing sandboxes keep running.`,
                      onConfirm: () => cordon.mutate(r),
                    })
                  }
                >
                  {r.unschedulable ? 'Un-cordon' : 'Cordon'}
                </Button>
                {!r.draining && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      setConfirm({
                        title: 'Drain runner',
                        description: `Drain runner ${r.id}? Scheduling stops immediately and existing sandboxes are migrated away.`,
                        onConfirm: () => drain.mutate(r.id),
                      })
                    }
                  >
                    Drain
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        )
      })
    ) : (
      <TableRow>
        <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
          {emptyText}
        </TableCell>
      </TableRow>
    )

  const runnerHeader = (
    <TableHeader>
      <TableRow>
        <TableHead>Runner</TableHead>
        <TableHead>State</TableHead>
        <TableHead>CPU alloc</TableHead>
        <TableHead>Mem alloc</TableHead>
        <TableHead>Boxes</TableHead>
        <TableHead>Score</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
  )

  return (
    <div className="space-y-6">
      {/* Runners */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Runners</h2>
            <p className="text-xs text-muted-foreground">A runner is one machine host in the MVP — online first.</p>
          </div>
          <Badge variant="success">{online.length} online</Badge>
        </div>

        {runnersQuery.isPending ? (
          <Skeleton className="h-40 rounded-md" />
        ) : (
          <>
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                {runnerHeader}
                <TableBody>{renderRunnerRows(online, 'No online runners.')}</TableBody>
              </Table>
            </div>

            {stale.length > 0 && (
              <Accordion type="single" collapsible className="rounded-md border border-border px-4">
                <AccordionItem value="stale" className="border-0">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-sm font-medium">Unresponsive &amp; stale</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {stale.length} runners outside READY state
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-hidden rounded-md border border-border">
                      <Table>
                        {runnerHeader}
                        <TableBody>{renderRunnerRows(stale, 'No stale runners.')}</TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </>
        )}
      </section>

      {/* Machines */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">Machines</h2>
          <p className="text-xs text-muted-foreground">
            Capacity &amp; oversell per host. Oversell &gt; 1.0× is flagged.
          </p>
        </div>
        {machinesQuery.isPending ? (
          <Skeleton className="h-32 rounded-md" />
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Host</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Oversell CPU</TableHead>
                  <TableHead>CPU waterline</TableHead>
                  <TableHead>Mem waterline</TableHead>
                  <TableHead>Boxes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {machinesQuery.data && machinesQuery.data.length > 0 ? (
                  machinesQuery.data.map((m) => (
                    <TableRow key={m.host}>
                      <TableCell className="font-mono text-xs">{m.host}</TableCell>
                      <TableCell>{m.region}</TableCell>
                      <TableCell className="font-mono">
                        {m.oversellCpu.toFixed(1)}×
                        {m.oversellCpu > 1 && (
                          <Badge variant="warning" className="ml-2">
                            over
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono">{m.cpuWaterline.toFixed(1)}%</TableCell>
                      <TableCell className="font-mono">{m.memWaterline.toFixed(1)}%</TableCell>
                      <TableCell className="font-mono">{m.sandboxes}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      No machines found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm()
                setConfirm(null)
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default AdminFleetView
