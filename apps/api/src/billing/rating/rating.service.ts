/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { QueryFailedError, Repository } from 'typeorm'
import { UsagePeriodArchive } from '../../usage/entities/usage-period-archive.entity'
import { PricingPlan } from '../entities/pricing-plan.entity'
import { RatedPeriod } from '../entities/rated-period.entity'
import { computeRatedCents, periodBillableTotals, type RateSnapshot } from './rate-math'

const PG_UNIQUE_VIOLATION = '23505'

function isUniqueViolation(err: unknown): boolean {
  return err instanceof QueryFailedError && (err.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
}

@Injectable()
export class RatingService {
  private readonly logger = new Logger(RatingService.name)

  constructor(
    @InjectRepository(UsagePeriodArchive)
    private readonly usageArchives: Repository<UsagePeriodArchive>,
    @InjectRepository(RatedPeriod)
    private readonly ratedPeriods: Repository<RatedPeriod>,
    @InjectRepository(PricingPlan)
    private readonly pricingPlans: Repository<PricingPlan>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledSweep(): Promise<void> {
    const result = await this.rateClosedPeriods()
    if (result.rated || result.skipped) {
      this.logger.log(`rating sweep: rated ${result.rated}, skipped ${result.skipped}`)
    }
  }

  async rateClosedPeriods(): Promise<{ rated: number; skipped: number }> {
    const periods = await this.findUnratedArchivedPeriods()
    let rated = 0
    let skipped = 0

    for (const period of periods) {
      const row = await this.ratePeriod(period)
      if (row) {
        rated++
      } else {
        skipped++
      }
    }

    return { rated, skipped }
  }

  async ratePeriod(period: UsagePeriodArchive): Promise<RatedPeriod | null> {
    const plan = await this.planForMoment(period.startAt)
    if (!plan) {
      this.logger.warn(`no pricing plan effective at ${period.startAt.toISOString()} for usage period ${period.id}`)
      return null
    }

    const snapshot: RateSnapshot = {
      cpuRateCentsPerSec: plan.cpuRateCentsPerSec,
      memRateCentsPerSec: plan.memRateCentsPerSec,
      diskRateCentsPerSec: plan.diskRateCentsPerSec,
      gpuRateCentsPerSec: plan.gpuRateCentsPerSec,
      discountFactor: '1',
    }
    const { billedSeconds, totals } = periodBillableTotals(period)
    const { preciseCents, ratedCents } = computeRatedCents(totals, snapshot)

    const row = this.ratedPeriods.create({
      usagePeriodArchiveId: period.id,
      sourcePeriodId: period.sourcePeriodId,
      organizationId: period.organizationId,
      boxId: period.boxId,
      pricingVersion: plan.version,
      unitRates: snapshot,
      usageTotals: totals,
      billedSeconds: String(billedSeconds),
      preciseCents,
      ratedCents: String(ratedCents),
    })

    try {
      return (await this.ratedPeriods.save(row)) ?? null
    } catch (err) {
      if (isUniqueViolation(err)) {
        return null
      }
      throw err
    }
  }

  private findUnratedArchivedPeriods(): Promise<UsagePeriodArchive[]> {
    return this.usageArchives
      .createQueryBuilder('up')
      .leftJoin(RatedPeriod, 'rp', 'rp."usagePeriodArchiveId" = up.id')
      .where('rp.id IS NULL')
      .andWhere('up."endAt" IS NOT NULL')
      .orderBy('up."startAt"', 'ASC')
      .getMany()
  }

  private planForMoment(at: Date): Promise<PricingPlan | null> {
    return this.pricingPlans
      .createQueryBuilder('p')
      .where('p."effectiveFrom" <= :at', { at })
      .andWhere('(p."effectiveTo" IS NULL OR :at < p."effectiveTo")', { at })
      .orderBy('p.version', 'DESC')
      .getOne()
  }
}
