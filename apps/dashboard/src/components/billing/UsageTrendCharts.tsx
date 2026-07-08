/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { AsciiStatCard } from './ascii'

function makeSeries(base: number, growth: number, wobble: number) {
  return Array.from({ length: 12 }, (_, index) => ({
    value: Math.max(0, Math.round(base + index * growth + Math.sin(index * 1.1) * wobble)),
  }))
}

export function UsageTrendCharts({
  costTotal,
  vcpuHours,
  ramHours,
  sandboxCount,
}: {
  costTotal: string
  vcpuHours: string
  ramHours: string
  sandboxCount: string
}) {
  return (
    <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
      <AsciiStatCard
        label="Usage Cost"
        prefix="$"
        value={costTotal}
        trendPct={12}
        spark={{ id: 'cost', data: makeSeries(120, 14, 18) }}
      />
      <AsciiStatCard
        label="vCPU Hours"
        value={vcpuHours}
        unit="hrs"
        trendPct={8}
        spark={{ id: 'vcpu', data: makeSeries(700, 50, 60) }}
      />
      <AsciiStatCard
        label="RAM Hours"
        value={ramHours}
        unit="GiB·hr"
        trendPct={5}
        spark={{ id: 'ram', data: makeSeries(400, 32, 40) }}
      />
      <AsciiStatCard
        label="Sandboxes"
        value={sandboxCount}
        unit="runs"
        trendPct={-3}
        spark={{ id: 'sandbox', data: makeSeries(260, 9, 28) }}
      />
    </div>
  )
}
