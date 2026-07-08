/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import { ArrowUpRight } from '@/components/ui/icon'
import { BILLING_BRAND, CardBrand, MatrixAmount } from './ascii'

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2)
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[210px] flex-col gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
        <span style={{ color: BILLING_BRAND }}>▸</span> {label}
      </span>
      <MatrixAmount prefix="$" value={value} size="lg" />
    </div>
  )
}

export function BalanceOverviewCard({
  currentBalanceCents,
  spentThisMonthCents,
  creditCardConnected,
  cardLast4 = '4242',
}: {
  currentBalanceCents: number
  spentThisMonthCents: number
  creditCardConnected: boolean
  cardLast4?: string
}) {
  return (
    <div className="flex flex-col border border-border bg-card">
      <div className="grid gap-8 px-[22px] py-5 sm:grid-cols-[minmax(210px,240px)_minmax(210px,240px)]">
        <Metric label="Current balance" value={centsToDisplay(currentBalanceCents)} />
        <Metric label="Spent this month" value={centsToDisplay(spentThisMonthCents)} />
      </div>

      <div className="grid gap-3 border-t border-border px-[22px] py-[14px] md:grid-cols-[160px_1fr_auto] md:items-center">
        <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
          <span style={{ color: BILLING_BRAND }}>▸</span> Payment method
        </span>
        {creditCardConnected ? (
          <>
            <span className="flex items-center gap-4 font-mono text-[16px] tracking-[1.5px] text-foreground">
              <CardBrand brand="visa" size="lg" />
              ···· {cardLast4}
            </span>
            <Button size="sm" variant="secondary">
              Add funds
              <ArrowUpRight className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
              <span className="inline-block size-[9px] border border-muted-foreground/50" />
              no card connected
            </span>
            <Button size="sm" className="w-fit justify-self-start md:justify-self-end">
              Connect card
              <ArrowUpRight className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
