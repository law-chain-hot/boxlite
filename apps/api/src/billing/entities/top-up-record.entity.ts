/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

export type TopUpStatus = 'pending' | 'succeeded' | 'failed' | 'voided'

@Entity('top_up_record')
@Index('top_up_record_org_created_idx', ['organizationId', 'createdAt'])
export class TopUpRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  walletId: string

  @Column()
  organizationId: string

  @Column({ type: 'bigint' })
  amountCents: string

  @Column({ type: 'character varying', default: 'pending' })
  status: TopUpStatus

  @Column({ nullable: true })
  checkoutUrl: string | null

  @Column({ nullable: true })
  providerReference: string | null

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date
}
