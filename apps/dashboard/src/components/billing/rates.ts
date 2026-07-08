/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

export const BILLING_RATES = {
  cpuPerVcpuHour: 0.0504,
  memoryPerGiBHour: 0.0162,
  diskPerGiBHour: 0.000108,
} as const

export function boxHourlyCost({ cpu, memory, disk }: { cpu: number; memory: number; disk: number }): number {
  return (
    cpu * BILLING_RATES.cpuPerVcpuHour +
    memory * BILLING_RATES.memoryPerGiBHour +
    disk * BILLING_RATES.diskPerGiBHour
  )
}

export function formatUsd(amount: number, maximumFractionDigits = 4): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  })}`
}
