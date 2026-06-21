/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { createProxyMiddleware } from 'http-proxy-middleware'
import { CustomHeaders } from '../common/constants/header.constants'
import { BoxliteWsProxyService } from './boxlite-ws-proxy.service'

jest.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: jest.fn(() => ({
    upgrade: jest.fn(),
  })),
}))
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
  validate: jest.fn(() => true),
}))

describe('BoxliteWsProxyService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  type MockDeps = {
    apiKeyService?: Record<string, unknown>
    jwtStrategy?: Record<string, unknown>
    organizationUserService?: Record<string, unknown>
    boxService?: Record<string, unknown>
    runnerService?: Record<string, unknown>
  }

  function makeService(overrides: MockDeps = {}) {
    const apiKeyService = overrides.apiKeyService ?? {}
    const jwtStrategy = overrides.jwtStrategy ?? {}
    const organizationUserService = overrides.organizationUserService ?? {}
    const boxService = overrides.boxService ?? {}
    const runnerService = overrides.runnerService ?? {}
    return new BoxliteWsProxyService(
      apiKeyService as never,
      jwtStrategy as never,
      organizationUserService as never,
      boxService as never,
      runnerService as never,
    )
  }

  function socketDouble() {
    return { write: jest.fn(), destroy: jest.fn() }
  }

  it('rewrites public box ids to internal box ids before proxying attach upgrades to the runner', () => {
    makeService()

    const proxyOptions = jest.mocked(createProxyMiddleware).mock.calls[0][0]
    const pathRewrite = proxyOptions.pathRewrite as (path: string, req: unknown) => string
    const req = { __boxliteRunnerBoxId: 'box-uuid' }

    expect(pathRewrite('/api/v1/boxes/public-box/executions/exec-1/attach', req)).toBe(
      '/v1/boxes/box-uuid/executions/exec-1/attach',
    )
    expect(pathRewrite('/api/v1/default/boxes/public-box/executions/exec-1/attach?x=1', req)).toBe(
      '/v1/boxes/box-uuid/executions/exec-1/attach?x=1',
    )
  })

  it('authenticates JWT attach upgrades against the URL organization prefix', async () => {
    const upgrade = jest.fn()
    jest.mocked(createProxyMiddleware).mockReturnValueOnce({ upgrade } as never)
    const verifyToken = jest.fn().mockResolvedValue({ sub: 'user-1' })
    const validate = jest.fn().mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      role: 'user',
    })
    const findMembership = jest.fn().mockResolvedValue({ id: 'membership-1' })
    const findBox = jest.fn().mockResolvedValue({ id: 'box-uuid', runnerId: 'runner-1' })
    const updateLastActivityAt = jest.fn().mockResolvedValue(undefined)
    const findRunner = jest.fn().mockResolvedValue({ id: 'runner-1', apiUrl: 'http://runner', apiKey: 'runner-key' })

    const service = makeService({
      apiKeyService: {
        getApiKeyByValue: jest.fn().mockRejectedValue(new Error('not an api key')),
      },
      jwtStrategy: {
        verifyToken,
        validate,
      },
      organizationUserService: {
        findOne: findMembership,
      },
      boxService: {
        findOneByIdOrName: findBox,
        updateLastActivityAt,
      },
      runnerService: {
        findOne: findRunner,
      },
    })

    const req = {
      url: '/api/v1/org-1/boxes/public-box/executions/exec-1/attach',
      headers: { authorization: 'Bearer jwt-token' },
    } as never
    const socket = socketDouble()
    const head = Buffer.alloc(0)

    await service.upgrade(req, socket as never, head)

    expect(service.matchAttachPath('/api/v1/org-1/boxes/public-box/executions/exec-1/attach')).toEqual({
      prefix: 'org-1',
      boxId: 'public-box',
    })
    expect(verifyToken).toHaveBeenCalledWith('jwt-token')
    expect(validate.mock.calls[0][0].get(CustomHeaders.ORGANIZATION_ID.name)).toBe('org-1')
    expect(findMembership).toHaveBeenCalledWith('org-1', 'user-1')
    expect(findBox).toHaveBeenCalledWith('public-box', 'org-1')
    expect(updateLastActivityAt).toHaveBeenCalledWith('box-uuid', expect.any(Date))
    expect(findRunner).toHaveBeenCalledWith('runner-1')
    expect(upgrade).toHaveBeenCalledWith(req, socket, head)
  })

  it('keeps API-key attach upgrades working on the legacy default prefix', async () => {
    const upgrade = jest.fn()
    jest.mocked(createProxyMiddleware).mockReturnValueOnce({ upgrade } as never)
    const findMembership = jest.fn().mockResolvedValue({ id: 'membership-1' })
    const verifyToken = jest.fn()

    const service = makeService({
      apiKeyService: {
        getApiKeyByValue: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          userId: 'user-1',
          expiresAt: null,
        }),
      },
      jwtStrategy: {
        verifyToken,
      },
      organizationUserService: {
        findOne: findMembership,
      },
      boxService: {
        findOneByIdOrName: jest.fn().mockResolvedValue({ id: 'box-uuid', runnerId: 'runner-1' }),
        updateLastActivityAt: jest.fn().mockResolvedValue(undefined),
      },
      runnerService: {
        findOne: jest.fn().mockResolvedValue({ id: 'runner-1', apiUrl: 'http://runner', apiKey: 'runner-key' }),
      },
    })

    const req = {
      url: '/api/v1/default/boxes/public-box/executions/exec-1/attach',
      headers: { authorization: 'Bearer api-key-token' },
    } as never
    const socket = socketDouble()
    const head = Buffer.alloc(0)

    await service.upgrade(req, socket as never, head)

    expect(findMembership).toHaveBeenCalledWith('org-1', 'user-1')
    expect(verifyToken).not.toHaveBeenCalled()
    expect(upgrade).toHaveBeenCalledWith(req, socket, head)
  })

  it('rejects JWT attach upgrades when the user is not a member of the URL organization', async () => {
    const upgrade = jest.fn()
    jest.mocked(createProxyMiddleware).mockReturnValueOnce({ upgrade } as never)

    const service = makeService({
      apiKeyService: {
        getApiKeyByValue: jest.fn().mockRejectedValue(new Error('not an api key')),
      },
      jwtStrategy: {
        verifyToken: jest.fn().mockResolvedValue({ sub: 'user-1' }),
        validate: jest.fn().mockResolvedValue({
          userId: 'user-1',
          email: 'user@example.com',
          role: 'user',
        }),
      },
      organizationUserService: {
        findOne: jest.fn().mockResolvedValue(null),
      },
    })

    const req = {
      url: '/api/v1/org-1/boxes/public-box/executions/exec-1/attach',
      headers: { authorization: 'Bearer jwt-token' },
    } as never
    const socket = socketDouble()

    await service.upgrade(req, socket as never, Buffer.alloc(0))

    expect(upgrade).not.toHaveBeenCalled()
    expect(socket.write).toHaveBeenCalledWith(
      'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
    )
    expect(socket.destroy).toHaveBeenCalled()
  })
})
