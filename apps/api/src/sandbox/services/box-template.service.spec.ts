/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { BoxTemplate } from '../entities/box-template.entity'
import { BoxTemplateState } from '../enums/box-template-state.enum'
import { BoxTemplateEvents } from '../constants/box-template-events'
import { BoxTemplateService } from './box-template.service'

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
  validate: jest.fn(() => true),
}))

function createService({
  templates = [],
  defaultTemplate = 'boxlite/base',
}: {
  templates?: BoxTemplate[]
  defaultTemplate?: string
}) {
  const boxTemplateRepository = {
    find: jest.fn(async (options?: { where?: Partial<BoxTemplate> }) => {
      const where = options?.where
      if (!where) return templates

      return templates.filter((template) =>
        Object.entries(where).every(([key, value]) => template[key as keyof BoxTemplate] === value),
      )
    }),
    findOne: jest.fn(),
    save: jest.fn(async (template: BoxTemplate) => template),
  }
  const configService = {
    get: jest.fn((key: string) => (key === 'defaultTemplate' ? defaultTemplate : undefined)),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'defaultRegion.id') return 'us'
      if (key === 'defaultTemplate') return defaultTemplate
      throw new Error(`Unexpected config key: ${key}`)
    }),
  }
  const eventEmitter = {
    emit: jest.fn(),
  }

  const service = new BoxTemplateService(
    boxTemplateRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    eventEmitter as any,
    configService as any,
  )

  return {
    service,
    boxTemplateRepository,
    eventEmitter,
  }
}

function template(partial: Partial<BoxTemplate>): BoxTemplate {
  const id = partial.id ?? 'template-id'

  return {
    id,
    name: partial.name ?? 'boxlite/base',
    imageName: partial.imageName ?? '',
    general: partial.general ?? true,
    hideFromUsers: partial.hideFromUsers ?? false,
    state: partial.state ?? BoxTemplateState.ACTIVE,
    cpu: partial.cpu ?? 1,
    gpu: partial.gpu ?? 0,
    mem: partial.mem ?? 1,
    disk: partial.disk ?? 3,
    artifactRef: partial.artifactRef ?? partial.imageName ?? partial.name ?? 'boxlite/base',
    entrypoint: partial.entrypoint,
    initialRunnerId: partial.initialRunnerId,
    size: partial.size,
  } as BoxTemplate
}

