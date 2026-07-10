/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { SettlementService } from './settlement.service'

describe('SettlementService', () => {
  it('rates closed periods before debiting wallets in the same sweep', async () => {
    const ratingService = {
      rateClosedPeriods: jest.fn().mockResolvedValue({ rated: 2, skipped: 0 }),
    }
    const walletService = {
      debitRatedPeriods: jest.fn().mockResolvedValue({ debited: 2, skipped: 0 }),
    }
    const service = new SettlementService(ratingService as never, walletService as never)

    await expect(service.settleClosedPeriods()).resolves.toEqual({
      rated: 2,
      ratingSkipped: 0,
      debited: 2,
      debitSkipped: 0,
    })
    expect(ratingService.rateClosedPeriods).toHaveBeenCalledTimes(1)
    expect(walletService.debitRatedPeriods).toHaveBeenCalledTimes(1)
    expect(ratingService.rateClosedPeriods.mock.invocationCallOrder[0]).toBeLessThan(
      walletService.debitRatedPeriods.mock.invocationCallOrder[0],
    )
  })

  it('does not debit when rating fails', async () => {
    const ratingService = {
      rateClosedPeriods: jest.fn().mockRejectedValue(new Error('rating unavailable')),
    }
    const walletService = {
      debitRatedPeriods: jest.fn(),
    }
    const service = new SettlementService(ratingService as never, walletService as never)

    await expect(service.settleClosedPeriods()).rejects.toThrow('rating unavailable')
    expect(walletService.debitRatedPeriods).not.toHaveBeenCalled()
  })
})
