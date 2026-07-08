/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { UsagePeriodKind } from '../billing/usage-period-math'

@Entity('usage_period')
@Index('usage_period_box_end_idx', ['boxId', 'endAt'])
@Index('usage_period_org_start_idx', ['organizationId', 'startAt'])
@Index('usage_period_one_open_per_box_idx', ['boxId'], { unique: true, where: '"endAt" IS NULL' })
@Check('usage_period_end_after_start', '"endAt" IS NULL OR "endAt" >= "startAt"')
export class UsagePeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  boxId: string

  @Column()
  organizationId: string

  @Column({ nullable: true })
  region: string | null

  @Column({ type: 'timestamp with time zone' })
  startAt: Date

  @Column({ type: 'timestamp with time zone', nullable: true })
  endAt: Date | null

  @Column({ type: 'character varying' })
  kind: UsagePeriodKind

  @Column({ type: 'float' })
  cpu: number

  @Column({ type: 'float' })
  gpu: number

  @Column({ type: 'float' })
  mem: number

  @Column({ type: 'float' })
  disk: number

  @Column({ type: 'double precision', nullable: true })
  actualCpuSeconds: number | null

  @Column({ type: 'bigint', nullable: true })
  actualRssAvgBytes: string | null

  @Column({ type: 'bigint', nullable: true })
  actualRssPeakBytes: string | null

  @Column({ type: 'int', nullable: true })
  sampleCount: number | null

  static fromPeriod(period: UsagePeriod): UsagePeriod {
    const next = new UsagePeriod()
    next.boxId = period.boxId
    next.organizationId = period.organizationId
    next.region = period.region
    next.startAt = period.startAt
    next.endAt = period.endAt
    next.kind = period.kind
    next.cpu = period.cpu
    next.gpu = period.gpu
    next.mem = period.mem
    next.disk = period.disk
    next.actualCpuSeconds = period.actualCpuSeconds
    next.actualRssAvgBytes = period.actualRssAvgBytes
    next.actualRssPeakBytes = period.actualRssPeakBytes
    next.sampleCount = period.sampleCount
    return next
  }
}
