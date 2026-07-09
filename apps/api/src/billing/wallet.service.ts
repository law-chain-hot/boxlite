/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import Decimal from 'decimal.js'
import { EntityManager, QueryFailedError, Repository } from 'typeorm'
import { PricingPlan } from './entities/pricing-plan.entity'
import { RatedPeriod } from './entities/rated-period.entity'
import { TopUpRecord } from './entities/top-up-record.entity'
import { WalletTransaction } from './entities/wallet-transaction.entity'
import { BillingStatus, Wallet } from './entities/wallet.entity'

export interface AutomaticTopUpInput {
  thresholdAmount: number
  targetAmount: number
}

export interface OrganizationWalletView {
  balanceCents: number
  ongoingBalanceCents: number
  name: string
  creditCardConnected: boolean
  automaticTopUp?: AutomaticTopUpInput
  hasFailedOrPendingInvoice: boolean
  freeBalanceCents: number
  paidBalanceCents: number
  freeExpiresAt?: Date
  billingStatus: BillingStatus
}

export interface PaymentUrlView {
  url: string
}

export interface OrganizationUsageView {
  from: Date
  to: Date
  issuingDate: string
  amountCents: number
  totalAmountCents: number
  taxesAmountCents: number
  usageCharges: Array<{
    units: string
    eventsCount: number
    amountCents: number
    billableMetric: 'cpu_usage' | 'gpu_usage' | 'ram_usage' | 'disk_usage' | 'unknown'
  }>
}

export interface TierView {
  tier: number
  tierLimit: {
    concurrentCPU: number
    concurrentRAMGiB: number
    concurrentDiskGiB: number
  }
  minTopUpAmountCents: number
  topUpIntervalDays: number
}

export interface InvoiceView {
  currency: string
  id: string
  issuingDate: string
  number: string
  paymentDueDate: string
  paymentOverdue: boolean
  paymentStatus: 'pending' | 'succeeded' | 'failed'
  sequentialId: number
  status: 'draft' | 'finalized' | 'failed' | 'voided' | 'pending'
  totalAmountCents: number
  totalDueAmountCents: number
  type: 'one_off'
}

export interface PaginatedInvoicesView {
  items: InvoiceView[]
  totalItems: number
  totalPages: number
  page: number
  perPage: number
}

const DEFAULT_GRANT_CENTS = 10000
const MIN_AUTO_TOP_UP_SPREAD_DOLLARS = 10
const PG_UNIQUE_VIOLATION = '23505'

const TIERS: TierView[] = [
  {
    tier: 1,
    tierLimit: { concurrentCPU: 10, concurrentRAMGiB: 20, concurrentDiskGiB: 30 },
    minTopUpAmountCents: 0,
    topUpIntervalDays: 0,
  },
  {
    tier: 2,
    tierLimit: { concurrentCPU: 100, concurrentRAMGiB: 200, concurrentDiskGiB: 300 },
    minTopUpAmountCents: 2500,
    topUpIntervalDays: 0,
  },
  {
    tier: 3,
    tierLimit: { concurrentCPU: 250, concurrentRAMGiB: 500, concurrentDiskGiB: 2000 },
    minTopUpAmountCents: 50000,
    topUpIntervalDays: 0,
  },
  {
    tier: 4,
    tierLimit: { concurrentCPU: 500, concurrentRAMGiB: 1000, concurrentDiskGiB: 5000 },
    minTopUpAmountCents: 200000,
    topUpIntervalDays: 30,
  },
]

