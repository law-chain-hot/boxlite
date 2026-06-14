/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

interface ApiResourceAttributeInput {
  serviceName: string
  environment?: string
  serviceInstanceId: string
}

export function buildApiResourceAttributes(input: ApiResourceAttributeInput): Record<string, string | undefined> {
  return {
    'service.name': input.serviceName,
    'deployment.environment.name': input.environment,
    'service.instance.id': input.serviceInstanceId,
    'boxlite.layer': 'api',
  }
}
