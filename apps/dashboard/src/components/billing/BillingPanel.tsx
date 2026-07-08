/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import type { AutomaticTopUp } from '@/billing-api/types/OrganizationWallet'
import type { Invoice } from '@/billing-api/types/Invoice'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BILLING_BRAND, SectionTitle } from './ascii'

const PRESETS = [25, 500, 1000, 2000]
const PAGE_SIZE = 8
const ROW = 'grid grid-cols-[150px_110px_120px_1fr_130px_28px] items-center gap-x-6'
const FIELD =
  'flex items-center border border-border px-3 py-2 font-mono text-[13px] transition-colors hover:border-brand focus-within:border-brand'
const MODAL = 'w-[calc(100%-2rem)] max-w-[540px] rounded-none border-border bg-card sm:max-w-[540px]'
const MODAL_TITLE = 'font-mono text-[15px] uppercase tracking-[1.4px]'
const MODAL_DESCRIPTION = 'font-mono text-[12px] leading-5'

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function statusTone(status: Invoice['paymentStatus']): 'ok' | 'bad' | 'pending' {
  if (status === 'succeeded') {
    return 'ok'
  }
  if (status === 'pending') {
    return 'pending'
  }
  return 'bad'
}

function statusLabel(status: Invoice['paymentStatus']): string {
  if (status === 'succeeded') {
    return 'paid'
  }
  return status
}

function StatusSquare({ tone }: { tone: 'ok' | 'bad' | 'pending' }) {
  const color = tone === 'ok' ? 'hsl(var(--success))' : tone === 'pending' ? BILLING_BRAND : 'hsl(var(--destructive))'
  return <span className="inline-block size-[9px] shrink-0" style={{ background: color }} />
}

