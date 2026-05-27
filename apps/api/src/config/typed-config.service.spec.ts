/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { TypedConfigService } from './typed-config.service'

describe('TypedConfigService ClickHouse config', () => {
  function buildService(values: Record<string, unknown>) {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    }
    return new TypedConfigService(configService as any)
  }

  it('uses a full ClickHouse URL override when provided', () => {
    const service = buildService({
      'clickhouse.url': 'https://abc123.us-east-1.aws.clickhouse.cloud:8443',
      'clickhouse.host': 'ignored.internal',
      'clickhouse.port': 8123,
      'clickhouse.protocol': 'http',
      'clickhouse.username': 'admin',
      'clickhouse.password': 'secret',
      'clickhouse.database': 'otel',
    })

    expect(service.getClickHouseConfig()).toEqual({
      url: 'https://abc123.us-east-1.aws.clickhouse.cloud:8443',
      username: 'admin',
      password: 'secret',
      database: 'otel',
    })
  })

  it('builds a URL from host, protocol, and port when no URL override exists', () => {
    const service = buildService({
      'clickhouse.url': undefined,
      'clickhouse.host': 'clickhouse.internal',
      'clickhouse.port': 8123,
      'clickhouse.protocol': 'http',
      'clickhouse.username': 'default',
      'clickhouse.password': 'secret',
      'clickhouse.database': 'otel',
    })

    expect(service.getClickHouseConfig()).toEqual({
      url: 'http://clickhouse.internal:8123',
      username: 'default',
      password: 'secret',
      database: 'otel',
    })
  })

  it('stays disabled when neither URL nor host is configured', () => {
    const service = buildService({
      'clickhouse.url': undefined,
      'clickhouse.host': undefined,
    })

    expect(service.getClickHouseConfig()).toBeNull()
  })
})
