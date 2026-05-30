/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Snapshot } from '../entities/snapshot.entity'
import { SnapshotRegion } from '../entities/snapshot-region.entity'
import { SnapshotState } from '../enums/snapshot-state.enum'
import { SnapshotEvents } from '../constants/snapshot-events'
import { SnapshotService } from './snapshot.service'

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
  validate: jest.fn(() => true),
}))

function createService({
  snapshots = [],
  availableRegionIds = ['us'],
  defaultSnapshot = 'ubuntu:24.04',
}: {
  snapshots?: Snapshot[]
  availableRegionIds?: string[]
  defaultSnapshot?: string
}) {
  const snapshotRepository = {
    find: jest.fn(async (options?: { where?: Partial<Snapshot> }) => {
      const where = options?.where
      if (!where) return snapshots

      return snapshots.filter((snapshot) =>
        Object.entries(where).every(([key, value]) => snapshot[key as keyof Snapshot] === value),
      )
    }),
    findOne: jest.fn(),
    save: jest.fn(async (snapshot: Snapshot) => snapshot),
  }
  const snapshotRegionRepository = {
    save: jest.fn(async (snapshotRegion) => snapshotRegion),
  }
  const organizationService = {
    listAvailableRegions: jest.fn().mockResolvedValue(availableRegionIds.map((id) => ({ id }))),
  }
  const configService = {
    get: jest.fn((key: string) => (key === 'defaultSnapshot' ? defaultSnapshot : undefined)),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'defaultRegion.id') return 'us'
      if (key === 'defaultSnapshot') return defaultSnapshot
      throw new Error(`Unexpected config key: ${key}`)
    }),
  }
  const eventEmitter = {
    emit: jest.fn(),
  }

  const service = new SnapshotService(
    {} as any,
    snapshotRepository as any,
    {} as any,
    {} as any,
    {} as any,
    snapshotRegionRepository as any,
    organizationService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    eventEmitter as any,
    configService as any,
  )

  return { service, snapshotRepository, snapshotRegionRepository, organizationService, eventEmitter }
}

function snapshot(partial: Partial<Snapshot>): Snapshot {
  const id = partial.id ?? 'snapshot-id'

  return {
    id,
    name: partial.name ?? 'ubuntu:24.04',
    imageName: partial.imageName ?? partial.name ?? 'ubuntu:24.04',
    general: partial.general ?? true,
    hideFromUsers: partial.hideFromUsers ?? false,
    state: partial.state ?? SnapshotState.ACTIVE,
    cpu: partial.cpu ?? 1,
    gpu: partial.gpu ?? 0,
    mem: partial.mem ?? 1,
    disk: partial.disk ?? 3,
    ref: partial.ref ?? partial.imageName ?? partial.name ?? 'ubuntu:24.04',
    snapshotRegions: partial.snapshotRegions ?? [snapshotRegion(id, 'us')],
  } as Snapshot
}

function snapshotRegion(snapshotId: string, regionId: string): SnapshotRegion {
  return { snapshotId, regionId } as SnapshotRegion
}