export function BillingPanel({
  automaticTopUp,
  invoices,
  onSaveAutomaticTopUp,
  onTopUp,
  isSavingAutomaticTopUp,
  isCreatingTopUp,
}: {
  automaticTopUp?: AutomaticTopUp
  invoices: Invoice[]
  onSaveAutomaticTopUp: (automaticTopUp: AutomaticTopUp) => Promise<unknown>
  onTopUp: (amountCents: number) => Promise<unknown>
  isSavingAutomaticTopUp: boolean
  isCreatingTopUp: boolean
}) {
  const [autoOn, setAutoOn] = useState(Boolean(automaticTopUp))
  const [threshold, setThreshold] = useState(String(automaticTopUp?.thresholdAmount ?? 20))
  const [target, setTarget] = useState(String(automaticTopUp?.targetAmount ?? 100))
  const [preset, setPreset] = useState<number | null>(500)
  const [custom, setCustom] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const amount = preset ?? (Number.parseFloat(custom) || 0)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return invoices
    }
    return invoices.filter((invoice) =>
      [invoice.issuingDate, invoice.type, statusLabel(invoice.paymentStatus), usd(invoice.totalAmountCents)].some((field) =>
        field.toLowerCase().includes(normalized),
      ),
    )
  }, [invoices, query])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="flex flex-col gap-9">
      <div>
        <SectionTitle title="Top-up" />
        <div className="border border-border bg-card px-[22px] py-5 transition-transform hover:-translate-y-0.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
                Auto-reload
                <span
                  className="size-[6px] rounded-full"
                  style={{ background: autoOn ? BILLING_BRAND : 'hsl(var(--muted-foreground))' }}
                />
              </span>
              <span className="font-mono text-[13px] text-foreground">
                {autoOn ? `when balance < $${threshold}.00 → top up to $${target}.00` : 'disabled'}
              </span>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary">
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className={MODAL}>
                <DialogHeader>
                  <DialogTitle className={MODAL_TITLE}>Auto-reload</DialogTitle>
                  <DialogDescription className={MODAL_DESCRIPTION}>
                    Automatically top up when your balance runs low.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                  <button
                    type="button"
                    onClick={() => setAutoOn((value) => !value)}
                    className="flex items-center justify-between border border-border px-3 py-2.5 font-mono text-[13px] text-foreground transition-colors hover:border-brand"
                  >
                    <span>Enable auto-reload</span>
                    <span className="flex items-center gap-2 text-[11px] uppercase tracking-[1px] text-muted-foreground">
                      <span
                        className="size-[7px] rounded-full"
                        style={{ background: autoOn ? BILLING_BRAND : 'hsl(var(--muted-foreground))' }}
                      />
                      {autoOn ? 'on' : 'off'}
                    </span>
                  </button>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
                      When balance below
                    </span>
                    <div className={cn(FIELD, 'text-muted-foreground')}>
                      <span>$</span>
                      <input
                        value={threshold}
                        onChange={(event) => setThreshold(event.target.value)}
                        inputMode="decimal"
                        className="w-full bg-transparent pl-1 tabular-nums text-foreground outline-none"
                      />
                    </div>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">Top up to</span>
                    <div className={cn(FIELD, 'text-muted-foreground')}>
                      <span>$</span>
                      <input
                        value={target}
                        onChange={(event) => setTarget(event.target.value)}
                        inputMode="decimal"
                        className="w-full bg-transparent pl-1 tabular-nums text-foreground outline-none"
                      />
                    </div>
                  </label>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary" size="sm">
                      Cancel
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button
                      size="sm"
                      disabled={isSavingAutomaticTopUp}
                      onClick={() =>
                        onSaveAutomaticTopUp({
                          thresholdAmount: autoOn ? Number(threshold || 0) : 0,
                          targetAmount: autoOn ? Number(target || 0) : 0,
                        }).then(() => toast.success('Auto-reload saved'))
                      }
                    >
                      Save
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="my-5 h-px bg-border" />

          <div className="flex flex-col gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">One-time top-up</span>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((presetAmount) => (
                <button
                  key={presetAmount}
                  type="button"
                  onClick={() => {
                    setPreset(presetAmount)
                    setCustom('')
                  }}
                  className={cn(
                    'border px-4 py-2 font-mono text-[13px] tabular-nums transition-colors',
                    preset === presetAmount
                      ? 'bg-foreground text-background'
                      : 'border-border text-foreground hover:border-brand',
                  )}
                >
                  ${presetAmount.toLocaleString()}
                </button>
              ))}
              <div className={cn(FIELD, 'text-muted-foreground')}>
                <span>$</span>
                <input
                  value={custom}
                  onChange={(event) => {
                    setCustom(event.target.value)
                    setPreset(null)
                  }}
                  placeholder="custom"
                  className="w-20 bg-transparent pl-1 tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="ml-auto" disabled={!amount || isCreatingTopUp}>
                    Top up
                    <span className="ml-1">→</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className={MODAL}>
                  <AlertDialogHeader>
                    <AlertDialogTitle className={MODAL_TITLE}>Confirm top-up</AlertDialogTitle>
                    <AlertDialogDescription className={MODAL_DESCRIPTION}>
                      You will be charged <span className="font-mono text-foreground">${amount.toFixed(2)}</span> via
                      Stripe and redirected to complete the payment.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onTopUp(Math.round(amount * 100)).then(() => toast.success('Top-up initiated'))}
                    >
                      Confirm top-up
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              you will be redirected to Stripe to complete the payment.
            </span>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle
          title="Receipts"
          count={`${filtered.length} records`}
          right={
            <div className={cn(FIELD, 'py-1.5 text-[12px] text-muted-foreground')}>
              <span style={{ color: BILLING_BRAND }}>⌕</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(0)
                }}
                placeholder="search receipts..."
                className="ml-1.5 w-44 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          }
        />

        <div
          className={cn(
            ROW,
            'border-b border-border px-[2px] pb-2 font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground',
          )}
        >
          <span>Date</span>
          <span>Type</span>
          <span>Status</span>
          <span />
          <span className="text-right">Amount</span>
          <span />
        </div>

        {paged.length === 0 ? (
          <div className="px-[2px] py-10 text-center font-mono text-[12px] text-muted-foreground">no receipts found</div>
        ) : (
          paged.map((invoice) => {
            const tone = statusTone(invoice.paymentStatus)
            return (
              <div
                key={invoice.id}
                className={cn(
                  ROW,
                  'cursor-default px-[2px] py-[15px] font-mono text-[13px] transition-colors hover:bg-muted/30',
                )}
              >
                <span className="tabular-nums text-foreground">{invoice.issuingDate.slice(0, 10)}</span>
                <span className="uppercase tracking-[0.5px] text-muted-foreground">{invoice.type.replace('_', '-')}</span>
                <span className="flex items-center gap-2">
                  <StatusSquare tone={tone} />
                  <span className={tone === 'bad' ? 'text-destructive' : 'text-foreground'}>
                    {statusLabel(invoice.paymentStatus)}
                  </span>
                </span>
                <span />
                <span className="text-right tabular-nums text-foreground">{usd(invoice.totalAmountCents)}</span>
                <button
                  className="text-right text-muted-foreground transition-colors hover:text-foreground"
                  title={invoice.paymentStatus === 'succeeded' ? 'download' : 'retry'}
                >
                  {invoice.paymentStatus === 'succeeded' ? '↓' : '↻'}
                </button>
              </div>
            )
          })
        )}

        <div className="mt-4 flex items-center justify-between px-[2px] font-mono text-[11px] text-muted-foreground">
          <span>
            page {safePage + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              disabled={safePage === 0}
              className="border border-border px-2.5 py-1 transition-colors hover:border-brand hover:text-foreground disabled:opacity-40 disabled:hover:border-border"
            >
              ← prev
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              disabled={safePage >= pageCount - 1}
              className="border border-border px-2.5 py-1 transition-colors hover:border-brand hover:text-foreground disabled:opacity-40 disabled:hover:border-border"
            >
              next →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
