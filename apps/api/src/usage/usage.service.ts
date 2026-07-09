/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, FindOptionsWhere, IsNull, LessThan, MoreThan, Not, Repository } from 'typeorm'
import { RedisLockProvider } from '../box/common/redis-lock.provider'
import { Box } from '../box/entities/box.entity'
import { BoxDesiredState } from '../box/enums/box-desired-state.enum'
import { BoxState } from '../box/enums/box-state.enum'
import { UsagePeriodKind, UsageTotals, aggregateUsagePeriods, planUsageTransition } from './metering/usage-period-math'
import { UsagePeriodArchive } from './entities/usage-period-archive.entity'
import { UsagePeriod } from './entities/usage-period.entity'
import { applyUsagePeriodTransition, createUsagePeriodInput } from './usage-period-transition'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_METERING_LOOKBACK_MS = 30 * ONE_DAY_MS
const DEFAULT_METERING_LIMIT = 250
const MAX_METERING_LIMIT = 1000

export interface MeteringQueryOptions {
  from?: Date
  to?: Date
  limit?: number
  boxId?: string
}

export interface MeteringPeriodView {
  id: string
  source: 'usage_period' | 'usage_period_archive'
  sourcePeriodId?: string
  boxId: string
  organizationId: string
  region: string | null
  startAt: Date
  endAt: Date | null
  kind: UsagePeriodKind
  cpu: number
  mem: number
  disk: number
  gpu: number
  durationSeconds: number
  active: boolean
  actualCpuSeconds: number | null
  actualRssAvgBytes: string | null
  actualRssPeakBytes: string | null
  sampleCount: number | null
}

