/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { LogsTab, MetricsTab, TracesTab } from '@/components/telemetry'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RoutePath } from '@/enums/RoutePath'
import { ExternalLink, Wrench, X } from 'lucide-react'
import React from 'react'
import { generatePath, useNavigate } from 'react-router-dom'
import { type AdminBox, isErrorState } from './adminHelpers'
import { AdminStateBadge } from './AdminPrimitives'

interface AdminTelemetryDrawerProps {
  box: AdminBox | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecover: (boxId: string) => void
  onJumpToRunner?: (runnerId: string) => void
}

function MetaRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border pt-2 first:border-t-0 first:pt-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 max-w-[70%] truncate text-right font-medium">{children}</dd>
    </div>
  )
}

const AdminTelemetryDrawer: React.FC<AdminTelemetryDrawerProps> = ({
  box,
  open,
  onOpenChange,
  onRecover,
  onJumpToRunner,
}) => {
  const navigate = useNavigate()

  if (!box) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-dvw flex-col gap-0 p-0 sm:w-[760px] [&>button]:hidden">
        <SheetHeader className="space-y-0 border-b border-border p-4 px-5">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="flex min-w-0 items-center gap-2.5 text-lg font-medium">
              <span className="truncate font-mono">{box.id}</span>
              <AdminStateBadge state={box.state} />
            </SheetTitle>
            <Button variant="outline" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {box.owner.name} · {box.owner.personal ? 'personal' : box.owner.orgName}
          </p>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          <TabsList variant="underline" className="justify-start rounded-none border-b px-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="traces">Traces</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="m-0 flex-1 space-y-4 overflow-y-auto p-5">
            <dl className="space-y-2 text-sm">
              <MetaRow k="owner">{box.owner.name}</MetaRow>
              <MetaRow k="org">{box.owner.personal ? 'personal' : box.owner.orgName}</MetaRow>
              <MetaRow k="runner">
                {box.runnerId ? (
                  <button
                    type="button"
                    className="block max-w-full truncate font-mono text-xs text-primary hover:underline"
                    onClick={() => onJumpToRunner?.(box.runnerId as string)}
                  >
                    {box.runnerId}
                  </button>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </MetaRow>
              <MetaRow k="specs">
                <span className="font-mono text-xs">
                  {box.cpu}c / {box.memoryGiB}G
                </span>
              </MetaRow>
              <MetaRow k="created">
                <span className="text-xs">{new Date(box.createdAt).toLocaleString()}</span>
              </MetaRow>
            </dl>
            <p className="text-xs italic text-muted-foreground">
              One click from any box. This panel shows platform telemetry from ClickHouse; trace waterfalls open
              in-panel while external trace links remain a Phase 3.1 follow-up.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {isErrorState(box.state) && (
                <Button size="sm" onClick={() => onRecover(box.id)}>
                  <Wrench className="h-4 w-4" />
                  Recover
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(generatePath(RoutePath.ADMIN_BOX_TELEMETRY, { boxId: box.id }))}
              >
                <ExternalLink className="h-4 w-4" />
                Open full page
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="logs" className="m-0 min-h-0 flex-1 overflow-hidden">
            <LogsTab sandboxId={box.id} scope="admin-platform" />
          </TabsContent>
          <TabsContent value="traces" className="m-0 min-h-0 flex-1 overflow-hidden">
            <TracesTab sandboxId={box.id} scope="admin-platform" />
          </TabsContent>
          <TabsContent value="metrics" className="m-0 min-h-0 flex-1 overflow-hidden">
            <MetricsTab sandboxId={box.id} scope="admin-platform" />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

export default AdminTelemetryDrawer
