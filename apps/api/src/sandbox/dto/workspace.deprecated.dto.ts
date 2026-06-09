/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { SandboxDto } from './sandbox.dto'
import { IsOptional } from 'class-validator'
import { Sandbox } from '../entities/sandbox.entity'

@ApiSchema({ name: 'SandboxInfo' })
export class SandboxInfoDto {
  @ApiProperty({
    description: 'The creation timestamp of the project',
    example: '2023-10-01T12:00:00Z',
  })
  created: string

  @ApiProperty({
    description: 'Deprecated: The name of the sandbox',
    example: 'MySandbox',
    deprecated: true,
    default: '',
  })
  name: string

  @ApiPropertyOptional({
    description: 'Additional metadata provided by the provider',
    example: '{"key": "value"}',
    required: false,
  })
  @IsOptional()
  providerMetadata?: string
}

@ApiSchema({ name: 'Workspace' })
export class WorkspaceDto extends SandboxDto {
  @ApiPropertyOptional({
    description: 'The image used for the workspace',
    example: 'boxlite-ai/workspace:latest',
  })
  image: string

  @ApiPropertyOptional({
    description: 'Additional information about the sandbox',
    type: SandboxInfoDto,
    required: false,
  })
  @IsOptional()
  info?: SandboxInfoDto

  constructor() {
    super()
  }

  static fromSandbox(sandbox: Sandbox): WorkspaceDto {
    // Send empty string for toolboxProxyUrl as it is not needed in deprecated DTO
    const dto = super.fromSandbox(sandbox, '')
    return this.fromSandboxDto(dto)
  }

  static fromSandboxDto(sandboxDto: SandboxDto): WorkspaceDto {
    return {
      ...sandboxDto,
      image: sandboxDto.template,
      info: {
        name: sandboxDto.name,
        created: sandboxDto.createdAt,
        providerMetadata: JSON.stringify({
          state: sandboxDto.state,
          region: sandboxDto.target,
          class: sandboxDto.class,
          updatedAt: sandboxDto.updatedAt,
          cpu: sandboxDto.cpu,
          gpu: sandboxDto.gpu,
          memory: sandboxDto.memory,
          disk: sandboxDto.disk,
          autoStopInterval: sandboxDto.autoStopInterval,
          daemonVersion: sandboxDto.daemonVersion,
        }),
      },
    }
  }
}
