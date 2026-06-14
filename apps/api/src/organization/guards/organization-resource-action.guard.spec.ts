/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { OrganizationResourceActionGuard } from './organization-resource-action.guard'

function httpContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext
}

describe('OrganizationResourceActionGuard', () => {
  it('allows runner contexts without requiring organization membership', async () => {
    const organizationService = {
      findOne: jest.fn(),
    }
    const organizationUserService = {
      findOne: jest.fn(),
    }
    const reflector = {
      get: jest.fn(),
    } as unknown as Reflector
    const guard = new OrganizationResourceActionGuard(
      organizationService as any,
      organizationUserService as any,
      reflector,
    )
    const request = {
      params: {},
      user: {
        userId: 'runner-1',
        role: 'runner',
        runnerId: 'runner-1',
        runner: { id: 'runner-1' },
      },
    }

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true)

    expect(organizationService.findOne).not.toHaveBeenCalled()
    expect(organizationUserService.findOne).not.toHaveBeenCalled()
  })
})
