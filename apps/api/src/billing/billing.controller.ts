/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOAuth2, ApiTags } from '@nestjs/swagger'
import { CombinedAuthGuard } from '../auth/combined-auth.guard'
import { AuthenticatedRateLimitGuard } from '../common/guards/authenticated-rate-limit.guard'
import { RequiredOrganizationMemberRole } from '../organization/decorators/required-organization-member-role.decorator'
import { OrganizationMemberRole } from '../organization/enums/organization-member-role.enum'
import { OrganizationActionGuard } from '../organization/guards/organization-action.guard'
import { AutomaticTopUpInput, WalletService } from './wallet.service'

interface WalletTopUpRequest {
  amountCents: number
}

@ApiTags('billing')
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
@UseGuards(CombinedAuthGuard, AuthenticatedRateLimitGuard)
@Controller()
export class BillingController {
  constructor(private readonly walletService: WalletService) {}

  @Get('/organization/:organizationId/wallet')
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  getOrganizationWallet(@Param('organizationId') organizationId: string) {
    return this.walletService.getWalletView(organizationId)
  }

  @Put('/organization/:organizationId/wallet/automatic-top-up')
  @HttpCode(200)
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  setAutomaticTopUp(
    @Param('organizationId') organizationId: string,
    @Body() automaticTopUp?: AutomaticTopUpInput,
  ): Promise<void> {
    return this.walletService.setAutomaticTopUp(organizationId, automaticTopUp)
  }

  @Post('/organization/:organizationId/wallet/top-up')
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  topUpWallet(@Param('organizationId') organizationId: string, @Body() body: WalletTopUpRequest) {
    return this.walletService.createTopUp(organizationId, body.amountCents)
  }

  @Get('/organization/:organizationId/usage')
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  getOrganizationUsage(@Param('organizationId') organizationId: string) {
    return this.walletService.getOrganizationUsage(organizationId)
  }

  @Get('/organization/:organizationId/usage/past')
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  getPastOrganizationUsage(@Param('organizationId') organizationId: string, @Query('periods') periods?: number) {
    return this.walletService.getPastOrganizationUsage(organizationId, Number(periods || 12))
  }

  @Get('/organization/:organizationId/tier')
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  getOrganizationTier(@Param('organizationId') organizationId: string) {
    return this.walletService.getOrganizationTier(organizationId)
  }

  @Get('/tier')
  listTiers() {
    return this.walletService.listTiers()
  }

  @Get('/organization/:organizationId/invoices')
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  listOrganizationInvoices(
    @Param('organizationId') organizationId: string,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
  ) {
    return this.walletService.listInvoices(organizationId, Number(page || 1), Number(perPage || 20))
  }

  @Post('/organization/:organizationId/invoices/:invoiceId/payment-url')
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  createInvoicePaymentUrl(@Param('organizationId') organizationId: string, @Param('invoiceId') invoiceId: string) {
    return this.walletService.createInvoicePaymentUrl(organizationId, invoiceId)
  }

  @Post('/organization/:organizationId/invoices/:invoiceId/void')
  @HttpCode(200)
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  voidInvoice(@Param('organizationId') organizationId: string, @Param('invoiceId') invoiceId: string): Promise<void> {
    return this.walletService.voidInvoice(organizationId, invoiceId)
  }

  @Get('/organization/:organizationId/portal-url')
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  getOrganizationBillingPortalUrl(@Param('organizationId') organizationId: string) {
    return this.walletService.getPortalUrl(organizationId)
  }

  @Get('/organization/:organizationId/checkout-url')
  @UseGuards(OrganizationActionGuard)
  @RequiredOrganizationMemberRole(OrganizationMemberRole.OWNER)
  getOrganizationCheckoutUrl(@Param('organizationId') organizationId: string) {
    return this.walletService.getCheckoutUrl(organizationId)
  }
}
