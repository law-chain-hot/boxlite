/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import 'reflect-metadata'
import { GUARDS_METADATA } from '@nestjs/common/constants'

jest.mock('../../sandbox/guards/sandbox-access.guard', () => ({
  SandboxAccessGuard: class SandboxAccessGuard {},
}))
jest.mock('../../auth/combined-auth.guard', () => ({
  CombinedAuthGuard: class CombinedAuthGuard {},
}))
jest.mock('../../organization/guards/organization-resource-action.guard', () => ({
  OrganizationResourceActionGuard: class OrganizationResourceActionGuard {},
}))
jest.mock('../../common/guards/authenticated-rate-limit.guard', () => ({
  AuthenticatedRateLimitGuard: class AuthenticatedRateLimitGuard {},
}))
jest.mock('../guards/analytics-api-disabled.guard', () => ({
  AnalyticsApiDisabledGuard: class AnalyticsApiDisabledGuard {},
}))

import { SandboxAccessGuard } from '../../sandbox/guards/sandbox-access.guard'
import { SandboxTelemetryController } from './sandbox-telemetry.controller'

describe('SandboxTelemetryController', () => {
  function buildController() {
    const telemetryService = {
      getLogs: jest.fn().mockResolvedValue({ items: [] }),
      getTraces: jest.fn().mockResolvedValue({ items: [] }),
      getTraceSpans: jest.fn().mockResolvedValue([]),
      getMetrics: jest.fn().mockResolvedValue({ series: [] }),
    }

    return {
      telemetryService,
      controller: new SandboxTelemetryController(telemetryService as any),
    }
  }

  it.each([['getSandboxLogs'], ['getSandboxTraces'], ['getSandboxTraceSpans'], ['getSandboxMetrics']] as const)(
    'keeps SandboxAccessGuard on %s',
    (methodName) => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, SandboxTelemetryController.prototype[methodName]) ?? []

      expect(guards).toContain(SandboxAccessGuard)
    },
  )

  it('keeps user-facing telemetry scoped to the requested sandbox id', async () => {
    const { controller, telemetryService } = buildController()

    await controller.getSandboxMetrics('sandbox-1', {
      from: '2026-05-25T00:00:00.000Z',
      to: '2026-05-25T01:00:00.000Z',
      metricNames: ['nodejs.eventloop.utilization'],
    })

    expect(telemetryService.getMetrics).toHaveBeenCalledWith(
      'sandbox-1',
      '2026-05-25T00:00:00.000Z',
      '2026-05-25T01:00:00.000Z',
      ['nodejs.eventloop.utilization'],
    )
  })
})
