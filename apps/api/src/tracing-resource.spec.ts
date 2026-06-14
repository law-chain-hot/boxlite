/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { buildApiResourceAttributes } from './tracing-resource'

describe('buildApiResourceAttributes', () => {
  it('tags API telemetry with BoxLite layer and service identity', () => {
    const attributes = buildApiResourceAttributes({
      serviceName: 'boxlite-api',
      environment: 'dev',
      serviceInstanceId: 'host-1',
    })

    expect(attributes).toMatchObject({
      'service.name': 'boxlite-api',
      'deployment.environment.name': 'dev',
      'service.instance.id': 'host-1',
      'boxlite.layer': 'api',
    })
  })
})
