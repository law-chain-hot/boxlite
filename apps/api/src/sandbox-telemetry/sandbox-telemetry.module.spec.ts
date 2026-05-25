/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import 'reflect-metadata'
import { MODULE_METADATA } from '@nestjs/common/constants'

jest.mock('./controllers/sandbox-telemetry.controller', () => ({
  SandboxTelemetryController: class SandboxTelemetryController {},
}))
jest.mock('../sandbox/sandbox.module', () => ({ SandboxModule: class SandboxModule {} }))
jest.mock('../organization/organization.module', () => ({ OrganizationModule: class OrganizationModule {} }))

import { ClickHouseModule } from '../clickhouse/clickhouse.module'
import { SandboxTelemetryModule } from './sandbox-telemetry.module'

describe('SandboxTelemetryModule', () => {
  it('imports ClickHouseModule for SandboxTelemetryService dependency resolution', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SandboxTelemetryModule) ?? []

    expect(imports).toContain(ClickHouseModule)
  })
})