export interface OrganizationMeteringView {
  organizationId: string
  from: Date
  to: Date
  activePeriods: MeteringPeriodView[]
  archivedPeriods: MeteringPeriodView[]
  totals: UsageTotals
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name)

  constructor(
    @InjectRepository(UsagePeriod)
    private readonly periods: Repository<UsagePeriod>,
    @InjectRepository(UsagePeriodArchive)
    private readonly archives: Repository<UsagePeriodArchive>,
    private readonly redisLockProvider: RedisLockProvider,
  ) {}

  async applyTransition(box: Box, state: BoxState, desiredState: BoxDesiredState, now: Date): Promise<void> {
    await this.periods.manager.transaction(async (manager: EntityManager) => {
      await applyUsagePeriodTransition(manager, { ...box, state, desiredState } as Box, now, this.logger)
    })
  }

  async getOrganizationMeteringView(
    organizationId: string,
    options: MeteringQueryOptions = {},
    now: Date = new Date(),
  ): Promise<OrganizationMeteringView> {
    const to = options.to ?? now
    const from = options.from ?? new Date(to.getTime() - DEFAULT_METERING_LOOKBACK_MS)
    const limit = this.normalizeMeteringLimit(options.limit)
    const activeWhere = this.periodOverlapWhere<UsagePeriod>(organizationId, from, to, options.boxId)
    const archivedWhere = this.periodOverlapWhere<UsagePeriodArchive>(organizationId, from, to, options.boxId)

    const [activeRows, archivedRows] = await Promise.all([
      this.periods.find({
        where: activeWhere,
        order: { startAt: 'DESC' },
        take: limit,
      }),
      this.archives.find({
        where: archivedWhere,
        order: { startAt: 'DESC' },
        take: limit,
      }),
    ])

    const activePeriods = activeRows.map((period) => this.toMeteringPeriodView(period, 'usage_period', to))
    const archivedPeriods = archivedRows.map((period) => this.toMeteringPeriodView(period, 'usage_period_archive', to))

    return {
      organizationId,
      from,
      to,
      activePeriods,
      archivedPeriods,
      totals: aggregateUsagePeriods([...activeRows, ...archivedRows], from, to),
    }
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'close-and-reopen-usage-periods' })
  async closeAndReopenUsagePeriods(now: Date = new Date()): Promise<void> {
    const lockKey = 'usage-periods:rollover'
    if (!(await this.redisLockProvider.lock(lockKey, 60))) {
      return
    }

    try {
      const oldOpenPeriods = await this.periods.find({
        where: {
          endAt: IsNull(),
          startAt: LessThan(new Date(now.getTime() - ONE_DAY_MS)),
        },
        take: 100,
      })

      for (const period of oldOpenPeriods) {
        if (!(await this.redisLockProvider.lock(this.boxLockKey(period.boxId), 60))) {
          continue
        }

        try {
          await this.rolloverOpenPeriod(period, now)
        } finally {
          await this.redisLockProvider.unlock(this.boxLockKey(period.boxId))
        }
      }
    } finally {
      await this.redisLockProvider.unlock(lockKey)
    }
  }

  @Cron(CronExpression.EVERY_5_SECONDS, { name: 'archive-usage-periods' })
  async archiveUsagePeriods(): Promise<void> {
    const lockKey = 'usage-periods:archive'
    if (!(await this.redisLockProvider.lock(lockKey, 60))) {
      return
    }

    try {
      const closed = await this.periods.find({
        where: { endAt: Not(IsNull()) },
        take: 5000,
      })

      if (closed.length === 0) {
        return
      }

      await this.archiveClosedPeriods(closed)
    } finally {
      await this.redisLockProvider.unlock(lockKey)
    }
  }

  private periodOverlapWhere<T extends UsagePeriod | UsagePeriodArchive>(
    organizationId: string,
    from: Date,
    to: Date,
    boxId?: string,
  ): FindOptionsWhere<T>[] {
    const base = {
      organizationId,
      ...(boxId ? { boxId } : {}),
      startAt: LessThan(to),
    } as FindOptionsWhere<T>

    return [
      { ...base, endAt: IsNull() },
      { ...base, endAt: MoreThan(from) },
    ]
  }

  private normalizeMeteringLimit(limit: number | undefined): number {
    if (limit === undefined || Number.isNaN(limit)) {
      return DEFAULT_METERING_LIMIT
    }

    return Math.min(Math.max(Math.trunc(limit), 1), MAX_METERING_LIMIT)
  }

  private async rolloverOpenPeriod(period: UsagePeriod, now: Date): Promise<void> {
    await this.periods.manager.transaction(async (manager: EntityManager) => {
      const open = await manager.findOne(UsagePeriod, {
        where: { id: period.id, endAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      })

      if (!open) {
        return
      }

      const box = await manager.findOne(Box, {
        where: { id: period.boxId },
      })

      open.endAt = now
      await manager.save(UsagePeriod, open)

      if (!box) {
        return
      }

      const plan = planUsageTransition(null, box.state, box.desiredState)
      if (plan.openKind) {
        await manager.save(UsagePeriod, manager.create(UsagePeriod, createUsagePeriodInput(box, plan.openKind, now)))
      }
    })
  }

  private toMeteringPeriodView(
    period: UsagePeriod | UsagePeriodArchive,
    source: MeteringPeriodView['source'],
    to: Date,
  ): MeteringPeriodView {
    const endAt = period.endAt ?? null
    const effectiveEnd = endAt ?? to
    return {
      id: period.id,
      source,
      sourcePeriodId: source === 'usage_period_archive' ? (period as UsagePeriodArchive).sourcePeriodId : undefined,
      boxId: period.boxId,
      organizationId: period.organizationId,
      region: period.region,
      startAt: period.startAt,
      endAt,
      kind: period.kind,
      cpu: period.cpu,
      mem: period.mem,
      disk: period.disk,
      gpu: period.gpu,
      durationSeconds: Math.max(0, (effectiveEnd.getTime() - period.startAt.getTime()) / 1000),
      active: endAt === null,
      actualCpuSeconds: period.actualCpuSeconds,
      actualRssAvgBytes: period.actualRssAvgBytes,
      actualRssPeakBytes: period.actualRssPeakBytes,
      sampleCount: period.sampleCount,
    }
  }

  private async archiveClosedPeriods(closed: UsagePeriod[]): Promise<void> {
    await this.periods.manager.transaction(async (manager: EntityManager) => {
      await manager.save(UsagePeriodArchive, closed.map(UsagePeriodArchive.fromUsagePeriod))
      await manager.delete(
        UsagePeriod,
        closed.map((period) => period.id),
      )
    })
  }

  private boxLockKey(boxId: string): string {
    return `usage-period:${boxId}`
  }
}
