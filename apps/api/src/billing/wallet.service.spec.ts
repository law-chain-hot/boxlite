/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException } from '@nestjs/common'
import { RatedPeriod } from './entities/rated-period.entity'
import { PricingPlan } from './entities/pricing-plan.entity'
import { TopUpRecord } from './entities/top-up-record.entity'
import { WalletTransaction } from './entities/wallet-transaction.entity'
import { Wallet } from './entities/wallet.entity'
import { WalletService } from './wallet.service'

class FakeRepository<T extends { id?: string }> {
  rows: T[] = []

  constructor(private readonly prefix: string) {}

  create(input: Partial<T>): T {
    return input as T
  }

  async save(row: T): Promise<T> {
    row.id = row.id ?? `${this.prefix}-${this.rows.length + 1}`
    const existing = this.rows.findIndex((item) => item.id === row.id)
    if (existing === -1) {
      this.rows.push(row)
    } else {
      this.rows[existing] = row
    }
    return row
  }

  async findOne(opts: { where: Partial<T> }): Promise<T | null> {
    return (
      this.rows.find((row) =>
        Object.entries(opts.where).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
      ) ?? null
    )
  }

  async find(opts: { where?: Partial<T>; order?: Record<string, 'ASC' | 'DESC'>; take?: number } = {}): Promise<T[]> {
    const where = opts.where ?? {}
    const result = this.rows.filter((row) =>
      Object.entries(where).every(([key, value]) => (row as Record<string, unknown>)[key] === value),
    )
    return result.slice(0, opts.take)
  }
}

