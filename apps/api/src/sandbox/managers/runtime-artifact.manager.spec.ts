/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BoxTemplate } from '../entities/box-template.entity'
import { BoxTemplateState } from '../enums/box-template-state.enum'
import { RuntimeArtifactManager } from './runtime-artifact.manager'

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
  validate: jest.fn(() => true),
}))

const DONT_SYNC_AGAIN = 'dont-sync-again'

function createManager() {
  const boxTemplateRepository = {
    save: jest.fn(async (template: BoxTemplate) => template),
    update: jest.fn(async () => ({ affected: 1 })),
  }

  const manager = new RuntimeArtifactManager(
    {} as any, // redis
    boxTemplateRepository as any,
    {} as any, // runnerArtifactCacheRepository
    {} as any, // runnerRepository
    {} as any, // sandboxRepository
    {} as any, // runnerService
    {} as any, // dockerRegistryService
    {} as any, // runnerAdapterFactory
    {} as any, // redisLockProvider
    {} as any, // organizationService
    {} as any, // boxTemplateService
  )

  return { manager, boxTemplateRepository }
}

describe('RuntimeArtifactManager.handleBoxTemplateStatePending', () => {
  it('activates a general system template using the ghcr image ref as the artifact ref', async () => {
    const { manager, boxTemplateRepository } = createManager()

    const imageName = 'ghcr.io/boxlite-ai/boxlite/base:20260605-p0'
    const template = {
      id: 'base-id',
      name: 'boxlite/base',
      imageName,
      general: true,
      artifactRef: undefined,
      state: BoxTemplateState.PENDING,
    } as unknown as BoxTemplate

    const syncState = await manager.handleBoxTemplateStatePending(template)

    expect(syncState).toBe(DONT_SYNC_AGAIN)

    // The artifact ref must be the ghcr image ref verbatim, not an internal
    // registry.boxlite/.../boxlite-<sha>:boxlite ref.
    const savedTemplate = boxTemplateRepository.save.mock.calls[0][0]
    expect(savedTemplate.artifactRef).toBe(imageName)
    expect(savedTemplate.artifactRef).not.toMatch(/boxlite-[a-f0-9]{64}:boxlite$/)

    // The template transitions straight to ACTIVE without entering PULLING.
    expect(boxTemplateRepository.update).toHaveBeenCalledWith(
      { id: 'base-id' },
      expect.objectContaining({ state: BoxTemplateState.ACTIVE }),
    )
  })

  it('leaves an already-set ghcr artifact ref untouched while still activating', async () => {
    const { manager, boxTemplateRepository } = createManager()

    const imageName = 'ghcr.io/boxlite-ai/boxlite/python:20260605-p0'
    const template = {
      id: 'python-id',
      name: 'boxlite/python',
      imageName,
      general: true,
      artifactRef: imageName,
      state: BoxTemplateState.PENDING,
    } as unknown as BoxTemplate

    await manager.handleBoxTemplateStatePending(template)

    // No re-save needed when the ref is already the ghcr image ref.
    expect(boxTemplateRepository.save).not.toHaveBeenCalled()
    expect(boxTemplateRepository.update).toHaveBeenCalledWith(
      { id: 'python-id' },
      expect.objectContaining({ state: BoxTemplateState.ACTIVE }),
    )
  })
})
