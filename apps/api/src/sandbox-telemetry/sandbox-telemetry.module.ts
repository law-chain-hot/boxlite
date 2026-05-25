/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { SandboxTelemetryController } from './controllers/sandbox-telemetry.controller'
import { SandboxTelemetryService } from './services/sandbox-telemetry.service'
import { SandboxModule } from '../sandbox/sandbox.module'
import { OrganizationModule } from '../organization/organization.module'
import { ClickHouseModule } from '../clickhouse/clickhouse.module'

@Module({
  imports: [SandboxModule, OrganizationModule, ClickHouseModule],
  controllers: [SandboxTelemetryController],
  providers: [SandboxTelemetryService],
  exports: [SandboxTelemetryService],
})
export class SandboxTelemetryModule {}
