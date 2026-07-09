/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ChartConfig, ChartContainer } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { Area, AreaChart } from 'recharts'

export const BILLING_BRAND = 'hsl(196 100% 47%)'

const DOT_MATRIX_GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00', '00', '00', '00', '00', '11', '11'],
  ',': ['00', '00', '00', '00', '00', '11', '10'],
}

export function DotMatrix({ text, dot = 3, gap = 1 }: { text: string; dot?: number; gap?: number }) {
  return (
    <div className="inline-flex items-end leading-none" aria-label={text} style={{ gap: `${dot + gap}px` }}>
      {[...text].map((character, index) => {
        const rows = DOT_MATRIX_GLYPHS[character]
        if (!rows) {
          return <span key={`${character}-${index}`} style={{ width: `${dot * 2}px` }} />
        }
        const columns = rows[0].length
        return (
          <div
            key={`${character}-${index}`}
            className="grid"
            style={{ gridTemplateColumns: `repeat(${columns}, ${dot}px)`, gridAutoRows: `${dot}px`, gap: `${gap}px` }}
          >
            {rows.flatMap((row, rowIndex) =>
              [...row].map((cell, columnIndex) => (
                <span
                  key={`${rowIndex}-${columnIndex}`}
                  style={{
                    width: `${dot}px`,
                    height: `${dot}px`,
                    borderRadius: '50%',
                    background: cell === '1' ? 'currentColor' : 'transparent',
                  }}
                />
              )),
            )}
          </div>
        )
      })}
    </div>
  )
}

export function MatrixAmount({
  prefix,
  value,
  unit,
  size = 'sm',
}: {
  prefix?: string
  value: string
  unit?: string
  size?: 'sm' | 'lg'
}) {
  const isLarge = size === 'lg'
  return (
    <div className="flex min-h-[36px] items-end gap-[6px] text-foreground">
      {prefix ? (
        <span
          className={cn(
            'font-mono font-semibold leading-none tabular-nums',
            isLarge ? 'translate-y-[2px] text-[16px]' : 'translate-y-px text-[13px]',
          )}
        >
          {prefix}
        </span>
      ) : null}
      <span className={cn('flex items-end', isLarge ? 'mb-0' : 'mb-[1px]')}>
        <DotMatrix text={value} dot={isLarge ? 3 : 2} gap={1} />
      </span>
      {unit ? (
        <span className="mb-[3px] font-mono text-[10px] uppercase tracking-[0.5px] text-muted-foreground">{unit}</span>
      ) : null}
    </div>
  )
}

export function SectionTitle({ title, count, right }: { title: string; count?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-[2px]">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-foreground">
          <span style={{ color: BILLING_BRAND }}>▸</span> {title}
        </span>
        {count ? <span className="font-mono text-[11px] text-muted-foreground">{count}</span> : null}
      </div>
      {right}
    </div>
  )
}

export function CardBrand({ brand = 'visa', size = 'sm' }: { brand?: 'visa' | 'mastercard'; size?: 'sm' | 'lg' }) {
  const isLarge = size === 'lg'
  if (brand === 'mastercard') {
    const diameter = isLarge ? 16 : 10
    return (
      <span
        className={cn(
          'inline-flex items-center gap-[2px] rounded bg-white',
          isLarge ? 'px-2 py-1.5' : 'px-[5px] py-[3px]',
        )}
      >
        <span className="rounded-full bg-[#EB001B]" style={{ width: diameter, height: diameter }} />
        <span
          className="-ml-[6px] rounded-full bg-[#F79E1B] opacity-90"
          style={{ width: diameter, height: diameter }}
        />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded bg-white font-bold italic leading-none tracking-[-0.5px] text-[#1A1F71]',
        isLarge ? 'px-[11px] py-[7px] text-[18px]' : 'px-[6px] py-[2px] text-[11px]',
      )}
    >
      VISA
    </span>
  )
}

const sparkConfig: ChartConfig = { value: { label: 'value', color: BILLING_BRAND } }

function MiniSpark({ id, data }: { id: string; data: { value: number }[] }) {
  return (
    <ChartContainer config={sparkConfig} className="aspect-auto h-11 w-full">
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`billing-spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BILLING_BRAND} stopOpacity={0.25} />
            <stop offset="100%" stopColor={BILLING_BRAND} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          dataKey="value"
          type="monotone"
          stroke={BILLING_BRAND}
          strokeWidth={1.5}
          fill={`url(#billing-spark-${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

export function AsciiStatCard({
  label,
  prefix,
  value,
  unit,
  trendPct,
  spark,
}: {
  label: string
  prefix?: string
  value: string
  unit?: string
  trendPct?: number
  spark?: { id: string; data: { value: number }[] }
}) {
  const trendUp = (trendPct ?? 0) >= 0
  return (
    <div className="flex flex-col gap-[14px] border border-border bg-card px-[22px] pb-5 pt-[18px] transition-transform hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[1.5px] text-muted-foreground">
          <span style={{ color: BILLING_BRAND }}>▸</span> {label}
        </span>
        {trendPct !== undefined ? (
          <span className={cn('font-mono text-[10px] tabular-nums', trendUp ? 'text-success' : 'text-destructive')}>
            {trendUp ? '▲' : '▼'} {Math.abs(trendPct)}%
          </span>
        ) : null}
      </div>
      <MatrixAmount prefix={prefix} value={value} unit={unit} />
      {spark ? <MiniSpark id={spark.id} data={spark.data} /> : null}
    </div>
  )
}
