/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { getSystemEnvironmentDefinition } from '../constants/system-environments'
import { Snapshot } from '../entities/snapshot.entity'

export class EnvironmentDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string

  @ApiProperty()
  displayName: string

  @ApiPropertyOptional()
  description?: string

  @ApiPropertyOptional()
  imageName?: string

  @ApiPropertyOptional()
  version?: string

  @ApiProperty()
  cpu: number

  @ApiProperty()
  gpu: number

  @ApiProperty()
  mem: number

  @ApiProperty()
  disk: number

  @ApiPropertyOptional({
    description: 'IDs of regions where the environment is available to this organization',
    type: [String],
  })
  regionIds?: string[]

  static fromSnapshot(snapshot: Snapshot): EnvironmentDto {
    const imageName = snapshot.imageName || snapshot.name
    const systemEnvironment = getSystemEnvironmentDefinition(imageName)

    return {
      id: snapshot.id,
      name: snapshot.name,
      displayName: systemEnvironment?.displayName ?? imageName,
      description: systemEnvironment?.description,
      imageName,
      version: EnvironmentDto.extractVersion(imageName),
      cpu: snapshot.cpu,
      gpu: snapshot.gpu,
      mem: snapshot.mem,
      disk: snapshot.disk,
      regionIds: snapshot.snapshotRegions?.map((sr) => sr.regionId) ?? undefined,
    }
  }

  private static extractVersion(imageName: string): string | undefined {
    const digestSeparator = '@sha256:'
    const digestIndex = imageName.indexOf(digestSeparator)
    if (digestIndex >= 0) {
      return `sha256:${imageName.slice(digestIndex + digestSeparator.length, digestIndex + digestSeparator.length + 12)}`
    }

    const lastSlashIndex = imageName.lastIndexOf('/')
    const lastColonIndex = imageName.lastIndexOf(':')

    if (lastColonIndex <= lastSlashIndex) {
      return undefined
    }

    return imageName.slice(lastColonIndex + 1)
  }
}