class FakePricingPlanRepository extends FakeRepository<PricingPlan> {
  latest: PricingPlan | null = {
    id: 'plan-1',
    version: 1,
    defaultGrantCents: '10000',
    warnThresholdCents: '1000',
    cpuRateCentsPerSec: '0.0014',
    memRateCentsPerSec: '0.00045',
    diskRateCentsPerSec: '0.000003',
    gpuRateCentsPerSec: '0',
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as PricingPlan

  createQueryBuilder() {
    return {
      orderBy: () => ({
        getOne: async () => this.latest,
      }),
    }
  }
}

describe('WalletService', () => {
  let wallets: FakeRepository<Wallet>
  let transactions: FakeRepository<WalletTransaction>
  let topUps: FakeRepository<TopUpRecord>
  let ratedPeriods: FakeRepository<RatedPeriod>
  let pricingPlans: FakePricingPlanRepository
  let service: WalletService

  beforeEach(() => {
    wallets = new FakeRepository<Wallet>('wallet')
    transactions = new FakeRepository<WalletTransaction>('wallet-transaction')
    topUps = new FakeRepository<TopUpRecord>('top-up')
    ratedPeriods = new FakeRepository<RatedPeriod>('rated-period')
    pricingPlans = new FakePricingPlanRepository('pricing-plan')
    service = new WalletService(
      wallets as never,
      transactions as never,
      topUps as never,
      ratedPeriods as never,
      pricingPlans as never,
    )
  })

  it('creates a prepaid USD wallet with the current default free grant', async () => {
    const wallet = await service.getWalletView('org-1')

    expect(wallet).toMatchObject({
      balanceCents: 10000,
      ongoingBalanceCents: 10000,
      freeBalanceCents: 10000,
      paidBalanceCents: 0,
      billingStatus: 'trial',
      creditCardConnected: false,
      hasFailedOrPendingInvoice: false,
    })
    expect(transactions.rows).toHaveLength(1)
    expect(transactions.rows[0]).toMatchObject({
      organizationId: 'org-1',
      kind: 'free_grant',
      amountCents: '10000',
      source: 'default_grant',
    })
  })

  it('validates and stores automatic top-up settings in cents', async () => {
    await service.setAutomaticTopUp('org-1', { thresholdAmount: 20, targetAmount: 100 })

    const wallet = wallets.rows[0]
    expect(wallet.automaticTopUpThresholdCents).toBe('2000')
    expect(wallet.automaticTopUpTargetCents).toBe('10000')
    await expect(service.setAutomaticTopUp('org-1', { thresholdAmount: 20, targetAmount: 25 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('rejects negative or non-finite automatic top-up values', async () => {
    await expect(service.setAutomaticTopUp('org-1', { thresholdAmount: -1, targetAmount: 20 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(
      service.setAutomaticTopUp('org-1', { thresholdAmount: Number.NaN, targetAmount: 20 }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('creates a top-up placeholder without mutating paid balance', async () => {
    const before = await service.getWalletView('org-1')
    const payment = await service.createTopUp('org-1', 2500)
    const after = await service.getWalletView('org-1')

    expect(payment.url).toContain('/billing/top-up/top-up-1')
    expect(topUps.rows).toHaveLength(1)
    expect(topUps.rows[0]).toMatchObject({ organizationId: 'org-1', amountCents: '2500', status: 'pending' })
    expect(after.paidBalanceCents).toBe(before.paidBalanceCents)
  })

  it('lists top-ups as receipt invoices and voids pending invoices', async () => {
    await service.createTopUp('org-1', 2500)
    await service.createTopUp('org-1', 5000)
    topUps.rows[0].createdAt = new Date('2026-07-08T00:00:00Z')
    topUps.rows[1].createdAt = new Date('2026-07-09T00:00:00Z')

    const invoices = await service.listInvoices('org-1', 1, 1)

    expect(invoices).toMatchObject({
      totalItems: 2,
      totalPages: 2,
      page: 1,
      perPage: 1,
    })
    expect(invoices.items[0]).toMatchObject({
      id: 'top-up-2',
      totalAmountCents: 5000,
      totalDueAmountCents: 5000,
      paymentStatus: 'pending',
      status: 'pending',
      type: 'one_off',
    })

    await service.voidInvoice('org-1', 'top-up-2')
    const voidedInvoices = await service.listInvoices('org-1', 1, 1)
    expect(voidedInvoices.items[0]).toMatchObject({
      id: 'top-up-2',
      totalDueAmountCents: 0,
      paymentStatus: 'failed',
      status: 'voided',
    })
  })

  it('aggregates rated usage into the dashboard usage shape', async () => {
    ratedPeriods.rows.push({
      id: 'rated-1',
      organizationId: 'org-1',
      boxId: 'box-1',
      ratedCents: '50',
      ratedAt: new Date('2026-07-08T00:00:00Z'),
      usageTotals: {
        cpuSeconds: 7200,
        memGibSeconds: 14400,
        diskGibSeconds: 36000,
        gpuSeconds: 0,
      },
      unitRates: {
        cpuRateCentsPerSec: '0.0014',
        memRateCentsPerSec: '0.00045',
        diskRateCentsPerSec: '0.000003',
        gpuRateCentsPerSec: '0',
        discountFactor: '1',
      },
    } as RatedPeriod)

    const usage = await service.getOrganizationUsage('org-1', new Date('2026-07-08T12:00:00Z'))

    expect(usage.amountCents).toBe(50)
    expect(usage.totalAmountCents).toBe(50)
    expect(usage.usageCharges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ billableMetric: 'cpu_usage', units: '7200', eventsCount: 1 }),
        expect.objectContaining({ billableMetric: 'ram_usage', units: '14400', eventsCount: 1 }),
        expect.objectContaining({ billableMetric: 'disk_usage', units: '36000', eventsCount: 1 }),
      ]),
    )
  })

  it('returns past monthly usage buckets for dashboard history', async () => {
    ratedPeriods.rows.push(
      {
        id: 'rated-june',
        organizationId: 'org-1',
        boxId: 'box-1',
        ratedCents: '20',
        ratedAt: new Date('2026-06-15T00:00:00Z'),
        usageTotals: {
          cpuSeconds: 3600,
          memGibSeconds: 7200,
          diskGibSeconds: 10000,
          gpuSeconds: 0,
        },
        unitRates: {
          cpuRateCentsPerSec: '0.0014',
          memRateCentsPerSec: '0.00045',
          diskRateCentsPerSec: '0.000003',
          gpuRateCentsPerSec: '0',
          discountFactor: '1',
        },
      } as RatedPeriod,
      {
        id: 'rated-july',
        organizationId: 'org-1',
        boxId: 'box-2',
        ratedCents: '30',
        ratedAt: new Date('2026-07-05T00:00:00Z'),
        usageTotals: {
          cpuSeconds: 7200,
          memGibSeconds: 14400,
          diskGibSeconds: 20000,
          gpuSeconds: 0,
        },
        unitRates: {
          cpuRateCentsPerSec: '0.0014',
          memRateCentsPerSec: '0.00045',
          diskRateCentsPerSec: '0.000003',
          gpuRateCentsPerSec: '0',
          discountFactor: '1',
        },
      } as RatedPeriod,
    )

    const usage = await service.getPastOrganizationUsage('org-1', 2, new Date('2026-07-08T12:00:00Z'))

    expect(usage).toHaveLength(2)
    expect(usage[0].totalAmountCents).toBe(20)
    expect(usage[1].totalAmountCents).toBe(30)
    expect(usage[1].to.toISOString()).toBe('2026-07-08T12:00:00.000Z')
  })
})
