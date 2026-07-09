/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

export interface OrganizationWallet {
  balanceCents: number
  ongoingBalanceCents: number
  name: string
  creditCardConnected: boolean

  automaticTopUp?: AutomaticTopUp
  hasFailedOrPendingInvoice?: boolean
  freeBalanceCents?: number
  paidBalanceCents?: number
  freeExpiresAt?: Date
  billingStatus?: 'trial' | 'active' | 'low_balance' | 'zero_balance' | 'suspended' | 'closed' | 'frozen'
}

export type AutomaticTopUp = {
  thresholdAmount: number
  targetAmount: number
}

export interface WalletTopUpRequest {
  amountCents: number
}
