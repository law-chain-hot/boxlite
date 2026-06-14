/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RequiredApiRole } from '../common/decorators/required-role.decorator'
import { ApiRole } from '../common/interfaces/auth-context.interface'
import { SystemRole } from '../user/enums/system-role.enum'
import { SystemActionGuard } from './system-action.guard'

@RequiredApiRole([SystemRole.ADMIN])
class AdminOnlyController {}

function contextFor(role: ApiRole): ExecutionContext {
  return {
    getClass: () => AdminOnlyController,
    getHandler: () => AdminOnlyController.prototype.constructor,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { role },
      }),
    }),
  } as unknown as ExecutionContext
}

describe('SystemActionGuard', () => {
  it('allows system admins to access admin-only routes', async () => {
    const guard = new SystemActionGuard(new Reflector())

    await expect(guard.canActivate(contextFor(SystemRole.ADMIN))).resolves.toBe(true)
  })

  it('denies ordinary users on admin-only routes', async () => {
    const guard = new SystemActionGuard(new Reflector())

    await expect(guard.canActivate(contextFor(SystemRole.USER))).resolves.toBe(false)
  })

  it('denies non-admin service roles on admin-only routes', async () => {
    const guard = new SystemActionGuard(new Reflector())

    await expect(guard.canActivate(contextFor('otel-collector'))).resolves.toBe(false)
  })
})