describe('BoxTemplateService system templates', () => {
  it('returns only visible active agent-ready templates with a usable artifact ref', async () => {
    const base = template({ id: 'base-id', name: 'boxlite/base' })
    const node = template({ id: 'node-id', name: 'boxlite/node' })
    const rawNode = template({ id: 'raw-node-id', name: 'node:22', imageName: 'node:22' })
    const hiddenPython = template({ id: 'python-id', name: 'boxlite/python', hideFromUsers: true })
    const unusablePython = template({ id: 'unusable-python-id', name: 'boxlite/python', artifactRef: '' })

    const { service, boxTemplateRepository } = createService({
      templates: [node, rawNode, hiddenPython, unusablePython, base],
    })

    const templates = await service.getSystemTemplates('org-id')

    expect(boxTemplateRepository.find).toHaveBeenCalledWith({
      where: {
        general: true,
        hideFromUsers: false,
        state: BoxTemplateState.ACTIVE,
      },
      order: {
        name: 'ASC',
      },
    })
    // Templates are region-agnostic: rawNode (not in the agent catalog) and the
    // unusable/hidden python entries are filtered out, but boxlite/node is no
    // longer dropped for a region mismatch.
    expect(templates.map((template) => template.name)).toEqual(['boxlite/base', 'boxlite/node'])
  })

  it('sorts available templates by configured default first, then agent-ready order', async () => {
    const { service } = createService({
      templates: [
        template({ id: 'node-id', name: 'boxlite/node' }),
        template({ id: 'python-id', name: 'boxlite/python' }),
        template({ id: 'base-id', name: 'boxlite/base' }),
      ],
      defaultTemplate: 'boxlite/python',
    })

    const templates = await service.getSystemTemplates('org-id')

    expect(templates.map((template) => template.name)).toEqual(['boxlite/python', 'boxlite/base', 'boxlite/node'])
  })

  it('repairs an existing hidden system template by unhiding it and refreshing its image', async () => {
    const existingTemplate = template({
      id: 'base-id',
      name: 'boxlite/base',
      imageName: 'old/runtime-base:20260601',
      hideFromUsers: true,
    })

    const { service, boxTemplateRepository } = createService({})
    boxTemplateRepository.findOne.mockResolvedValue(existingTemplate)

    await service.ensureSystemTemplate({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'boxlite/base',
      imageName: 'registry.local/boxlite/base:20260605-p0',
      displayName: 'BoxLite Base',
      description: 'General agent runtime',
      capabilities: ['curl'],
    })

    expect(boxTemplateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageName: 'registry.local/boxlite/base:20260605-p0',
        hideFromUsers: false,
      }),
    )
  })

  it('creates missing system templates from prebuilt images as general templates', async () => {
    const { service, boxTemplateRepository } = createService({})
    const createdTemplate = template({ id: 'python-id', name: 'boxlite/python' })
    boxTemplateRepository.findOne.mockResolvedValue(null)
    const createFromPull = jest.spyOn(service, 'createFromPull').mockResolvedValue(createdTemplate)

    await service.ensureSystemTemplate({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'boxlite/python',
      imageName: 'registry.local/boxlite/python:20260605-p0',
      displayName: 'BoxLite Python',
      description: 'Python runtime',
      capabilities: ['python', 'pip'],
    })

    expect(createFromPull).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin-org-id' }),
      {
        name: 'boxlite/python',
        imageName: 'registry.local/boxlite/python:20260605-p0',
      },
      true,
    )
  })

  it('migrates existing system templates with a stale image name to a pending prebuilt image ref', async () => {
    const existingTemplate = template({
      id: 'base-id',
      name: 'boxlite/base',
      imageName: '',
      artifactRef: 'registry.internal/boxlite/boxlite-old-build:boxlite',
      entrypoint: ['sleep', 'infinity'],
      state: BoxTemplateState.ACTIVE,
      initialRunnerId: 'runner-id',
      size: 1,
    })

    const { service, boxTemplateRepository } = createService({})
    boxTemplateRepository.findOne.mockResolvedValue(existingTemplate)

    await service.ensureSystemTemplate({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'boxlite/base',
      imageName: 'registry.local/boxlite/base:20260605-p0',
      displayName: 'BoxLite Base',
      description: 'General agent runtime',
      capabilities: ['curl'],
    })

    expect(boxTemplateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageName: 'registry.local/boxlite/base:20260605-p0',
        artifactRef: null,
        entrypoint: null,
        state: BoxTemplateState.PENDING,
        initialRunnerId: null,
        size: null,
      }),
    )
  })

  it('clears stale entrypoint overrides from existing system templates', async () => {
    const existingTemplate = template({
      id: 'base-id',
      name: 'boxlite/base',
      imageName: 'registry.local/boxlite/base:20260605-p0',
      artifactRef: 'registry.internal/boxlite/boxlite-base:boxlite',
      entrypoint: ['sleep', 'infinity'],
      state: BoxTemplateState.ACTIVE,
    })

    const { service, boxTemplateRepository } = createService({})
    boxTemplateRepository.findOne.mockResolvedValue(existingTemplate)

    await service.ensureSystemTemplate({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'boxlite/base',
      imageName: 'registry.local/boxlite/base:20260605-p0',
      displayName: 'BoxLite Base',
      description: 'General agent runtime',
      capabilities: ['curl'],
    })

    expect(boxTemplateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: null,
      }),
    )
  })

  it('hides legacy general OS templates after the agent-ready catalog is installed', async () => {
    const ubuntuTemplate = template({
      id: 'ubuntu-id',
      name: 'ubuntu:24.04',
      imageName: 'ubuntu:24.04',
      hideFromUsers: false,
    })
    const debianTemplate = template({
      id: 'debian-id',
      name: 'debian:13-slim',
      imageName: 'debian:13-slim',
      hideFromUsers: false,
    })

    const { service, boxTemplateRepository } = createService({})
    boxTemplateRepository.find.mockResolvedValueOnce([ubuntuTemplate, debianTemplate])

    await service.hideDeprecatedSystemTemplateAliases()

    expect(boxTemplateRepository.find).toHaveBeenCalledWith({
      where: {
        general: true,
        hideFromUsers: false,
        name: expect.anything(),
      },
    })
    expect(boxTemplateRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'ubuntu-id', hideFromUsers: true }),
      expect.objectContaining({ id: 'debian-id', hideFromUsers: true }),
    ])
  })

  it('reactivates failed system templates during startup repair', async () => {
    const existingTemplate = template({
      id: 'node-id',
      name: 'boxlite/node',
      state: BoxTemplateState.ERROR,
      artifactRef: 'old-registry/boxlite/node:old',
      errorReason: 'Previous pull failed',
      initialRunnerId: 'stale-runner-id',
      size: 1.25,
    })

    const { service, boxTemplateRepository, eventEmitter } = createService({})
    boxTemplateRepository.findOne.mockResolvedValue(existingTemplate)

    await service.ensureSystemTemplate({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'boxlite/node',
      imageName: 'registry.local/boxlite/node:20260605-p0',
      displayName: 'BoxLite Node',
      description: 'Node runtime',
      capabilities: ['node', 'npm'],
    })

    expect(boxTemplateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        state: BoxTemplateState.PENDING,
        errorReason: undefined,
        artifactRef: null,
        initialRunnerId: null,
        size: null,
      }),
    )
    expect(eventEmitter.emit).toHaveBeenCalledWith(BoxTemplateEvents.ACTIVATED, expect.any(Object))
  })

  it('resumes pending system templates during startup repair', async () => {
    const existingTemplate = template({
      id: 'python-id',
      name: 'boxlite/python',
      state: BoxTemplateState.PENDING,
      imageName: 'registry.local/boxlite/python:20260605-p0',
    })

    const { service, boxTemplateRepository, eventEmitter } = createService({})
    boxTemplateRepository.findOne.mockResolvedValue(existingTemplate)

    await service.ensureSystemTemplate({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'boxlite/python',
      imageName: 'registry.local/boxlite/python:20260605-p0',
      displayName: 'BoxLite Python',
      description: 'Python runtime',
      capabilities: ['python', 'pip'],
    })

    expect(eventEmitter.emit).toHaveBeenCalledWith(BoxTemplateEvents.ACTIVATED, expect.any(Object))
  })

  it('reactivates active system templates that are missing a usable artifact ref', async () => {
    const existingTemplate = template({
      id: 'base-id',
      name: 'boxlite/base',
      state: BoxTemplateState.ACTIVE,
      artifactRef: '',
    })

    const { service, boxTemplateRepository, eventEmitter } = createService({})
    boxTemplateRepository.findOne.mockResolvedValue(existingTemplate)

    await service.ensureSystemTemplate({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'boxlite/base',
      imageName: 'registry.local/boxlite/base:20260605-p0',
      displayName: 'BoxLite Base',
      description: 'General agent runtime',
      capabilities: ['curl'],
    })

    expect(boxTemplateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        state: BoxTemplateState.PENDING,
        errorReason: undefined,
      }),
    )
    expect(eventEmitter.emit).toHaveBeenCalledWith(BoxTemplateEvents.ACTIVATED, expect.any(Object))
  })

  it('reactivates active system templates pinned to a previous internal registry host', async () => {
    const existingTemplate = template({
      id: 'base-id',
      name: 'boxlite/base',
      state: BoxTemplateState.ACTIVE,
      artifactRef: `old-registry.local/boxlite/boxlite-${'a'.repeat(64)}:boxlite`,
      initialRunnerId: 'old-runner-id',
      size: 1,
    })

    const { service, boxTemplateRepository, eventEmitter } = createService({})
    boxTemplateRepository.findOne.mockResolvedValue(existingTemplate)

    await service.ensureSystemTemplate({ id: 'admin-org-id', defaultRegionId: 'us' } as any, {
      name: 'boxlite/base',
      imageName: 'registry.local/boxlite/base:20260605-p0',
      displayName: 'BoxLite Base',
      description: 'General agent runtime',
      capabilities: ['curl'],
    })

    expect(boxTemplateRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        state: BoxTemplateState.PENDING,
        artifactRef: null,
        initialRunnerId: null,
        size: null,
      }),
    )
    expect(eventEmitter.emit).toHaveBeenCalledWith(BoxTemplateEvents.ACTIVATED, expect.any(Object))
  })
})
