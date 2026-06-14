/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { AdminObservabilityController } from './controllers/observability.controller'
import { AdminRunnerController } from './controllers/runner.controller'
import { AdminSandboxController } from './controllers/sandbox.controller'
import { AdminObservabilityService } from './services/observability.service'
import { SandboxModule } from '../sandbox/sandbox.module'
import { RegionModule } from '../region/region.module'
import { OrganizationModule } from '../organization/organization.module'

@Module({
  imports: [SandboxModule, RegionModule, OrganizationModule],
  controllers: [AdminRunnerController, AdminSandboxController, AdminObservabilityController],
  providers: [AdminObservabilityService],
})
export class AdminModule {}
