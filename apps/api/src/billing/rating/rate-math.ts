/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import Decimal from 'decimal.js'
import { UsagePeriodKind, UsageTotals } from '../../usage/billing/usage-period-math'

export interface RateSnapshot {
  cpuRateCentsPerSec: string
  memRateCentsPerSec: string
  diskRateCentsPerSec: string
  gpuRateCentsPerSec: string
  discountFactor: string
}

export interface RateableUsagePeriod {
  startAt: Date
  endAt: Date
  kind: UsagePeriodKind
  cpu: number
  mem: number
  disk: number
  gpu: number
}

export function periodBillableTotals(period: RateableUsagePeriod): { billedSeconds: number; totals: UsageTotals } {
  const billedSeconds = Math.max(0, (period.endAt.getTime() - period.startAt.getTime()) / 1000)
  const running = period.kind === 'running'

  return {
    billedSeconds,
    totals: {
      cpuSeconds: running ? period.cpu * billedSeconds : 0,
      memGibSeconds: running ? period.mem * billedSeconds : 0,
      diskGibSeconds: period.disk * billedSeconds,
      gpuSeconds: running ? period.gpu * billedSeconds : 0,
    },
  }
}

export function computeRatedCents(totals: UsageTotals, rates: RateSnapshot): { preciseCents: string; ratedCents: number } {
  const precise = new Decimal(totals.cpuSeconds)
    .mul(rates.cpuRateCentsPerSec)
    .plus(new Decimal(totals.memGibSeconds).mul(rates.memRateCentsPerSec))
    .plus(new Decimal(totals.diskGibSeconds).mul(rates.diskRateCentsPerSec))
    .plus(new Decimal(totals.gpuSeconds).mul(rates.gpuRateCentsPerSec))
    .mul(rates.discountFactor)

  return {
    preciseCents: precise.toString(),
    ratedCents: precise.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
  }
}