function isUniqueViolation(err: unknown): boolean {
  return err instanceof QueryFailedError && (err.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name)

  constructor(
    @InjectRepository(Wallet)
    private readonly wallets: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private readonly transactions: Repository<WalletTransaction>,
    @InjectRepository(TopUpRecord)
    private readonly topUps: Repository<TopUpRecord>,
    @InjectRepository(RatedPeriod)
    private readonly ratedPeriods: Repository<RatedPeriod>,
    @InjectRepository(PricingPlan)
    private readonly pricingPlans: Repository<PricingPlan>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'debit-rated-periods' })
  async scheduledDebitSweep(): Promise<void> {
    const result = await this.debitRatedPeriods()
    if (result.debited || result.skipped) {
      this.logger.log(`wallet debit sweep: debited ${result.debited}, skipped ${result.skipped}`)
    }
  }

  async getWalletView(organizationId: string): Promise<OrganizationWalletView> {
    const wallet = await this.getOrCreateWallet(organizationId)
    const openTopUps = await this.topUps.find({ where: { organizationId } })
    const ongoingBalanceCents = this.availableBalanceCents(wallet)

    return {
      balanceCents: ongoingBalanceCents,
      ongoingBalanceCents,
      name: organizationId,
      creditCardConnected: wallet.creditCardConnected,
      automaticTopUp: this.automaticTopUpView(wallet),
      hasFailedOrPendingInvoice: openTopUps.some((topUp) => topUp.status === 'pending' || topUp.status === 'failed'),
      freeBalanceCents: Number(wallet.freeBalanceCents),
      paidBalanceCents: Number(wallet.paidBalanceCents),
      freeExpiresAt: wallet.freeExpiresAt ?? undefined,
      billingStatus: wallet.billingStatus,
    }
  }

  async setAutomaticTopUp(organizationId: string, automaticTopUp?: AutomaticTopUpInput): Promise<void> {
    const wallet = await this.getOrCreateWallet(organizationId)

    if (!automaticTopUp || (automaticTopUp.thresholdAmount === 0 && automaticTopUp.targetAmount === 0)) {
      wallet.automaticTopUpThresholdCents = null
      wallet.automaticTopUpTargetCents = null
      await this.wallets.save(wallet)
      return
    }

    if (
      !Number.isFinite(automaticTopUp.thresholdAmount) ||
      !Number.isFinite(automaticTopUp.targetAmount) ||
      automaticTopUp.thresholdAmount < 0 ||
      automaticTopUp.targetAmount < 0
    ) {
      throw new BadRequestException('automatic top-up amounts must be finite positive dollar values')
    }

    if (automaticTopUp.targetAmount < automaticTopUp.thresholdAmount + MIN_AUTO_TOP_UP_SPREAD_DOLLARS) {
      throw new BadRequestException(
        `automatic top-up target must be at least $${MIN_AUTO_TOP_UP_SPREAD_DOLLARS} higher than threshold`,
      )
    }

    wallet.automaticTopUpThresholdCents = String(this.dollarsToCents(automaticTopUp.thresholdAmount))
    wallet.automaticTopUpTargetCents = String(this.dollarsToCents(automaticTopUp.targetAmount))
    await this.wallets.save(wallet)
  }

  async createTopUp(organizationId: string, amountCents: number): Promise<PaymentUrlView> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('top-up amount must be a positive cent value')
    }

    const wallet = await this.getOrCreateWallet(organizationId)
    const topUp = await this.topUps.save(
      this.topUps.create({
        walletId: wallet.id,
        organizationId,
        amountCents: String(amountCents),
        status: 'pending',
        checkoutUrl: null,
        providerReference: null,
      }),
    )
    const url = `http://localhost:3000/billing/top-up/${topUp.id}`
    topUp.checkoutUrl = url
    await this.topUps.save(topUp)

    return { url }
  }

  async completeTopUp(topUpId: string, providerEventId: string): Promise<WalletTransaction | null> {
    if (!providerEventId) {
      throw new BadRequestException('provider event id is required')
    }

    try {
      return await this.wallets.manager.transaction(async (manager) => {
        const transactionRepo = manager.getRepository(WalletTransaction)
        const existing = await transactionRepo.findOne({ where: { providerEventId } })
        if (existing) {
          return null
        }

        const topUpRepo = manager.getRepository(TopUpRecord)
        const topUp = await topUpRepo.findOne({ where: { id: topUpId }, lock: { mode: 'pessimistic_write' } })
        if (!topUp) {
          throw new NotFoundException('top-up not found')
        }
        if (topUp.status === 'succeeded') {
          return null
        }
        if (topUp.status === 'voided') {
          throw new BadRequestException('voided top-ups cannot be completed')
        }

        const wallet = await this.findWalletForUpdate(manager, topUp.organizationId)
        wallet.paidBalanceCents = String(Number(wallet.paidBalanceCents) + Number(topUp.amountCents))
        wallet.billingStatus = await this.statusForWallet(manager, wallet)
        await manager.getRepository(Wallet).save(wallet)

        topUp.status = 'succeeded'
        topUp.providerReference = providerEventId
        await topUpRepo.save(topUp)

        return transactionRepo.save(
          transactionRepo.create({
            walletId: wallet.id,
            organizationId: wallet.organizationId,
            kind: 'top_up',
            amountCents: topUp.amountCents,
            source: 'top_up',
            ratedPeriodId: null,
            providerEventId,
            metadata: { topUpId },
          }),
        )
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        return null
      }
      throw err
    }
  }

  async debitRatedPeriods(limit = 100): Promise<{ debited: number; skipped: number }> {
    const periods = await this.findUndebitedRatedPeriods(limit)
    let debited = 0
    let skipped = 0

    for (const period of periods) {
      const row = await this.debitRatedPeriod(period)
      if (row) {
        debited++
      } else {
        skipped++
      }
    }

    return { debited, skipped }
  }

  async debitRatedPeriod(period: RatedPeriod): Promise<WalletTransaction | null> {
    try {
      return await this.wallets.manager.transaction(async (manager) => {
        const transactionRepo = manager.getRepository(WalletTransaction)
        const existing = await transactionRepo.findOne({ where: { ratedPeriodId: period.id } })
        if (existing) {
          return null
        }

        const wallet = await this.findWalletForUpdate(manager, period.organizationId)
        const amountCents = Math.max(0, Number(period.ratedCents))
        const freeBefore = Number(wallet.freeBalanceCents)
        const paidBefore = Number(wallet.paidBalanceCents)
        const freeDebitCents = Math.min(Math.max(0, freeBefore), amountCents)
        const paidDebitCents = amountCents - freeDebitCents

        wallet.freeBalanceCents = String(freeBefore - freeDebitCents)
        wallet.paidBalanceCents = String(paidBefore - paidDebitCents)
        wallet.billingStatus = await this.statusForWallet(manager, wallet)
        await manager.getRepository(Wallet).save(wallet)

        return transactionRepo.save(
          transactionRepo.create({
            walletId: wallet.id,
            organizationId: wallet.organizationId,
            kind: 'usage_debit',
            amountCents: String(-amountCents),
            source: 'rated_period',
            ratedPeriodId: period.id,
            providerEventId: null,
            metadata: {
              freeDebitCents,
              paidDebitCents,
              ratedCents: period.ratedCents,
            },
          }),
        )
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        return null
      }
      throw err
    }
  }

  async getOrganizationUsage(organizationId: string, now: Date = new Date()): Promise<OrganizationUsageView> {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
    const periods = await this.ratedPeriods.find({ where: { organizationId } })
    const currentPeriods = periods.filter((period) => period.ratedAt >= from && period.ratedAt <= now)

    return this.usageViewFromRatedPeriods(currentPeriods, from, now)
  }

  async getPastOrganizationUsage(
    organizationId: string,
    periods = 12,
    now: Date = new Date(),
  ): Promise<OrganizationUsageView[]> {
    const periodCount = Math.max(1, Math.min(24, Math.trunc(Number.isFinite(periods) ? periods : 12)))
    const ratedPeriods = await this.ratedPeriods.find({ where: { organizationId } })

    return Array.from({ length: periodCount }, (_, index) => {
      const monthOffset = periodCount - index - 1
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthOffset, 1, 0, 0, 0, 0))
      const naturalTo = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0))
      const to = naturalTo > now ? now : naturalTo
      const monthPeriods = ratedPeriods.filter((period) => period.ratedAt >= from && period.ratedAt < to)
      return this.usageViewFromRatedPeriods(monthPeriods, from, to)
    })
  }

  async getOrganizationTier(organizationId: string) {
    await this.getOrCreateWallet(organizationId)
    const topUps = await this.topUps.find({ where: { organizationId } })
    const largestSuccessfulPaymentCents = topUps
      .filter((topUp) => topUp.status === 'succeeded')
      .reduce((largest, topUp) => Math.max(largest, Number(topUp.amountCents)), 0)
    const tier = [...TIERS]
      .sort((left, right) => right.tier - left.tier)
      .find((candidate) => largestSuccessfulPaymentCents >= candidate.minTopUpAmountCents)

    return {
      tier: tier?.tier ?? 1,
      largestSuccessfulPaymentCents,
      hasVerifiedBusinessEmail: false,
    }
  }

  listTiers(): TierView[] {
    return TIERS
  }

  async listInvoices(organizationId: string, page = 1, perPage = 20): Promise<PaginatedInvoicesView> {
    const currentPage = Math.max(1, Math.trunc(Number.isFinite(page) ? page : 1))
    const pageSize = Math.max(1, Math.min(100, Math.trunc(Number.isFinite(perPage) ? perPage : 20)))
    const topUps = await this.topUps.find({ where: { organizationId } })
    const sortedTopUps = [...topUps].sort((left, right) => this.createdTime(right) - this.createdTime(left))
    const start = (currentPage - 1) * pageSize
    const items = sortedTopUps
      .slice(start, start + pageSize)
      .map((topUp, index) => this.invoiceView(topUp, start + index + 1))

    return {
      items,
      totalItems: sortedTopUps.length,
      totalPages: Math.ceil(sortedTopUps.length / pageSize),
      page: currentPage,
      perPage: pageSize,
    }
  }

  async createInvoicePaymentUrl(organizationId: string, invoiceId: string): Promise<PaymentUrlView> {
    const topUp = await this.topUps.findOne({ where: { organizationId, id: invoiceId } })
    if (!topUp) {
      throw new NotFoundException('invoice not found')
    }

    return { url: topUp.checkoutUrl ?? `http://localhost:3000/billing/invoice/${organizationId}/${invoiceId}` }
  }

  async voidInvoice(organizationId: string, invoiceId: string): Promise<void> {
    const topUp = await this.topUps.findOne({ where: { organizationId, id: invoiceId } })
    if (!topUp) {
      throw new NotFoundException('invoice not found')
    }
    if (topUp.status === 'succeeded') {
      throw new BadRequestException('paid invoices cannot be voided')
    }

    topUp.status = 'voided'
    await this.topUps.save(topUp)
  }

  getPortalUrl(organizationId: string): string {
    return `http://localhost:3000/billing/portal/${organizationId}`
  }

  getCheckoutUrl(organizationId: string): string {
    return `http://localhost:3000/billing/checkout/${organizationId}`
  }

  private findUndebitedRatedPeriods(limit: number): Promise<RatedPeriod[]> {
    return this.ratedPeriods
      .createQueryBuilder('rp')
      .leftJoin(WalletTransaction, 'wt', 'wt."ratedPeriodId" = rp.id')
      .where('wt.id IS NULL')
      .orderBy('rp."ratedAt"', 'ASC')
      .limit(Math.max(1, Math.min(1000, Math.trunc(limit))))
      .getMany()
  }

  private async getOrCreateWallet(organizationId: string): Promise<Wallet> {
    return this.wallets.manager.transaction((manager) => this.findWalletForUpdate(manager, organizationId))
  }

  private async findWalletForUpdate(manager: EntityManager, organizationId: string): Promise<Wallet> {
    const walletRepo = manager.getRepository(Wallet)
    const existing = await walletRepo.findOne({ where: { organizationId }, lock: { mode: 'pessimistic_write' } })
    if (existing) {
      return existing
    }

    const defaultGrantCents = await this.defaultGrantCents(manager)
    const wallet = await walletRepo.save(
      walletRepo.create({
        organizationId,
        freeBalanceCents: String(defaultGrantCents),
        paidBalanceCents: '0',
        freeExpiresAt: null,
        billingStatus: defaultGrantCents > 0 ? 'trial' : 'active',
        creditCardConnected: false,
        automaticTopUpThresholdCents: null,
        automaticTopUpTargetCents: null,
      }),
    )

    if (defaultGrantCents > 0) {
      await manager.getRepository(WalletTransaction).save(
        manager.getRepository(WalletTransaction).create({
          walletId: wallet.id,
          organizationId,
          kind: 'free_grant',
          amountCents: String(defaultGrantCents),
          source: 'default_grant',
          ratedPeriodId: null,
          providerEventId: null,
          metadata: { pricingSource: 'latest_pricing_plan' },
        }),
      )
    }

    return wallet
  }

  private async defaultGrantCents(manager: EntityManager): Promise<number> {
    const plan = await manager
      .getRepository(PricingPlan)
      .createQueryBuilder('pricing_plan')
      .orderBy('pricing_plan.version', 'DESC')
      .getOne()
    return Number(plan?.defaultGrantCents ?? DEFAULT_GRANT_CENTS)
  }

  private async statusForWallet(manager: EntityManager, wallet: Wallet): Promise<BillingStatus> {
    const balance = this.availableBalanceCents(wallet)
    if (balance <= 0) {
      return 'zero_balance'
    }

    const plan = await manager
      .getRepository(PricingPlan)
      .createQueryBuilder('pricing_plan')
      .orderBy('pricing_plan.version', 'DESC')
      .getOne()
    const warnThresholdCents = Number(plan?.warnThresholdCents ?? 0)
    if (warnThresholdCents > 0 && balance <= warnThresholdCents) {
      return 'low_balance'
    }

    return Number(wallet.freeBalanceCents) > 0 ? 'trial' : 'active'
  }

  private usageViewFromRatedPeriods(periods: RatedPeriod[], from: Date, to: Date): OrganizationUsageView {
    const total = periods.reduce((sum, period) => sum + Number(period.ratedCents), 0)
    const totals = periods.reduce(
      (acc, period) => {
        acc.cpuSeconds = acc.cpuSeconds.plus(period.usageTotals.cpuSeconds)
        acc.memGibSeconds = acc.memGibSeconds.plus(period.usageTotals.memGibSeconds)
        acc.diskGibSeconds = acc.diskGibSeconds.plus(period.usageTotals.diskGibSeconds)
        acc.gpuSeconds = acc.gpuSeconds.plus(period.usageTotals.gpuSeconds)
        acc.cpuAmount = acc.cpuAmount.plus(
          new Decimal(period.usageTotals.cpuSeconds).mul(period.unitRates.cpuRateCentsPerSec),
        )
        acc.memAmount = acc.memAmount.plus(
          new Decimal(period.usageTotals.memGibSeconds).mul(period.unitRates.memRateCentsPerSec),
        )
        acc.diskAmount = acc.diskAmount.plus(
          new Decimal(period.usageTotals.diskGibSeconds).mul(period.unitRates.diskRateCentsPerSec),
        )
        acc.gpuAmount = acc.gpuAmount.plus(
          new Decimal(period.usageTotals.gpuSeconds).mul(period.unitRates.gpuRateCentsPerSec),
        )
        return acc
      },
      {
        cpuSeconds: new Decimal(0),
        memGibSeconds: new Decimal(0),
        diskGibSeconds: new Decimal(0),
        gpuSeconds: new Decimal(0),
        cpuAmount: new Decimal(0),
        memAmount: new Decimal(0),
        diskAmount: new Decimal(0),
        gpuAmount: new Decimal(0),
      },
    )

    return {
      from,
      to,
      issuingDate: to.toISOString(),
      amountCents: total,
      totalAmountCents: total,
      taxesAmountCents: 0,
      usageCharges: [
        {
          units: totals.cpuSeconds.toString(),
          eventsCount: periods.length,
          amountCents: totals.cpuAmount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
          billableMetric: 'cpu_usage',
        },
        {
          units: totals.memGibSeconds.toString(),
          eventsCount: periods.length,
          amountCents: totals.memAmount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
          billableMetric: 'ram_usage',
        },
        {
          units: totals.diskGibSeconds.toString(),
          eventsCount: periods.length,
          amountCents: totals.diskAmount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
          billableMetric: 'disk_usage',
        },
        {
          units: totals.gpuSeconds.toString(),
          eventsCount: periods.length,
          amountCents: totals.gpuAmount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
          billableMetric: 'gpu_usage',
        },
      ],
    }
  }

  private automaticTopUpView(wallet: Wallet): AutomaticTopUpInput | undefined {
    if (!wallet.automaticTopUpThresholdCents || !wallet.automaticTopUpTargetCents) {
      return undefined
    }

    return {
      thresholdAmount: Number(wallet.automaticTopUpThresholdCents) / 100,
      targetAmount: Number(wallet.automaticTopUpTargetCents) / 100,
    }
  }

  private availableBalanceCents(wallet: Wallet): number {
    return Number(wallet.freeBalanceCents) + Number(wallet.paidBalanceCents)
  }

  private dollarsToCents(dollars: number): number {
    return new Decimal(dollars).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
  }

  private invoiceView(topUp: TopUpRecord, sequentialId: number): InvoiceView {
    const amountCents = Number(topUp.amountCents)
    const issuingDate = (topUp.createdAt ?? new Date(0)).toISOString()

    return {
      currency: 'usd',
      id: topUp.id,
      issuingDate,
      number: `TOPUP-${topUp.id}`,
      paymentDueDate: issuingDate,
      paymentOverdue: false,
      paymentStatus: this.invoicePaymentStatus(topUp),
      sequentialId,
      status: this.invoiceStatus(topUp),
      totalAmountCents: amountCents,
      totalDueAmountCents: topUp.status === 'pending' ? amountCents : 0,
      type: 'one_off',
    }
  }

  private invoicePaymentStatus(topUp: TopUpRecord): InvoiceView['paymentStatus'] {
    if (topUp.status === 'succeeded') {
      return 'succeeded'
    }
    if (topUp.status === 'pending') {
      return 'pending'
    }
    return 'failed'
  }

  private invoiceStatus(topUp: TopUpRecord): InvoiceView['status'] {
    if (topUp.status === 'succeeded') {
      return 'finalized'
    }
    if (topUp.status === 'voided') {
      return 'voided'
    }
    return topUp.status
  }

  private createdTime(topUp: TopUpRecord): number {
    return (topUp.createdAt ?? new Date(0)).getTime()
  }
}
