/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { LogEntryDto } from '../../sandbox-telemetry/dto/log-entry.dto'
import { MetricsResponseDto } from '../../sandbox-telemetry/dto/metrics-response.dto'
import { TraceSpanDto } from '../../sandbox-telemetry/dto/trace-span.dto'
import { AdminBoxItemDto, AdminMachineItemDto, AdminRunnerItemDto } from './admin-overview.dto'
import { AdminObservabilityQueryParamsDto } from './observability-query.dto'

export const ADMIN_OBSERVABILITY_SOURCES = ['clickhouse', 'postgres', 'audit', 'cloudwatch', 's3', 'xlog'] as const
export type AdminObservabilitySource = (typeof ADMIN_OBSERVABILITY_SOURCES)[number]

export const ADMIN_OBSERVABILITY_SOURCE_STATES = ['available', 'missing', 'not_configured', 'error'] as const
export type AdminObservabilitySourceState = (typeof ADMIN_OBSERVABILITY_SOURCE_STATES)[number]

@ApiSchema({ name: 'AdminObservabilityInvestigateQuery' })
export class AdminObservabilityInvestigateQueryParamsDto extends AdminObservabilityQueryParamsDto {}

@ApiSchema({ name: 'AdminObservabilityCorrelation' })
export class AdminObservabilityCorrelationDto {
  @ApiProperty({ type: [String] })
  traceIds: string[]

  @ApiProperty({ type: [String] })
  orgIds: string[]

  @ApiProperty({ type: [String] })
  sandboxIds: string[]

  @ApiProperty({ type: [String] })
  boxIds: string[]

  @ApiProperty({ type: [String] })
  runnerIds: string[]

  @ApiProperty({ type: [String] })
  machineIds: string[]

  @ApiProperty({ type: [String] })
  requestIds: string[]

  @ApiProperty({ type: [String] })
  operationIds: string[]

  @ApiProperty({ type: [String] })
  executionIds: string[]

  @ApiProperty({ type: [String] })
  jobIds: string[]

  @ApiProperty({ type: [String] })
  serviceNames: string[]
}

@ApiSchema({ name: 'AdminObservabilitySourceStatus' })
export class AdminObservabilitySourceStatusDto {
  @ApiProperty({ enum: ADMIN_OBSERVABILITY_SOURCES })
  source: AdminObservabilitySource

  @ApiProperty({ enum: ADMIN_OBSERVABILITY_SOURCE_STATES })
  state: AdminObservabilitySourceState

  @ApiPropertyOptional()
  message?: string

  @ApiPropertyOptional()
  count?: number
}

@ApiSchema({ name: 'AdminObservabilityAuditLog' })
export class AdminObservabilityAuditLogDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  actorId: string

  @ApiProperty()
  actorEmail: string

  @ApiPropertyOptional()
  organizationId?: string

  @ApiProperty()
  action: string

  @ApiPropertyOptional()
  targetType?: string

  @ApiPropertyOptional()
  targetId?: string

  @ApiPropertyOptional()
  statusCode?: number

  @ApiPropertyOptional()
  errorMessage?: string

  @ApiPropertyOptional()
  source?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  metadata?: Record<string, unknown>

  @ApiProperty()
  createdAt: Date
}

@ApiSchema({ name: 'AdminObservabilityXLog' })
export class AdminObservabilityXLogDto {
  @ApiProperty()
  source: string

  @ApiProperty()
  timestamp: string

  @ApiProperty()
  serviceName: string

  @ApiProperty()
  body: string

  @ApiPropertyOptional()
  severityText?: string

  @ApiPropertyOptional()
  traceId?: string

  @ApiPropertyOptional()
  spanId?: string

  @ApiPropertyOptional()
  executionId?: string

  @ApiPropertyOptional()
  jobId?: string

  @ApiPropertyOptional()
  stream?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  attributes?: Record<string, unknown>
}

@ApiSchema({ name: 'AdminObservabilityS3Object' })
export class AdminObservabilityS3ObjectDto {
  @ApiProperty()
  bucket: string

  @ApiProperty()
  key: string

  @ApiPropertyOptional()
  size?: number

  @ApiPropertyOptional()
  lastModified?: Date

  @ApiPropertyOptional()
  etag?: string

  @ApiPropertyOptional()
  matchedBy?: string
}

@ApiSchema({ name: 'AdminObservabilityInvestigateResponse' })
export class AdminObservabilityInvestigateResponseDto {
  @ApiProperty({ type: AdminObservabilityCorrelationDto })
  correlation: AdminObservabilityCorrelationDto

  @ApiProperty({ type: [AdminObservabilitySourceStatusDto] })
  sources: AdminObservabilitySourceStatusDto[]

  @ApiProperty({ type: [TraceSpanDto] })
  traceSpans: TraceSpanDto[]

  @ApiProperty({ type: [LogEntryDto] })
  logs: LogEntryDto[]

  @ApiProperty({ type: MetricsResponseDto })
  metrics: MetricsResponseDto

  @ApiProperty({ type: [AdminBoxItemDto] })
  boxes: AdminBoxItemDto[]

  @ApiProperty({ type: [AdminRunnerItemDto] })
  runners: AdminRunnerItemDto[]

  @ApiProperty({ type: [AdminMachineItemDto] })
  machines: AdminMachineItemDto[]

  @ApiProperty({ type: [AdminObservabilityAuditLogDto] })
  auditLogs: AdminObservabilityAuditLogDto[]

  @ApiProperty({ type: [AdminObservabilityXLogDto] })
  xlogs: AdminObservabilityXLogDto[]

  @ApiProperty({ type: [AdminObservabilityS3ObjectDto] })
  s3Objects: AdminObservabilityS3ObjectDto[]
}
