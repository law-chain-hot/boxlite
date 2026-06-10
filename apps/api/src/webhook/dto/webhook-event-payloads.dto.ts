/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty, ApiSchema } from '@nestjs/swagger'
import { WebhookEvent } from '../constants/webhook-events.constants'
import { BoxState } from '../../box/enums/box-state.enum'
import { BoxClass } from '../../box/enums/box-class.enum'
import { BoxTemplateState } from '../../box/enums/box-template-state.enum'
import { VolumeState } from '../../box/enums/volume-state.enum'
import { BoxCreatedEvent } from '../../box/events/box-create.event'
import { BoxStateUpdatedEvent } from '../../box/events/box-state-updated.event'
import { BoxTemplateCreatedEvent } from '../../box/events/box-template-created.event'
import { BoxTemplateStateUpdatedEvent } from '../../box/events/box-template-state-updated.event'
import { BoxTemplateRemovedEvent } from '../../box/events/box-template-removed.event'
import { VolumeCreatedEvent } from '../../box/events/volume-created.event'
import { VolumeStateUpdatedEvent } from '../../box/events/volume-state-updated.event'

export abstract class BaseWebhookEventDto {
  @ApiProperty({
    description: 'Event type identifier',
    enum: WebhookEvent,
    enumName: 'WebhookEvent',
    example: 'sandbox.created',
  })
  event: string

  @ApiProperty({
    description: 'Timestamp when the event occurred',
    example: '2025-12-19T10:30:00.000Z',
    format: 'date-time',
  })
  timestamp: string
}

@ApiSchema({ name: 'BoxCreatedWebhook' })
export class BoxCreatedWebhookDto extends BaseWebhookEventDto {
  @ApiProperty({
    description: 'Box ID',
    example: 'sandbox123',
  })
  id: string

  @ApiProperty({
    description: 'Organization ID',
    example: 'org123',
  })
  organizationId: string

  @ApiProperty({
    description: 'Box state',
    enum: BoxState,
    enumName: 'BoxState',
  })
  state: BoxState

  @ApiProperty({
    description: 'Box class',
    enum: BoxClass,
    enumName: 'BoxClass',
  })
  class: BoxClass

  @ApiProperty({
    description: 'When the box was created',
    example: '2025-12-19T10:30:00.000Z',
    format: 'date-time',
  })
  createdAt: string

  static fromEvent(event: BoxCreatedEvent, eventType: string): BoxCreatedWebhookDto {
    return {
      event: eventType,
      timestamp: new Date().toISOString(),
      id: event.box.id,
      organizationId: event.box.organizationId,
      state: event.box.state,
      class: event.box.class,
      createdAt: event.box.createdAt.toISOString(),
    }
  }
}

@ApiSchema({ name: 'BoxStateUpdatedWebhook' })
export class BoxStateUpdatedWebhookDto extends BaseWebhookEventDto {
  @ApiProperty({
    description: 'Box ID',
    example: 'sandbox123',
  })
  id: string

  @ApiProperty({
    description: 'Organization ID',
    example: 'org123',
  })
  organizationId: string

  @ApiProperty({
    description: 'Previous state',
    enum: BoxState,
    enumName: 'BoxState',
  })
  oldState: BoxState

  @ApiProperty({
    description: 'New state',
    enum: BoxState,
    enumName: 'BoxState',
  })
  newState: BoxState

  @ApiProperty({
    description: 'When the box was last updated',
    example: '2025-12-19T10:30:00.000Z',
    format: 'date-time',
  })
  updatedAt: string

  static fromEvent(event: BoxStateUpdatedEvent, eventType: string): BoxStateUpdatedWebhookDto {
    return {
      event: eventType,
      timestamp: new Date().toISOString(),
      id: event.box.id,
      organizationId: event.box.organizationId,
      oldState: event.oldState,
      newState: event.newState,
      updatedAt: event.box.updatedAt.toISOString(),
    }
  }
}

@ApiSchema({ name: 'BoxTemplateCreatedWebhook' })
export class BoxTemplateCreatedWebhookDto extends BaseWebhookEventDto {
  @ApiProperty({
    description: 'BoxTemplate ID',
    example: 'template123',
  })
  id: string

  @ApiProperty({
    description: 'BoxTemplate name',
    example: 'my-template',
  })
  name: string

  @ApiProperty({
    description: 'Organization ID',
    example: 'org123',
  })
  organizationId: string

  @ApiProperty({
    description: 'BoxTemplate state',
    enum: BoxTemplateState,
    enumName: 'BoxTemplateState',
  })
  state: BoxTemplateState

  @ApiProperty({
    description: 'When the template was created',
    example: '2025-12-19T10:30:00.000Z',
    format: 'date-time',
  })
  createdAt: string

  static fromEvent(event: BoxTemplateCreatedEvent, eventType: string): BoxTemplateCreatedWebhookDto {
    return {
      event: eventType,
      timestamp: new Date().toISOString(),
      id: event.template.id,
      name: event.template.name,
      organizationId: event.template.organizationId,
      state: event.template.state,
      createdAt: event.template.createdAt.toISOString(),
    }
  }
}

