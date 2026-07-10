/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OrganizationActionGuard } from '../organization/guards/organization-action.guard'
import { OrganizationModule } from '../organization/organization.module'
import { UsagePeriodArchive } from '../usage/entities/usage-period-archive.entity'
import { BillingController } from './billing.controller'
import { PricingPlan } from './entities/pricing-plan.entity'
import { RatedPeriod } from './entities/rated-period.entity'
import { TopUpRecord } from './entities/top-up-record.entity'
import { WalletTransaction } from './entities/wallet-transaction.entity'
import { Wallet } from './entities/wallet.entity'
import { RatingService } from './rating/rating.service'
import { SettlementService } from './settlement.service'
import { WalletService } from './wallet.service'

@Module({
  imports: [
    OrganizationModule,
    TypeOrmModule.forFeature([RatedPeriod, PricingPlan, UsagePeriodArchive, Wallet, WalletTransaction, TopUpRecord]),
  ],
  controllers: [BillingController],
  providers: [RatingService, WalletService, SettlementService, OrganizationActionGuard],
  exports: [RatingService, WalletService],
})
export class BillingModule {}
