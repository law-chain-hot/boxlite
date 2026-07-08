/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'

export function SuspendedBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border border-destructive/60 bg-destructive/10 px-[22px] py-4">
      <div className="flex items-start gap-3">
        <span className="mt-[3px] inline-block size-[9px] shrink-0 bg-destructive" />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[13px] font-semibold text-destructive">Balance depleted - all boxes paused</span>
          <span className="font-mono text-[12px] text-muted-foreground">
            Top up to resume. Paused boxes keep their data for 14 days, then are deleted.
          </span>
        </div>
      </div>
      <Button size="sm">
        Top up to resume
        <span className="ml-1">→</span>
      </Button>
    </div>
  )
}
