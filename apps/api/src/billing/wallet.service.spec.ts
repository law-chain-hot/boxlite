/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { PricingPlan } from './entities/pricing-plan.entity'
import { RatedPeriod } from './entities/rated-period.entity'
import { TopUpRecord } from './entities/top-up-record.entity'
import { WalletTransaction } from './entities/wallet-transaction.entity'
import { Wallet } from './entities/wallet.entity'
import { WalletService } from './wallet.service'

const ORG_ID = 'f5de33a9-4eb2-4279-a8de-9f02d63cc4f0'

function matchesFindValue(actual: unknown, expected: unknown): boolean {
  const operator = expected as { _type?: string; _value?: unknown[] }
  if (operator?._type === 'between' && Array.isArray(operator._value)) {
    const [from, to] = operator._value
    return actual instanceof Date && from instanceof Date && to instanceof Date && actual >= from && actual <= to
  }
  return actual === expected
}

class FakeEntityManager {
  constructor(private readonly repositories: Map<unknown, FakeRepository<unknown>>) {}

  async transaction<T>(callback: (manager: FakeEntityManager) => Promise<T>): Promise<T> {
    return callback(this)
  }

  getRepository<T>(entity: unknown): FakeRepository<T> {
    const repository = this.repositories.get(entity)
    if (!repository) {
      throw new Error(`missing fake repository for ${String(entity)}`)
    }
    return repository as FakeRepository<T>
  }
}

class FakeRepository<T extends { id?: string }> {
  rows: T[] = []
  manager: FakeEntityManager

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

  async find(opts: { where?: Partial<T>; take?: number } = {}): Promise<T[]> {
    const where = opts.where ?? {}
    const result = this.rows.filter((row) =>
      Object.entries(where).every(([key, value]) => matchesFindValue((row as Record<string, unknown>)[key], value)),
    )
    return result.slice(0, opts.take)
  }
}

class FakeWalletTransactionRepository extends FakeRepository<WalletTransaction> {
  async save(row: WalletTransaction): Promise<WalletTransaction> {
    if (row.ratedPeriodId && this.rows.some((existing) => existing.ratedPeriodId === row.ratedPeriodId)) {
      throw new QueryFailedError(
        'INSERT INTO wallet_transaction',
        [],
        Object.assign(new Error('duplicate'), { code: '23505' }),
      )
    }
    if (row.providerEventId && this.rows.some((existing) => existing.providerEventId === row.providerEventId)) {
      throw new QueryFailedError(
        'INSERT INTO wallet_transaction',
        [],
        Object.assign(new Error('duplicate'), { code: '23505' }),
      )
    }
    return super.save(row)
  }
}

