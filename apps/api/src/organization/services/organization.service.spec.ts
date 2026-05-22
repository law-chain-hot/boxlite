/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { EntityManager } from 'typeorm'
import { OrganizationService } from './organization.service'
import { TypedConfigService } from '../../config/typed-config.service'
import { UserCreatedEvent } from '../../user/events/user-created.event'
import { User } from '../../user/user.entity'
import { SystemRole } from '../../user/enums/system-role.enum'
import { CreateOrganizationInternalDto } from '../dto/create-organization.internal.dto'
import { Organization } from '../entities/organization.entity'

const DEFAULT_REGION_ID = 'region-default-fallback'

function buildConfigMock(): TypedConfigService {
  const values: Record<string, unknown> = {
    defaultOrganizationQuota: {},
    organizationSandboxDefaultLimitedNetworkEgress: false,
    'defaultRegion.id': DEFAULT_REGION_ID,
  }
  return {
    getOrThrow: (key: string) => values[key],
  } as unknown as TypedConfigService
}

function buildService(): OrganizationService {
  return new OrganizationService(
    {} as never, // organizationRepository
    {} as never, // sandboxRepository
    {} as never, // snapshotRepository
    {} as never, // eventEmitter
    buildConfigMock(),
    {} as never, // redisLockProvider
    {} as never, // regionQuotaRepository
    {} as never, // regionRepository
    {} as never, // regionService
    {} as never, // encryptionService
  )
}

function buildUser(role: SystemRole): User {
  return { id: 'user-1', role, emailVerified: true } as unknown as User
}

describe('OrganizationService.handleUserCreatedEvent', () => {
  it('falls back to the configured default region when OIDC user has no region', async () => {
    const service = buildService()
    const captured: { dto?: CreateOrganizationInternalDto } = {}
    // Spy on the private creation path so we assert the fallback without a real DB.
    jest
      .spyOn(
        service as unknown as { createWithEntityManager: (...args: unknown[]) => Promise<Organization> },
        'createWithEntityManager',
      )
      .mockImplementation(async (_em, dto: CreateOrganizationInternalDto) => {
        captured.dto = dto
        return {} as Organization
      })

    const event = new UserCreatedEvent(
      {} as EntityManager,
      buildUser(SystemRole.USER),
      undefined,
      undefined, // personalOrganizationDefaultRegionId: OIDC user carries no region
    )

    await service.handleUserCreatedEvent(event)

    expect(captured.dto?.defaultRegionId).toBe(DEFAULT_REGION_ID)
  })

  it('keeps an explicitly provided region (admin / non-fallback path)', async () => {
    const service = buildService()
    const captured: { dto?: CreateOrganizationInternalDto } = {}
    jest
      .spyOn(
        service as unknown as { createWithEntityManager: (...args: unknown[]) => Promise<Organization> },
        'createWithEntityManager',
      )
      .mockImplementation(async (_em, dto: CreateOrganizationInternalDto) => {
        captured.dto = dto
        return {} as Organization
      })

    const event = new UserCreatedEvent({} as EntityManager, buildUser(SystemRole.ADMIN), undefined, 'region-explicit')

    await service.handleUserCreatedEvent(event)

    expect(captured.dto?.defaultRegionId).toBe('region-explicit')
  })
})
