/*
 * Copyright BoxLite AI, 2026
 * SPDX-License-Identifier: AGPL-3.0
 */

jest.mock('../../usage/usage-period-transition', () => ({
  applyUsagePeriodTransition: jest.fn(),
}))

import { Box } from '../entities/box.entity'
import { BoxDesiredState } from '../enums/box-desired-state.enum'
import { BoxState } from '../enums/box-state.enum'
import { applyUsagePeriodTransition } from '../../usage/usage-period-transition'
import { BoxRepository } from './box.repository'

const applyUsagePeriodTransitionMock = jest.mocked(applyUsagePeriodTransition)

function makeBox(state: BoxState, desiredState: BoxDesiredState): Box {
  const box = new Box('us', 'box-1')
  box.id = 'boxboxbox123'
  box.organizationId = '00000000-0000-0000-0000-000000000001'
  box.osUser = 'box'
  box.state = state
  box.desiredState = desiredState
  box.pending = false
  box.cpu = 2
  box.mem = 4
  box.disk = 10
  box.gpu = 0
  return box
}

function makeRepository() {
  const entityManager = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    upsert: jest.fn().mockResolvedValue(undefined),
  }
  const manager = {}
  const repository = {
    manager,
    update: jest.fn().mockResolvedValue(undefined),
    findOneBy: jest.fn(),
  }
  const dataSource = {
    getRepository: jest.fn(() => repository),
    transaction: jest.fn(async (cb: (em: typeof entityManager) => Promise<unknown>) => cb(entityManager)),
  }
  const eventEmitter = { emit: jest.fn() }
  const cache = {
    invalidate: jest.fn(),
    invalidateOrgId: jest.fn(),
  }
  const repo = new BoxRepository(dataSource as never, eventEmitter as never, cache as never)

  return { repo, dataSource, entityManager, eventEmitter, repository }
}

describe('BoxRepository usage period coupling', () => {
  beforeEach(() => {
    applyUsagePeriodTransitionMock.mockReset()
    applyUsagePeriodTransitionMock.mockResolvedValue(undefined)
  })

  it('updates usage periods inside the same transaction as a usage-relevant box update', async () => {
    const { repo, dataSource, entityManager, eventEmitter } = makeRepository()
    const box = makeBox(BoxState.STOPPED, BoxDesiredState.STOPPED)

    const updated = await repo.update(box.id, {
      entity: box,
      updateData: { state: BoxState.STARTED, desiredState: BoxDesiredState.STARTED },
    })

    expect(dataSource.transaction).toHaveBeenCalledTimes(1)
    expect(entityManager.update).toHaveBeenCalledTimes(1)
    expect(entityManager.upsert).toHaveBeenCalledTimes(1)
    expect(applyUsagePeriodTransitionMock).toHaveBeenCalledWith(
      entityManager,
      updated,
      updated.updatedAt,
      expect.anything(),
    )
    expect(applyUsagePeriodTransitionMock.mock.invocationCallOrder[0]).toBeLessThan(
      eventEmitter.emit.mock.invocationCallOrder[0],
    )
  })

  it('does not emit lifecycle events when usage period synchronization fails', async () => {
    const { repo, eventEmitter } = makeRepository()
    const box = makeBox(BoxState.STOPPED, BoxDesiredState.STOPPED)
    applyUsagePeriodTransitionMock.mockRejectedValueOnce(new Error('usage period write failed'))

    await expect(
      repo.update(box.id, {
        entity: box,
        updateData: { state: BoxState.STARTED, desiredState: BoxDesiredState.STARTED },
      }),
    ).rejects.toThrow('usage period write failed')

    expect(eventEmitter.emit).not.toHaveBeenCalled()
  })
})
