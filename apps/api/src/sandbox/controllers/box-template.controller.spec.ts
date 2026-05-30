/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { PATH_METADATA } from '@nestjs/common/constants'
import { SandboxController } from './sandbox.controller'
import { SandboxState } from '../enums/sandbox-state.enum'
import { SystemRole } from '../../user/enums/system-role.enum'
import { BoxTemplateController } from './box-template.controller'

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
  validate: jest.fn(() => true),
}))

function redisMock() {
  return {
    duplicate: jest.fn(() => ({
      subscribe: jest.fn(),
      on: jest.fn(),
    })),
  }
}

describe('BoxTemplateController', () => {
  it('publishes templates under the /templates route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BoxTemplateController)).toBe('templates')
  })
})

describe('SandboxController template creation contract', () => {
  it('allows non-admin users to create a box from a template with resource overrides', async () => {
    const sandboxService = {
      createFromTemplate: jest.fn().mockResolvedValue({
        id: 'box-id',
        state: SandboxState.STARTED,
      }),
    }
    const controller = new SandboxController({} as any, sandboxService as any, redisMock() as any)
    const organization = { id: 'org-id' }
    const createBoxDto = {
      name: 'template-box',
      templateId: 'ubuntu-template-id',
      cpu: 2,
      memory: 4,
      disk: 20,
    }

    await expect(
      controller.createSandbox(
        {
          organization,
          organizationId: organization.id,
          role: SystemRole.USER,
        } as any,
        createBoxDto as any,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'box-id' }))

    expect(sandboxService.createFromTemplate).toHaveBeenCalledWith(createBoxDto, organization)
  })
})