describe('SnapshotService system environments', () => {
  it('returns only visible active MVP environments that are available to the organization', async () => {
    const ubuntu = snapshot({ id: 'ubuntu-id', name: 'ubuntu:24.04' })
    const alpine = snapshot({
      id: 'alpine-id',
      name: 'alpine:3.23',
      snapshotRegions: [snapshotRegion('alpine-id', 'eu')],
    })
    const node = snapshot({ id: 'node-id', name: 'node:22', imageName: 'node:22' })
    const hiddenDebian = snapshot({ id: 'debian-id', name: 'debian:13-slim', hideFromUsers: true })
    const unusableDebian = snapshot({ id: 'unusable-debian-id', name: 'debian:13-slim', ref: '' })

    const { service, snapshotRepository, organizationService } = createService({
      snapshots: [alpine, node, hiddenDebian, unusableDebian, ubuntu],
      availableRegionIds: ['us'],
    })

    const environments = await service.getSystemEnvironments('org-id')

    expect(snapshotRepository.find).toHaveBeenCalledWith({
      where: {
        general: true,
        hideFromUsers: false,
        state: SnapshotState.ACTIVE,
      },
      relations: ['snapshotRegions'],
      order: {
        name: 'ASC',
      },
    })
    expect(organizationService.listAvailableRegions).toHaveBeenCalledWith('org-id')
    expect(environments.map((environment) => environment.name)).toEqual(['ubuntu:24.04'])
  })

  it('sorts available environments by configured default first, then MVP order', async () => {
    const { service } = createService({
      snapshots: [
        snapshot({ id: 'alpine-id', name: 'alpine:3.23' }),
        snapshot({ id: 'debian-id', name: 'debian:13-slim' }),
        snapshot({ id: 'ubuntu-id', name: 'ubuntu:24.04' }),
      ],
      defaultSnapshot: 'debian:13-slim',
    })

    const environments = await service.getSystemEnvironments('org-id')

    expect(environments.map((environment) => environment.name)).toEqual([
      'debian:13-slim',
      'ubuntu:24.04',
      'alpine:3.23',
    ])
  })

  it('repairs an existing hidden system environment and attaches the default region', async () => {
    const existingSnapshot = snapshot({
      id: 'ubuntu-id',
      name: 'ubuntu:24.04',
      imageName: 'old/ubuntu:24.04',
      hideFromUsers: true,
      snapshotRegions: [],
    })

    const { service, snapshotRepository, snapshotRegionRepository } = createService({})
    snapshotRepository.findOne.mockResolvedValue(existingSnapshot)

    await service.ensureSystemEnvironment({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'ubuntu:24.04',
      imageName: 'ubuntu:24.04',
      displayName: 'Ubuntu 24.04 LTS',
      description: 'General-purpose Linux environment',
    })

    expect(snapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageName: 'ubuntu:24.04',
        hideFromUsers: false,
      }),
    )
    expect(snapshotRegionRepository.save).toHaveBeenCalledWith({
      snapshotId: 'ubuntu-id',
      regionId: 'us',
    })
  })

  it('creates missing system environments as general snapshots', async () => {
    const { service, snapshotRepository } = createService({})
    const createdSnapshot = snapshot({ id: 'debian-id', name: 'debian:13-slim' })
    snapshotRepository.findOne.mockResolvedValue(null)
    const createFromPull = jest.spyOn(service, 'createFromPull').mockResolvedValue(createdSnapshot)

    await service.ensureSystemEnvironment({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'debian:13-slim',
      imageName: 'debian:13-slim',
      displayName: 'Debian 13 slim',
      description: 'Small Debian-based environment',
    })

    expect(createFromPull).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-org-id' }),
      {
        name: 'debian:13-slim',
        imageName: 'debian:13-slim',
      },
      true,
    )
  })

  it('reactivates failed system environments during startup repair', async () => {
    const existingSnapshot = snapshot({
      id: 'alpine-id',
      name: 'alpine:3.23',
      state: SnapshotState.ERROR,
      errorReason: 'Previous pull failed',
      snapshotRegions: [snapshotRegion('alpine-id', 'us')],
    })

    const { service, snapshotRepository, eventEmitter } = createService({})
    snapshotRepository.findOne.mockResolvedValue(existingSnapshot)

    await service.ensureSystemEnvironment({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'alpine:3.23',
      imageName: 'alpine:3.23',
      displayName: 'Alpine 3.23',
      description: 'Minimal Linux environment',
    })

    expect(snapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        state: SnapshotState.PENDING,
        errorReason: undefined,
      }),
    )
    expect(eventEmitter.emit).toHaveBeenCalledWith(SnapshotEvents.ACTIVATED, expect.any(Object))
  })

  it('reactivates active system environments that are missing a usable snapshot ref', async () => {
    const existingSnapshot = snapshot({
      id: 'ubuntu-id',
      name: 'ubuntu:24.04',
      state: SnapshotState.ACTIVE,
      ref: '',
      snapshotRegions: [snapshotRegion('ubuntu-id', 'us')],
    })

    const { service, snapshotRepository, eventEmitter } = createService({})
    snapshotRepository.findOne.mockResolvedValue(existingSnapshot)

    await service.ensureSystemEnvironment({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'ubuntu:24.04',
      imageName: 'ubuntu:24.04',
      displayName: 'Ubuntu 24.04 LTS',
      description: 'General-purpose Linux environment',
    })

    expect(snapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        state: SnapshotState.PENDING,
        errorReason: undefined,
      }),
    )
    expect(eventEmitter.emit).toHaveBeenCalledWith(SnapshotEvents.ACTIVATED, expect.any(Object))
  })
})
