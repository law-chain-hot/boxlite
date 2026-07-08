/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BillingController } from './billing.controller'
import { WalletService } from './wallet.service'

describe('BillingController', () => {
  const walletService = {
    getWalletView: jest.fn(),
    setAutomaticTopUp: jest.fn(),
    createTopUp: jest.fn(),
    getOrganizationUsage: jest.fn(),
    getPastOrganizationUsage: jest.fn(),
    getOrganizationTier: jest.fn(),
    listTiers: jest.fn(),
    listInvoices: jest.fn(),
    createInvoicePaymentUrl: jest.fn(),
    voidInvoice: jest.fn(),
    getPortalUrl: jest.fn(),
    getCheckoutUrl: jest.fn(),
  }
  let controller: BillingController

  beforeEach(() => {
    jest.resetAllMocks()
    controller = new BillingController(walletService as unknown as WalletService)
  })

  it('returns the dashboard wallet contract', async () => {
    walletService.getWalletView.mockResolvedValue({
      balanceCents: 10000,
      ongoingBalanceCents: 9000,
      name: 'org-1',
      creditCardConnected: false,
      automaticTopUp: undefined,
      hasFailedOrPendingInvoice: false,
      freeBalanceCents: 9000,
      paidBalanceCents: 0,
      billingStatus: 'trial',
    })

    await expect(controller.getOrganizationWallet('org-1')).resolves.toMatchObject({
      balanceCents: 10000,
      ongoingBalanceCents: 9000,
      name: 'org-1',
      creditCardConnected: false,
      hasFailedOrPendingInvoice: false,
    })
    expect(walletService.getWalletView).toHaveBeenCalledWith('org-1')
  })

  it('delegates automatic top-up, top-up, usage, tiers, invoices, and placeholder URLs', async () => {
    walletService.setAutomaticTopUp.mockResolvedValue(undefined)
    walletService.createTopUp.mockResolvedValue({ url: 'http://localhost/billing/top-up/top-up-1' })
    walletService.getOrganizationUsage.mockResolvedValue({ usageCharges: [] })
    walletService.getPastOrganizationUsage.mockResolvedValue([])
    walletService.getOrganizationTier.mockResolvedValue({ tier: 1 })
    walletService.listTiers.mockResolvedValue([])
    walletService.listInvoices.mockResolvedValue({ items: [], totalItems: 0, totalPages: 0 })
    walletService.createInvoicePaymentUrl.mockResolvedValue({ url: 'http://localhost/billing/invoice/inv-1' })
    walletService.getPortalUrl.mockResolvedValue('http://localhost/billing/portal/org-1')
    walletService.getCheckoutUrl.mockResolvedValue('http://localhost/billing/checkout/org-1')

    await expect(controller.setAutomaticTopUp('org-1', { thresholdAmount: 10, targetAmount: 30 })).resolves.toBeUndefined()
    await expect(controller.topUpWallet('org-1', { amountCents: 2500 })).resolves.toEqual({
      url: 'http://localhost/billing/top-up/top-up-1',
    })
    await expect(controller.getOrganizationUsage('org-1')).resolves.toEqual({ usageCharges: [] })
    await expect(controller.getPastOrganizationUsage('org-1', 6)).resolves.toEqual([])
    await expect(controller.getOrganizationTier('org-1')).resolves.toEqual({ tier: 1 })
    await expect(controller.listTiers()).resolves.toEqual([])
    await expect(controller.listOrganizationInvoices('org-1', 1, 20)).resolves.toEqual({
      items: [],
      totalItems: 0,
      totalPages: 0,
    })
    await expect(controller.createInvoicePaymentUrl('org-1', 'inv-1')).resolves.toEqual({
      url: 'http://localhost/billing/invoice/inv-1',
    })
    expect(controller.voidInvoice('org-1', 'inv-1')).toBeUndefined()
    await expect(controller.getOrganizationBillingPortalUrl('org-1')).resolves.toBe('http://localhost/billing/portal/org-1')
    await expect(controller.getOrganizationCheckoutUrl('org-1')).resolves.toBe('http://localhost/billing/checkout/org-1')
  })
})
