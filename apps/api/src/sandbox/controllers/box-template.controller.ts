/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiHeader, ApiOAuth2, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CombinedAuthGuard } from '../../auth/combined-auth.guard'
import { AuthContext } from '../../common/decorators/auth-context.decorator'
import { CustomHeaders } from '../../common/constants/header.constants'
import { AuthenticatedRateLimitGuard } from '../../common/guards/authenticated-rate-limit.guard'
import { OrganizationAuthContext } from '../../common/interfaces/auth-context.interface'
import { OrganizationResourceActionGuard } from '../../organization/guards/organization-resource-action.guard'
import { OrganizationResourcePermission } from '../../organization/enums/organization-resource-permission.enum'
import { RequiredOrganizationResourcePermissions } from '../../organization/decorators/required-organization-resource-permissions.decorator'
import { RequiredSystemRole } from '../../common/decorators/required-role.decorator'
import { SystemRole } from '../../user/enums/system-role.enum'
import { BadRequestError } from '../../exceptions/bad-request.exception'
import { Audit, TypedRequest } from '../../audit/decorators/audit.decorator'
import { AuditAction } from '../../audit/enums/audit-action.enum'
import { AuditTarget } from '../../audit/enums/audit-target.enum'
import { BoxTemplateDto } from '../dto/box-template.dto'
import { CreateBoxTemplateDto } from '../dto/create-box-template.dto'
import { PaginatedBoxTemplatesDto } from '../dto/paginated-box-templates.dto'
import { ListBoxTemplatesQueryDto } from '../dto/list-box-templates-query.dto'
import { SetBoxTemplateGeneralStatusDto } from '../dto/update-box-template.dto'
import { BoxTemplateAccessGuard } from '../guards/box-template-access.guard'
import { BoxTemplateReadAccessGuard } from '../guards/box-template-read-access.guard'
import { BoxTemplateService } from '../services/box-template.service'

