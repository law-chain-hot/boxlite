/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity('pricing_plan')
@Index('pricing_plan_version_idx', ['version'], { unique: true })
@Index('pricing_plan_effective_idx', ['effectiveFrom'])
export class PricingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'int' })
  version: number

  @Column({ type: 'numeric', precision: 30, scale: 10 })
  cpuRateCentsPerSec: string

  @Column({ type: 'numeric', precision: 30, scale: 10 })
  memRateCentsPerSec: string

  @Column({ type: 'numeric', precision: 30, scale: 10 })
  diskRateCentsPerSec: string

  @Column({ type: 'numeric', precision: 30, scale: 10 })
  gpuRateCentsPerSec: string

  @Column({ type: 'bigint' })
  warnThresholdCents: string

  @Column({ type: 'bigint' })
  defaultGrantCents: string

  @Column({ type: 'timestamp with time zone' })
  effectiveFrom: Date

  @Column({ type: 'timestamp with time zone', nullable: true })
  effectiveTo: Date | null

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt: Date
}
