/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ChevronRight, Users, X } from 'lucide-react'
import React, { useMemo } from 'react'
import { type AdminBox, filterOwnerGroups, getBoxRollupText, groupBoxesByOwner, isErrorState } from './adminHelpers'
import { AdminStateBadge, BreakdownBar } from './AdminPrimitives'
import { useAdminBoxes } from './useAdminData'

interface AdminPeopleBoxesViewProps {
  query: string
  runnerFilter: string | null
  onClearRunnerFilter: () => void
  onOpenBox: (box: AdminBox) => void
}

const AdminPeopleBoxesView: React.FC<AdminPeopleBoxesViewProps> = ({
  query,
  runnerFilter,
  onClearRunnerFilter,
  onOpenBox,
}) => {
  const boxesQuery = useAdminBoxes()

  const groups = useMemo(() => {
    const boxes = boxesQuery.data ?? []
    const scoped = runnerFilter ? boxes.filter((b) => b.runnerId === runnerFilter) : boxes
    return filterOwnerGroups(groupBoxesByOwner(scoped), query)
  }, [boxesQuery.data, runnerFilter, query])

  const openIds = useMemo(() => groups.map((g) => g.organizationId), [groups])

  if (boxesQuery.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {runnerFilter && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            Boxes on runner <span className="font-mono text-foreground">{runnerFilter}</span>
          </span>
          <Button variant="ghost" size="sm" className="h-7" onClick={onClearRunnerFilter}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-border text-muted-foreground">
          <Users className="h-5 w-5" />
          <span className="text-sm">
            {query || runnerFilter ? 'No user or box matches the current filter.' : 'No boxes found.'}
          </span>
        </div>
      ) : (
        <Accordion key={`${query}|${runnerFilter ?? ''}`} type="multiple" defaultValue={openIds} className="space-y-3">
          {groups.map((group) => (
            <AccordionItem
              key={group.organizationId}
              value={group.organizationId}
              className="overflow-hidden rounded-md border border-border bg-card px-4"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex w-full flex-col gap-3 pr-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{group.owner.name}</span>
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {group.owner.personal ? 'personal' : 'team'}
                      </Badge>
                    </div>
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {group.owner.email || group.owner.orgName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 text-left sm:items-end sm:text-right">
                    <p className="text-xs font-normal text-muted-foreground">
                      {getBoxRollupText(group.boxes)} · {group.boxes.length} total
                    </p>
                    <BreakdownBar segments={group.breakdown} total={group.boxes.length} className="w-36" />
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="overflow-hidden rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Box</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>Mem</TableHead>
                        <TableHead>Runner</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Telemetry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.boxes.map((box) => (
                        <TableRow
                          key={box.id}
                          className={cn('cursor-pointer', isErrorState(box.state) && 'bg-destructive/5')}
                          onClick={() => onOpenBox(box)}
                        >
                          <TableCell className="font-mono text-xs">{box.id}</TableCell>
                          <TableCell>
                            <AdminStateBadge state={box.state} />
                          </TableCell>
                          <TableCell className="font-mono">{box.cpu}</TableCell>
                          <TableCell className="font-mono">{box.memoryGiB} GiB</TableCell>
                          <TableCell className="truncate font-mono text-xs text-muted-foreground">
                            {box.runnerId ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(box.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center gap-1 text-xs text-primary">
                              open
                              <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  )
}

export default AdminPeopleBoxesView
