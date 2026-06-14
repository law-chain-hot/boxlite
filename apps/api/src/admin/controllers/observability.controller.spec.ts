/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import 'reflect-metadata'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { AUDIT_CONTEXT_KEY } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { CombinedAuthGuard } from '../../auth/combined-auth.guard'
import { SystemActionGuard } from '../../auth/system-action.guard'
import { RequiredApiRole } from '../../common/decorators/required-role.decorator'
import { SystemRole } from '../../user/enums/system-role.enum'
import { AdminObservabilityController } from './observability.controller'

describe('AdminObservabilityController', () => {
  function buildController() {
    const observabilityService = {
      getStatus: jest.fn().mockResolvedValue({ backend: { configured: false, state: 'missing' }, layers: [] }),
      getLogs: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 }),
      getTraces: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0 }),
      getTraceSpans: jest.fn().mockResolvedValue([]),
      getMetrics: jest.fn().mockResolvedValue({ series: [] }),
    }

    return {
      observabilityService,
      controller: new AdminObservabilityController(observabilityService as any),
    }
  }

  it('is guarded by system admin auth and not sandbox org access', () => {
    const reflector = new Reflector()
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminObservabilityController) ?? []
    const guardNames = guards.map((guard: { name?: string }) => guard.name)

    expect(guards).toEqual([CombinedAuthGuard, SystemActionGuard])
    expect(guardNames).not.toContain('SandboxAccessGuard')
    expect(reflector.get(RequiredApiRole, AdminObservabilityController)).toEqual([SystemRole.ADMIN])
  })

  it('audits admin observability reads', () => {
    const auditContext = Reflect.getMetadata(AUDIT_CONTEXT_KEY, AdminObservabilityController.prototype.getLogs)

    expect(auditContext).toMatchObject({
      action: AuditAction.READ,
      targetType: AuditTarget.OBSERVABILITY,
    })
  })

  it('passes scoped log query filters to the service', async () => {
    const { controller, observabilityService } = buildController()

    await controller.getLogs({
      from: '2026-06-05T00:00:00.000Z',
      to: '2026-06-05T01:00:00.000Z',
      layer: 'runner',
      runnerId: 'runner-1',
      page: 3,
      limit: 50,
      severities: ['WARN'],
    })

    expect(observabilityService.getLogs).toHaveBeenCalledWith({
      from: '2026-06-05T00:00:00.000Z',
      to: '2026-06-05T01:00:00.000Z',
      layer: 'runner',
      runnerId: 'runner-1',
      page: 3,
      limit: 50,
      severities: ['WARN'],
    })
  })

  it('uses default trace pagination without requiring a sandbox id', async () => {
    const { controller, observabilityService } = buildController()

    await controller.getTraces({
      from: '2026-06-05T00:00:00.000Z',
      to: '2026-06-05T01:00:00.000Z',
    })

    expect(observabilityService.getTraces).toHaveBeenCalledWith({
      from: '2026-06-05T00:00:00.000Z',
      to: '2026-06-05T01:00:00.000Z',
      page: 1,
      limit: 100,
    })
  })
})
