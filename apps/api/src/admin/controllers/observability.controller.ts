/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, HttpCode, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOAuth2, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Audit } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { CombinedAuthGuard } from '../../auth/combined-auth.guard'
import { SystemActionGuard } from '../../auth/system-action.guard'
import { RequiredApiRole } from '../../common/decorators/required-role.decorator'
import { MetricsResponseDto } from '../../sandbox-telemetry/dto/metrics-response.dto'
import { PaginatedLogsDto } from '../../sandbox-telemetry/dto/paginated-logs.dto'
import { PaginatedTracesDto } from '../../sandbox-telemetry/dto/paginated-traces.dto'
import { TraceSpanDto } from '../../sandbox-telemetry/dto/trace-span.dto'
import { SystemRole } from '../../user/enums/system-role.enum'
import {
  AdminObservabilityLogsQueryParamsDto,
  AdminObservabilityMetricsQueryParamsDto,
  AdminObservabilityQueryParamsDto,
} from '../dto/observability-query.dto'
import {
  AdminObservabilityInvestigateQueryParamsDto,
  AdminObservabilityInvestigateResponseDto,
} from '../dto/observability-investigate.dto'
import { AdminObservabilityStatusDto } from '../dto/observability-status.dto'
import { AdminObservabilityService } from '../services/observability.service'

@ApiTags('admin')
@Controller('admin/observability')
@UseGuards(CombinedAuthGuard, SystemActionGuard)
@RequiredApiRole([SystemRole.ADMIN])
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
export class AdminObservabilityController {
  constructor(private readonly observabilityService: AdminObservabilityService) {}

  @Get('status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get admin observability backend and layer status',
    operationId: 'adminGetObservabilityStatus',
  })
  @ApiResponse({ status: 200, type: AdminObservabilityStatusDto })
  @Audit({ action: AuditAction.READ, targetType: AuditTarget.OBSERVABILITY })
  async getStatus(): Promise<AdminObservabilityStatusDto> {
    return this.observabilityService.getStatus()
  }

  @Get('logs')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get admin-scoped logs',
    operationId: 'adminGetObservabilityLogs',
  })
  @ApiResponse({ status: 200, type: PaginatedLogsDto })
  @Audit({ action: AuditAction.READ, targetType: AuditTarget.OBSERVABILITY })
  async getLogs(@Query() queryParams: AdminObservabilityLogsQueryParamsDto): Promise<PaginatedLogsDto> {
    return this.observabilityService.getLogs(queryParams)
  }

  @Get('traces')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get admin-scoped traces',
    operationId: 'adminGetObservabilityTraces',
  })
  @ApiResponse({ status: 200, type: PaginatedTracesDto })
  @Audit({ action: AuditAction.READ, targetType: AuditTarget.OBSERVABILITY })
  async getTraces(@Query() queryParams: AdminObservabilityQueryParamsDto): Promise<PaginatedTracesDto> {
    return this.observabilityService.getTraces({
      ...queryParams,
      page: queryParams.page ?? 1,
      limit: queryParams.limit ?? 100,
    })
  }

  @Get('traces/:traceId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get admin-scoped trace spans',
    operationId: 'adminGetObservabilityTraceSpans',
  })
  @ApiParam({ name: 'traceId', type: 'string' })
  @ApiResponse({ status: 200, type: [TraceSpanDto] })
  @Audit({ action: AuditAction.READ, targetType: AuditTarget.OBSERVABILITY })
  async getTraceSpans(
    @Param('traceId') traceId: string,
    @Query() queryParams: AdminObservabilityQueryParamsDto,
  ): Promise<TraceSpanDto[]> {
    return this.observabilityService.getTraceSpans(traceId, queryParams)
  }

  @Get('metrics')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Get admin-scoped metrics',
    operationId: 'adminGetObservabilityMetrics',
  })
  @ApiResponse({ status: 200, type: MetricsResponseDto })
  @Audit({ action: AuditAction.READ, targetType: AuditTarget.OBSERVABILITY })
  async getMetrics(@Query() queryParams: AdminObservabilityMetricsQueryParamsDto): Promise<MetricsResponseDto> {
    return this.observabilityService.getMetrics(queryParams)
  }

  @Get('investigate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Investigate related observability and platform state from trace or resource identifiers',
    operationId: 'adminInvestigateObservability',
  })
  @ApiResponse({ status: 200, type: AdminObservabilityInvestigateResponseDto })
  @Audit({ action: AuditAction.READ, targetType: AuditTarget.OBSERVABILITY })
  async investigate(
    @Query() queryParams: AdminObservabilityInvestigateQueryParamsDto,
  ): Promise<AdminObservabilityInvestigateResponseDto> {
    return this.observabilityService.investigate({
      ...queryParams,
      page: queryParams.page ?? 1,
      limit: queryParams.limit ?? 100,
    })
  }
}