class FakePricingPlanRepository extends FakeRepository<PricingPlan> {
  latest: PricingPlan | null = {
    id: 'd4624b9b-d5d7-471c-9dce-f1e96ab0ab47',
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

class FakeRatedPeriodRepository extends FakeRepository<RatedPeriod> {
  orderByPath?: string

  constructor(
    prefix: string,
    private readonly transactions: FakeWalletTransactionRepository,
  ) {
    super(prefix)
  }

  createQueryBuilder() {
    return {
      leftJoin: () => ({
        where: () => ({
          orderBy: (path: string) => {
            this.orderByPath = path
            return {
              limit: (limit: number) => ({
                getMany: async () =>
                  this.rows
                    .filter((period) => !this.transactions.rows.some((tx) => tx.ratedPeriodId === period.id))
                    .slice(0, limit),
              }),
            }
          },
        }),
      }),
    }
  }
}

function ratedPeriod(overrides: Partial<RatedPeriod> = {}): RatedPeriod {
  return {
    id: 'a145dc8f-a5f2-44be-a580-93031cc26d20',
    usagePeriodArchiveId: 'b3fbf3a8-0c33-4962-bd77-8ae77313baf1',
    sourcePeriodId: 'bc032d68-8ed9-40b1-9e58-83a363e6ef42',
    organizationId: ORG_ID,
    boxId: 'box-1',
    pricingVersion: 1,
    unitRates: {
      cpuRateCentsPerSec: '0.0014',
      memRateCentsPerSec: '0.00045',
      diskRateCentsPerSec: '0.000003',
      gpuRateCentsPerSec: '0',
      discountFactor: '1',
    },
    usageTotals: {
      cpuSeconds: 7200,
      memGibSeconds: 14400,
      diskGibSeconds: 36000,
      gpuSeconds: 0,
    },
    billedSeconds: '3600',
    preciseCents: '2500',
    ratedCents: '2500',
    ratedAt: new Date('2026-07-08T00:00:00Z'),
    ...overrides,
  } as RatedPeriod
}

describe('WalletService', () => {
  let wallets: FakeRepository<Wallet>
  let transactions: FakeWalletTransactionRepository
  let topUps: FakeRepository<TopUpRecord>
  let ratedPeriods: FakeRatedPeriodRepository
  let pricingPlans: FakePricingPlanRepository
  let service: WalletService

  beforeEach(() => {
    wallets = new FakeRepository<Wallet>('wallet')
    transactions = new FakeWalletTransactionRepository('wallet-transaction')
    topUps = new FakeRepository<TopUpRecord>('top-up')
    ratedPeriods = new FakeRatedPeriodRepository('rated-period', transactions)
    pricingPlans = new FakePricingPlanRepository('pricing-plan')

    const manager = new FakeEntityManager(
      new Map<unknown, FakeRepository<unknown>>([
        [Wallet, wallets as FakeRepository<unknown>],
        [WalletTransaction, transactions as FakeRepository<unknown>],
        [TopUpRecord, topUps as FakeRepository<unknown>],
        [RatedPeriod, ratedPeriods as FakeRepository<unknown>],
        [PricingPlan, pricingPlans as FakeRepository<unknown>],
      ]),
    )
    for (const repository of [wallets, transactions, topUps, ratedPeriods, pricingPlans]) {
      repository.manager = manager
    }

    service = new WalletService(
      wallets as never,
      transactions as never,
      topUps as never,
      ratedPeriods as never,
      pricingPlans as never,
    )
  })

  it('creates a wallet with the current default free grant', async () => {
    const wallet = await service.getWalletView(ORG_ID)

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
      organizationId: ORG_ID,
      kind: 'free_grant',
      amountCents: '10000',
      source: 'default_grant',
    })
  })

  it('debits a rated period once and spends free balance first', async () => {
    const period = ratedPeriod()

    expect(await service.debitRatedPeriod(period)).toMatchObject({
      organizationId: ORG_ID,
      kind: 'usage_debit',
      amountCents: '-2500',
      source: 'rated_period',
      ratedPeriodId: period.id,
    })
    expect(await service.debitRatedPeriod(period)).toBeNull()
    expect(wallets.rows[0]).toMatchObject({
      freeBalanceCents: '7500',
      paidBalanceCents: '0',
      billingStatus: 'trial',
    })
    const debit = transactions.rows.find((tx) => tx.kind === 'usage_debit')
    expect(debit).toBeDefined()
    if (!debit) {
      throw new Error('expected usage debit transaction')
    }
    debit.createdAt = new Date('2026-07-08T00:01:00Z')

    await expect(service.getWalletView(ORG_ID, new Date('2026-07-08T12:00:00Z'))).resolves.toMatchObject({
      balanceCents: 10000,
      ongoingBalanceCents: 7500,
    })
    expect(transactions.rows.filter((tx) => tx.kind === 'usage_debit')).toHaveLength(1)
  })

  it('carries sub-cent usage forward instead of rounding every period', async () => {
    const first = ratedPeriod({
      id: '26e46977-e7be-419f-9768-76d01747edc2',
      preciseCents: '0.6',
      ratedCents: '1',
    })
    const second = ratedPeriod({
      id: 'e1d44fa5-cf11-46ac-a8a6-1c8d3f42e0df',
      preciseCents: '0.6',
      ratedCents: '1',
    })

    expect(await service.debitRatedPeriod(first)).toMatchObject({ amountCents: '0' })
    expect(await service.debitRatedPeriod(second)).toMatchObject({ amountCents: '-1' })
    expect(wallets.rows[0]).toMatchObject({
      freeBalanceCents: '9999',
      paidBalanceCents: '0',
      settlementRemainderCents: '0.2',
    })
  })

  it('allows negative paid balance when usage exceeds prepaid balance', async () => {
    pricingPlans.latest = {
      ...pricingPlans.latest,
      defaultGrantCents: '1000',
      warnThresholdCents: '1000',
    } as PricingPlan

    await service.debitRatedPeriod(ratedPeriod({ ratedCents: '1500', preciseCents: '1500' }))

    expect(wallets.rows[0]).toMatchObject({
      freeBalanceCents: '0',
      paidBalanceCents: '-500',
      billingStatus: 'zero_balance',
    })
    expect(transactions.rows.find((tx) => tx.kind === 'usage_debit')?.metadata).toMatchObject({
      freeDebitCents: 1000,
      paidDebitCents: 500,
    })
  })

  it('sweeps only rated periods that do not have a debit transaction yet', async () => {
    ratedPeriods.rows.push(
      ratedPeriod({ id: 'a145dc8f-a5f2-44be-a580-93031cc26d20', ratedCents: '2500' }),
      ratedPeriod({ id: 'f150cf92-4f1b-4c1a-8258-4ba0d628af7c', ratedCents: '1000' }),
    )
    await service.debitRatedPeriod(ratedPeriods.rows[0])

    expect(await service.debitRatedPeriods()).toEqual({ debited: 1, skipped: 0 })
    expect(transactions.rows.filter((tx) => tx.kind === 'usage_debit')).toHaveLength(2)
    expect(ratedPeriods.orderByPath).toBe('rp.ratedAt')
  })

  it('creates pending top-ups and completes provider events idempotently', async () => {
    await service.getWalletView(ORG_ID)
    const payment = await service.createTopUp(ORG_ID, 2500)

    expect(payment.url).toContain('/billing/top-up/top-up-1')
    expect(topUps.rows[0]).toMatchObject({ organizationId: ORG_ID, amountCents: '2500', status: 'pending' })
    expect(wallets.rows[0].paidBalanceCents).toBe('0')

    expect(await service.completeTopUp(topUps.rows[0].id, 'evt-1')).toMatchObject({
      organizationId: ORG_ID,
      kind: 'top_up',
      amountCents: '2500',
      providerEventId: 'evt-1',
    })
    expect(await service.completeTopUp(topUps.rows[0].id, 'evt-1')).toBeNull()
    expect(wallets.rows[0]).toMatchObject({
      paidBalanceCents: '2500',
      billingStatus: 'trial',
    })
    expect(transactions.rows.filter((tx) => tx.kind === 'top_up')).toHaveLength(1)
  })

  it('validates automatic top-up settings in dollars and stores cents', async () => {
    await service.setAutomaticTopUp(ORG_ID, { thresholdAmount: 20, targetAmount: 100 })

    expect(wallets.rows[0]).toMatchObject({
      automaticTopUpThresholdCents: '2000',
      automaticTopUpTargetCents: '10000',
    })
    await expect(service.setAutomaticTopUp(ORG_ID, { thresholdAmount: 20, targetAmount: 25 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('aggregates rated usage into the dashboard usage shape', async () => {
    ratedPeriods.rows.push(ratedPeriod({ ratedCents: '50', ratedAt: new Date('2026-07-08T00:00:00Z') }))

    const usage = await service.getOrganizationUsage(ORG_ID, new Date('2026-07-08T12:00:00Z'))

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

  it('lists top-ups as receipt invoices and voids pending invoices', async () => {
    await service.createTopUp(ORG_ID, 2500)
    await service.createTopUp(ORG_ID, 5000)
    topUps.rows[0].createdAt = new Date('2026-07-08T00:00:00Z')
    topUps.rows[1].createdAt = new Date('2026-07-09T00:00:00Z')

    const invoices = await service.listInvoices(ORG_ID, 1, 1)

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

    await service.voidInvoice(ORG_ID, 'top-up-2')
    const voidedInvoices = await service.listInvoices(ORG_ID, 1, 1)
    expect(voidedInvoices.items[0]).toMatchObject({
      id: 'top-up-2',
      totalDueAmountCents: 0,
      paymentStatus: 'failed',
      status: 'voided',
    })
  })
})
