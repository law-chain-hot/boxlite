/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { QueryFailedError } from 'typeorm'
import { UsagePeriodArchive } from '../../usage/entities/usage-period-archive.entity'
import { PricingPlan } from '../entities/pricing-plan.entity'
import { RatedPeriod } from '../entities/rated-period.entity'
import { RatingService } from './rating.service'

class FakeUsageArchiveRepository {
  rows: UsagePeriodArchive[] = []

  createQueryBuilder() {
    return {
      leftJoin: () => ({
        where: () => ({
          andWhere: () => ({
            orderBy: () => ({
              getMany: async () => this.rows,
            }),
          }),
        }),
      }),
    }
  }
}

class FakeRatedPeriodRepository {
  rows: RatedPeriod[] = []

  create(input: Partial<RatedPeriod>): RatedPeriod {
    return input as RatedPeriod
  }

  async save(row: RatedPeriod): Promise<RatedPeriod> {
    if (this.rows.some((existing) => existing.usagePeriodArchiveId === row.usagePeriodArchiveId)) {
      throw new QueryFailedError(
        'INSERT INTO rated_period',
        [],
        Object.assign(new Error('duplicate'), { code: '23505' }),
      )
    }
    row.id = row.id ?? `rated-${this.rows.length + 1}`
    this.rows.push(row)
    return row
  }
}

class FakePricingPlanRepository {
  plan: PricingPlan | null = null

  createQueryBuilder() {
    return {
      where: () => ({
        andWhere: () => ({
          orderBy: () => ({
            getOne: async () => this.plan,
          }),
        }),
      }),
    }
  }
}

function archivedPeriod(): UsagePeriodArchive {
  return {
    id: 'b3fbf3a8-0c33-4962-bd77-8ae77313baf1',
    sourcePeriodId: 'bc032d68-8ed9-40b1-9e58-83a363e6ef42',
    boxId: 'box-1',
    organizationId: 'f5de33a9-4eb2-4279-a8de-9f02d63cc4f0',
    region: 'us',
    startAt: new Date('2026-07-08T00:00:00Z'),
    endAt: new Date('2026-07-08T00:01:00Z'),
    kind: 'running',
    cpu: 2,
    mem: 4,
    disk: 10,
    gpu: 1,
    actualCpuSeconds: null,
    actualRssAvgBytes: null,
    actualRssPeakBytes: null,
    sampleCount: null,
  } as UsagePeriodArchive
}

function pricingPlan(): PricingPlan {
  return {
    id: 'd4624b9b-d5d7-471c-9dce-f1e96ab0ab47',
    version: 1,
    cpuRateCentsPerSec: '2',
    memRateCentsPerSec: '1',
    diskRateCentsPerSec: '0.5',
    gpuRateCentsPerSec: '10',
    warnThresholdCents: '1000',
    defaultGrantCents: '0',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as PricingPlan
}

describe('RatingService', () => {
  it('rates closed archived usage periods exactly once', async () => {
    const usageArchives = new FakeUsageArchiveRepository()
    const ratedPeriods = new FakeRatedPeriodRepository()
    const pricingPlans = new FakePricingPlanRepository()
    usageArchives.rows.push(archivedPeriod())
    pricingPlans.plan = pricingPlan()

    const service = new RatingService(usageArchives as never, ratedPeriods as never, pricingPlans as never)

    expect(await service.rateClosedPeriods()).toEqual({ rated: 1, skipped: 0 })
    expect(await service.rateClosedPeriods()).toEqual({ rated: 0, skipped: 1 })
    expect(ratedPeriods.rows).toHaveLength(1)
    expect(ratedPeriods.rows[0]).toMatchObject({
      usagePeriodArchiveId: 'b3fbf3a8-0c33-4962-bd77-8ae77313baf1',
      organizationId: 'f5de33a9-4eb2-4279-a8de-9f02d63cc4f0',
      boxId: 'box-1',
      pricingVersion: 1,
      ratedCents: '1380',
    })
  })
})
