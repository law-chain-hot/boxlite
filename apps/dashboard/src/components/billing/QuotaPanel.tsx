/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { BILLING_BRAND, SectionTitle } from './ascii'

type Quota = { label: string; used: number; limit: number; unit?: string }

function QuotaBar({ used, limit, segments = 32 }: { used: number; limit: number; segments?: number }) {
  const ratio = limit > 0 ? used / limit : 0
  const filled = Math.max(0, Math.min(segments, Math.round(ratio * segments)))
  const color = ratio >= 0.9 ? 'hsl(var(--destructive))' : ratio >= 0.7 ? 'hsl(var(--warning))' : BILLING_BRAND
  return (
    <div className="flex min-w-[180px] max-w-[760px] flex-1 gap-[3px]">
      {Array.from({ length: segments }).map((_, index) => (
        <span
          key={index}
          className="h-1.5 flex-1"
          style={{ background: index < filled ? color : 'hsl(var(--brand) / 0.11)' }}
        />
      ))}
    </div>
  )
}

function CapacityRow({ label, used, limit, unit }: Quota) {
  const atLimit = limit > 0 && used >= limit
  return (
    <div className="grid grid-cols-[58px_86px_minmax(120px,1fr)] items-center gap-3 py-[7px] font-mono text-[13px] sm:grid-cols-[70px_110px_minmax(180px,1fr)] sm:gap-4">
      <span className="uppercase tracking-[0.5px] text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        <span className={cn('text-foreground', atLimit && 'text-destructive')}>{used}</span>
        <span className="text-muted-foreground">
          {' '}
          / {limit}
          {unit ? ` ${unit}` : ''}
        </span>
      </span>
      <QuotaBar used={used} limit={limit} />
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5">
      <span className="uppercase tracking-[0.5px] text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}

export function QuotaPanel({
  tier = 1,
  limits,
}: {
  tier?: number
  limits: {
    boxes: number
    cpu: number
    ramGiB: number
    diskGiB: number
  }
}) {
  const [open, setOpen] = useState(false)
  const capacity: Quota[] = [
    { label: 'Boxes', used: 0, limit: limits.boxes },
    { label: 'vCPU', used: 0, limit: limits.cpu },
    { label: 'RAM', used: 0, limit: limits.ramGiB, unit: 'GiB' },
    { label: 'Disk', used: 0, limit: limits.diskGiB, unit: 'GiB' },
  ]

  return (
    <div>
      <SectionTitle
        title="Limits"
        right={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground transition-colors hover:text-foreground">
                tier {tier} · raise limits
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Raise your limits</AlertDialogTitle>
                <AlertDialogDescription>
                  These limits are set by your plan tier. Contact support to raise concurrent boxes, resource caps,
                  per-box size, or rate limits.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction asChild>
                  <a href="mailto:support@boxlite.ai?subject=Raise%20organization%20limits">Contact support</a>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />
      <p className="mb-3 px-[2px] font-mono text-[12px] leading-relaxed text-muted-foreground">
        Hard caps on what your org can run at once - independent of balance. Creating a box that would exceed any cap is
        rejected even if your balance is sufficient.
      </p>

      <div className="border border-border bg-card px-[22px] py-4">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
          <span style={{ color: BILLING_BRAND }}>▸</span> Concurrent capacity · in use now
        </div>
        <div className="divide-y divide-border/40">
          {capacity.map((quota) => (
            <CapacityRow key={quota.label} {...quota} />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-3 flex items-center gap-2 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="text-[11px]">{open ? '▾' : '▸'}</span>
          Per-box max &amp; rate limits
        </button>
        {open ? (
          <div className="mt-3 grid grid-cols-1 gap-x-10 gap-y-2 font-mono text-[12px] sm:grid-cols-2">
            <Detail label="Max per box" value="4 vCPU · 8 GiB · 20 GiB" />
            <Detail label="Box create rate" value="300 / min" />
            <Detail label="API rate" value="20,000 / min" />
            <Detail label="Lifecycle rate" value="20,000 / min" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
