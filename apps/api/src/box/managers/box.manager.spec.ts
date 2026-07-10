/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BoxManager } from './box.manager'

describe('BoxManager scheduler queries', () => {
  it('selects a stable alias before ordering paginated auto-delete candidates', async () => {
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }
    const lockProvider = {
      lock: jest.fn().mockResolvedValue(true),
      unlock: jest.fn().mockResolvedValue(undefined),
    }
    const service = new BoxManager(
      { createQueryBuilder: jest.fn(() => queryBuilder) } as never,
      { findAllReady: jest.fn().mockResolvedValue([{ id: 'runner-1' }]) } as never,
      lockProvider as never,
      {} as never,
      {} as never,
      {} as never,
    )

    await service.autoDeleteCheck()

    expect(queryBuilder.addSelect).toHaveBeenCalledWith('activity."lastActivityAt"', 'activity_last_activity_at')
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('activity_last_activity_at', 'ASC')
    expect(lockProvider.unlock).toHaveBeenCalledWith('auto-delete-check-worker-selected')
  })
})
