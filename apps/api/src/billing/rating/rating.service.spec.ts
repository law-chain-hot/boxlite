/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

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
      return null as never
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
    id: 'archive-1',
    sourcePeriodId: 'period-1',
    boxId: 'box-1',
    organizationId: 'org-1',
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
    id: 'plan-1',
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
      usagePeriodArchiveId: 'archive-1',
      organizationId: 'org-1',
      boxId: 'box-1',
      pricingVersion: 1,
      ratedCents: '1380',
    })
  })
})
