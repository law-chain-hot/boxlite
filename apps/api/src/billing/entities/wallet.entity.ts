/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

export type BillingStatus = 'trial' | 'active' | 'low_balance' | 'zero_balance' | 'suspended' | 'closed' | 'frozen'

@Entity('wallet')
@Index('wallet_organization_idx', ['organizationId'], { unique: true })
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid' })
  organizationId: string

  @Column({ type: 'bigint', default: 0 })
  freeBalanceCents: string

  @Column({ type: 'bigint', default: 0 })
  paidBalanceCents: string

  @Column({ type: 'timestamp with time zone', nullable: true })
  freeExpiresAt: Date | null

  @Column({ type: 'character varying', default: 'trial' })
  billingStatus: BillingStatus

  @Column({ type: 'boolean', default: false })
  creditCardConnected: boolean

  @Column({ type: 'bigint', nullable: true })
  automaticTopUpThresholdCents: string | null

  @Column({ type: 'bigint', nullable: true })
  automaticTopUpTargetCents: string | null

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date
}