@ApiSchema({ name: 'BoxTemplateStateUpdatedWebhook' })
export class BoxTemplateStateUpdatedWebhookDto extends BaseWebhookEventDto {
  @ApiProperty({
    description: 'BoxTemplate ID',
    example: 'template123',
  })
  id: string

  @ApiProperty({
    description: 'BoxTemplate name',
    example: 'my-template',
  })
  name: string

  @ApiProperty({
    description: 'Organization ID',
    example: 'org123',
  })
  organizationId: string

  @ApiProperty({
    description: 'Previous state',
    enum: BoxTemplateState,
    enumName: 'BoxTemplateState',
  })
  oldState: BoxTemplateState

  @ApiProperty({
    description: 'New state',
    enum: BoxTemplateState,
    enumName: 'BoxTemplateState',
  })
  newState: BoxTemplateState

  @ApiProperty({
    description: 'When the template was last updated',
    example: '2025-12-19T10:30:00.000Z',
    format: 'date-time',
  })
  updatedAt: string

  static fromEvent(event: BoxTemplateStateUpdatedEvent, eventType: string): BoxTemplateStateUpdatedWebhookDto {
    return {
      event: eventType,
      timestamp: new Date().toISOString(),
      id: event.template.id,
      name: event.template.name,
      organizationId: event.template.organizationId,
      oldState: event.oldState,
      newState: event.newState,
      updatedAt: event.template.updatedAt.toISOString(),
    }
  }
}

@ApiSchema({ name: 'BoxTemplateRemovedWebhook' })
export class BoxTemplateRemovedWebhookDto extends BaseWebhookEventDto {
  @ApiProperty({
    description: 'BoxTemplate ID',
    example: 'template123',
  })
  id: string

  @ApiProperty({
    description: 'BoxTemplate name',
    example: 'my-template',
  })
  name: string

  @ApiProperty({
    description: 'Organization ID',
    example: 'org123',
  })
  organizationId: string

  @ApiProperty({
    description: 'When the template was removed',
    example: '2025-12-19T10:30:00.000Z',
    format: 'date-time',
  })
  removedAt: string

  static fromEvent(event: BoxTemplateRemovedEvent, eventType: string): BoxTemplateRemovedWebhookDto {
    return {
      event: eventType,
      timestamp: new Date().toISOString(),
      id: event.template.id,
      name: event.template.name,
      organizationId: event.template.organizationId,
      removedAt: new Date().toISOString(),
    }
  }
}

@ApiSchema({ name: 'VolumeCreatedWebhook' })
export class VolumeCreatedWebhookDto extends BaseWebhookEventDto {
  @ApiProperty({
    description: 'Volume ID',
    example: 'vol-12345678',
  })
  id: string

  @ApiProperty({
    description: 'Volume name',
    example: 'my-volume',
  })
  name: string

  @ApiProperty({
    description: 'Organization ID',
    example: 'org123',
  })
  organizationId: string

  @ApiProperty({
    description: 'Volume state',
    enum: VolumeState,
    enumName: 'VolumeState',
  })
  state: VolumeState

  @ApiProperty({
    description: 'When the volume was created',
    example: '2025-12-19T10:30:00.000Z',
    format: 'date-time',
  })
  createdAt: string

  static fromEvent(event: VolumeCreatedEvent, eventType: string): VolumeCreatedWebhookDto {
    return {
      event: eventType,
      timestamp: new Date().toISOString(),
      id: event.volume.id,
      name: event.volume.name,
      organizationId: event.volume.organizationId,
      state: event.volume.state,
      createdAt: event.volume.createdAt.toISOString(),
    }
  }
}

@ApiSchema({ name: 'VolumeStateUpdatedWebhook' })
export class VolumeStateUpdatedWebhookDto extends BaseWebhookEventDto {
  @ApiProperty({
    description: 'Volume ID',
    example: 'vol-12345678',
  })
  id: string

  @ApiProperty({
    description: 'Volume name',
    example: 'my-volume',
  })
  name: string

  @ApiProperty({
    description: 'Organization ID',
    example: 'org123',
  })
  organizationId: string

  @ApiProperty({
    description: 'Previous state',
    enum: VolumeState,
    enumName: 'VolumeState',
  })
  oldState: VolumeState

  @ApiProperty({
    description: 'New state',
    enum: VolumeState,
    enumName: 'VolumeState',
  })
  newState: VolumeState

  @ApiProperty({
    description: 'When the volume was last updated',
    example: '2025-12-19T10:30:00.000Z',
    format: 'date-time',
  })
  updatedAt: string

  static fromEvent(event: VolumeStateUpdatedEvent, eventType: string): VolumeStateUpdatedWebhookDto {
    return {
      event: eventType,
      timestamp: new Date().toISOString(),
      id: event.volume.id,
      name: event.volume.name,
      organizationId: event.volume.organizationId,
      oldState: event.oldState,
      newState: event.newState,
      updatedAt: event.volume.updatedAt.toISOString(),
    }
  }
}