// Dashboard copy presents BoxTemplate records as Images because users choose
// them as base images. The API/domain keeps templates because these records
// also own defaults, visibility, lifecycle state, and runtime artifact refs.
@ApiTags('templates')
@Controller('templates')
@ApiHeader(CustomHeaders.ORGANIZATION_ID)
@UseGuards(CombinedAuthGuard, OrganizationResourceActionGuard, AuthenticatedRateLimitGuard)
@ApiOAuth2(['openid', 'profile', 'email'])
@ApiBearerAuth()
export class BoxTemplateController {
  constructor(private readonly boxTemplateService: BoxTemplateService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create a new box template',
    operationId: 'createBoxTemplate',
  })
  @ApiResponse({
    status: 200,
    description: 'The box template has been successfully created.',
    type: BoxTemplateDto,
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.WRITE_TEMPLATES])
  @Audit({
    action: AuditAction.CREATE,
    targetType: AuditTarget.TEMPLATE,
    targetIdFromResult: (result: BoxTemplateDto) => result?.id,
    requestMetadata: {
      body: (req: TypedRequest<CreateBoxTemplateDto>) => ({
        name: req.body?.name,
        imageName: req.body?.imageName,
        entrypoint: req.body?.entrypoint,
        general: req.body?.general,
        cpu: req.body?.cpu,
        memory: req.body?.memory,
        disk: req.body?.disk,
        gpu: req.body?.gpu,
      }),
    },
  })
  async createBoxTemplate(
    @AuthContext() authContext: OrganizationAuthContext,
    @Body() createBoxTemplateDto: CreateBoxTemplateDto,
  ): Promise<BoxTemplateDto> {
    if (createBoxTemplateDto.general && authContext.role !== SystemRole.ADMIN) {
      throw new ForbiddenException('Insufficient permissions for creating general templates')
    }

    if (!createBoxTemplateDto.imageName) {
      throw new BadRequestError('Must specify an image name')
    }

    const template = await this.boxTemplateService.createFromPull(authContext.organization, createBoxTemplateDto)

    return BoxTemplateDto.fromBoxTemplateEntity(template)
  }

  @Get()
  @ApiOperation({
    summary: 'List box templates',
    operationId: 'listBoxTemplates',
  })
  @ApiResponse({
    status: 200,
    description: 'Box templates available to the organization',
    type: [BoxTemplateDto],
  })
  async listBoxTemplates(
    @AuthContext() authContext: OrganizationAuthContext,
    @Query() queryParams: ListBoxTemplatesQueryDto,
    @Request() req: { query?: Record<string, unknown> },
  ): Promise<BoxTemplateDto[] | PaginatedBoxTemplatesDto> {
    const query = req.query ?? {}
    const hasPagination = ['page', 'limit', 'name', 'sort', 'order'].some((key) =>
      Object.prototype.hasOwnProperty.call(query, key),
    )

    if (!hasPagination) {
      const templates = await this.boxTemplateService.getSystemTemplates(authContext.organizationId)
      return templates.map(BoxTemplateDto.fromBoxTemplateEntity)
    }

    const { page, limit, name, sort, order } = queryParams
    const result = await this.boxTemplateService.getAllBoxTemplates(
      authContext.organizationId,
      page,
      limit,
      { name },
      { field: sort, direction: order },
    )

    return {
      items: result.items.map(BoxTemplateDto.fromBoxTemplateEntity),
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get box template by ID or name',
    operationId: 'getBoxTemplate',
  })
  @ApiParam({
    name: 'id',
    description: 'Template ID or name',
  })
  @ApiResponse({
    status: 200,
    description: 'The box template',
    type: BoxTemplateDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  @UseGuards(BoxTemplateReadAccessGuard)
  async getBoxTemplate(
    @Param('id') templateIdOrName: string,
    @AuthContext() authContext: OrganizationAuthContext,
  ): Promise<BoxTemplateDto> {
    const template = await this.boxTemplateService.getBoxTemplateWithRegions(
      templateIdOrName,
      authContext.organizationId,
    )
    return BoxTemplateDto.fromBoxTemplateEntity(template)
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete box template',
    operationId: 'removeBoxTemplate',
  })
  @ApiParam({
    name: 'id',
    description: 'Template ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Template has been deleted',
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.DELETE_TEMPLATES])
  @UseGuards(BoxTemplateAccessGuard)
  @Audit({
    action: AuditAction.DELETE,
    targetType: AuditTarget.TEMPLATE,
    targetIdFromRequest: (req) => req.params.id,
  })
  async removeBoxTemplate(@Param('id') templateId: string): Promise<void> {
    await this.boxTemplateService.removeBoxTemplate(templateId)
  }

  @Patch(':id/general')
  @ApiOperation({
    summary: 'Set box template general status',
    operationId: 'setBoxTemplateGeneralStatus',
  })
  @ApiParam({
    name: 'id',
    description: 'Template ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Template general status has been set',
    type: BoxTemplateDto,
  })
  @RequiredSystemRole(SystemRole.ADMIN)
  @Audit({
    action: AuditAction.SET_GENERAL_STATUS,
    targetType: AuditTarget.TEMPLATE,
    targetIdFromRequest: (req) => req.params.id,
    requestMetadata: {
      body: (req: TypedRequest<SetBoxTemplateGeneralStatusDto>) => ({
        general: req.body?.general,
      }),
    },
  })
  async setBoxTemplateGeneralStatus(
    @Param('id') templateId: string,
    @Body() dto: SetBoxTemplateGeneralStatusDto,
  ): Promise<BoxTemplateDto> {
    const template = await this.boxTemplateService.setBoxTemplateGeneralStatus(templateId, dto.general)
    return BoxTemplateDto.fromBoxTemplateEntity(template)
  }

  @Post(':id/activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Activate a box template',
    operationId: 'activateBoxTemplate',
  })
  @ApiParam({
    name: 'id',
    description: 'Template ID',
  })
  @ApiResponse({
    status: 200,
    description: 'The template has been successfully activated.',
    type: BoxTemplateDto,
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.WRITE_TEMPLATES])
  @UseGuards(BoxTemplateAccessGuard)
  @Audit({
    action: AuditAction.ACTIVATE,
    targetType: AuditTarget.TEMPLATE,
    targetIdFromRequest: (req) => req.params.id,
  })
  async activateBoxTemplate(
    @Param('id') templateId: string,
    @AuthContext() authContext: OrganizationAuthContext,
  ): Promise<BoxTemplateDto> {
    const template = await this.boxTemplateService.activateBoxTemplate(templateId, authContext.organization)
    return BoxTemplateDto.fromBoxTemplateEntity(template)
  }

  @Post(':id/deactivate')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Deactivate a box template',
    operationId: 'deactivateBoxTemplate',
  })
  @ApiParam({
    name: 'id',
    description: 'Template ID',
  })
  @ApiResponse({
    status: 204,
    description: 'The template has been successfully deactivated.',
  })
  @RequiredOrganizationResourcePermissions([OrganizationResourcePermission.WRITE_TEMPLATES])
  @UseGuards(BoxTemplateAccessGuard)
  @Audit({
    action: AuditAction.DEACTIVATE,
    targetType: AuditTarget.TEMPLATE,
    targetIdFromRequest: (req) => req.params.id,
  })
  async deactivateBoxTemplate(@Param('id') templateId: string) {
    await this.boxTemplateService.deactivateBoxTemplate(templateId)
  }
}
