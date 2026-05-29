/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiHeader, ApiOAuth2, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CombinedAuthGuard } from '../../auth/combined-auth.guard'
import { AuthContext } from '../../common/decorators/auth-context.decorator'
import { CustomHeaders } from '../../common/constants/header.constants'
import { AuthenticatedRateLimitGuard } from '../../common/guards/authenticated-rate-limit.guard'
import { OrganizationAuthContext } from '../../common/interfaces/auth-context.interface'
import { OrganizationResourceActionGuard } from '../../organization/guards/organization-resource-action.guard'
import { EnvironmentDto } from '../dto/environment.dto'
import { SnapshotService } from '../services/snapshot.service'

@ApiTags('environments')
@Controller('environments')
@ApiHeader(CustomHeaders.ORGANIZATION_ID)
@UseGuards(CombinedAuthGuard, OrganizationResourceActionGuard, AuthenticatedRateLimitGuard)
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
export class EnvironmentController {
  constructor(private readonly snapshotService: SnapshotService) {}

  @Get()
  @ApiOperation({
    summary: 'List system environments',
    operationId: 'listEnvironments',
  })
  @ApiResponse({
    status: 200,
    description: 'System environments available to the organization',
    type: [EnvironmentDto],
  })
  async listEnvironments(@AuthContext() authContext: OrganizationAuthContext): Promise<EnvironmentDto[]> {
    const environments = await this.snapshotService.getSystemEnvironments(authContext.organizationId)
    return environments.map(EnvironmentDto.fromSnapshot)
  }
}
