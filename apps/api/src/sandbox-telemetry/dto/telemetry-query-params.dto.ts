/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator'
import { PageLimit } from '../../common/decorators/page-limit.decorator'
import { PageNumber } from '../../common/decorators/page-number.decorator'
import { ToArray } from '../../common/decorators/to-array.decorator'

export const TELEMETRY_FILTER_LIMIT = 20
export const TELEMETRY_METRIC_FILTER_LIMIT = 50
export const TELEMETRY_FILTER_VALUE_MAX_LENGTH = 256
export const TELEMETRY_SEARCH_MAX_LENGTH = 500

export class TelemetryQueryParamsDto {
  @ApiProperty({ type: String, format: 'date-time', description: 'Start of time range (ISO 8601)' })
  @IsDateString()
  from: string

  @ApiProperty({ type: String, format: 'date-time', description: 'End of time range (ISO 8601)' })
  @IsDateString()
  to: string

  @PageNumber(1)
  page?: number = 1

  @PageLimit(100)
  limit?: number = 100
}

export class LogsQueryParamsDto extends TelemetryQueryParamsDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Filter by severity levels (DEBUG, INFO, WARN, ERROR)',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @ArrayMaxSize(TELEMETRY_FILTER_LIMIT)
  @IsString({ each: true })
  @MaxLength(TELEMETRY_FILTER_VALUE_MAX_LENGTH, { each: true })
  severities?: string[]

  @ApiPropertyOptional({ type: String, description: 'Search in log body' })
  @IsOptional()
  @IsString()
  @MaxLength(TELEMETRY_SEARCH_MAX_LENGTH)
  search?: string
}

export class MetricsQueryParamsDto {
  @ApiProperty({ type: String, format: 'date-time', description: 'Start of time range (ISO 8601)' })
  @IsDateString()
  from: string

  @ApiProperty({ type: String, format: 'date-time', description: 'End of time range (ISO 8601)' })
  @IsDateString()
  to: string

  @ApiPropertyOptional({
    type: [String],
    description: 'Filter by metric names',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @ArrayMaxSize(TELEMETRY_METRIC_FILTER_LIMIT)
  @IsString({ each: true })
  @MaxLength(TELEMETRY_FILTER_VALUE_MAX_LENGTH, { each: true })
  metricNames?: string[]
}
