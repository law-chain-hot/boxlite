/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UsagePeriodArchive } from '../usage/entities/usage-period-archive.entity'
import { PricingPlan } from './entities/pricing-plan.entity'
import { RatedPeriod } from './entities/rated-period.entity'
import { TopUpRecord } from './entities/top-up-record.entity'
import { WalletTransaction } from './entities/wallet-transaction.entity'
import { Wallet } from './entities/wallet.entity'
import { RatingService } from './rating/rating.service'
import { WalletService } from './wallet.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([RatedPeriod, PricingPlan, UsagePeriodArchive, Wallet, WalletTransaction, TopUpRecord]),
  ],
  providers: [RatingService, WalletService],
  exports: [RatingService, WalletService],
})
export class BillingModule {}
