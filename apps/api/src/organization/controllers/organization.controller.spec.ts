/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { NotFoundException, UnauthorizedException } from '@nestjs/common'
import { OrganizationController } from './organization.controller'
import { OrganizationService } from '../services/organization.service'

describe('OrganizationController observability config', () => {
  function createController(organizationService: Partial<OrganizationService>) {
    return new OrganizationController(
      organizationService as OrganizationService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
  }

  it('reads sandbox auth token from a header for collector OTEL config lookups', async () => {
    const getOtelConfigBySandboxAuthToken = jest.fn().mockResolvedValue({
      endpoint: 'https://otel.example/v1',
      headers: { authorization: 'Bearer redacted' },
    })
    const controller = createController({ getOtelConfigBySandboxAuthToken })

    await expect(controller.getOtelConfigBySandboxAuthTokenHeader('sandbox-secret-token')).resolves.toEqual({
      endpoint: 'https://otel.example/v1',
      headers: { authorization: 'Bearer redacted' },
    })
    expect(getOtelConfigBySandboxAuthToken).toHaveBeenCalledWith('sandbox-secret-token')
  })

  it('rejects missing sandbox auth token header', async () => {
    const controller = createController({ getOtelConfigBySandboxAuthToken: jest.fn() })

    await expect(controller.getOtelConfigBySandboxAuthTokenHeader()).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('does not echo sandbox auth tokens in not found messages', async () => {
    const controller = createController({ getOtelConfigBySandboxAuthToken: jest.fn().mockResolvedValue(null) })

    await expect(controller.getOtelConfigBySandboxAuthTokenHeader('sandbox-secret-token')).rejects.toThrow(
      new NotFoundException('Organization OTEL config for sandbox auth token not found'),
    )
    await expect(controller.getOtelConfigBySandboxAuthToken('sandbox-secret-token')).rejects.toThrow(
      new NotFoundException('Organization OTEL config for sandbox auth token not found'),
    )
  })
})
