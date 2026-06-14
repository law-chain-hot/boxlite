/*
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Wrench, X } from 'lucide-react'
import React from 'react'
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
  if (!box) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-dvw flex-col gap-0 p-0 sm:w-[520px] [&>button]:hidden">
        <SheetHeader className="space-y-0 border-b border-border p-4 px-5">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="flex min-w-0 items-center gap-2.5 text-lg font-medium">
              <span>Box details</span>
              <AdminStateBadge state={box.state} />
            </SheetTitle>
            <Button variant="outline" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <SheetDescription className="mt-2 text-xs text-muted-foreground">
            <span className="font-mono">{box.id}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="m-0 flex-1 space-y-4 overflow-y-auto p-5">
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
          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Platform telemetry is global boxlite-api evidence. It is useful for control-plane debugging, but it is not
            this box's runtime telemetry.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {isErrorState(box.state) && (
              <Button size="sm" onClick={() => onRecover(box.id)}>
                <Wrench className="h-4 w-4" />
                Recover
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default AdminTelemetryDrawer
